"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productionOrderItemInputSchema } from "@/lib/validation";
import { getMaxFabricsForPlacement, getProductionSettings } from "@/lib/production-settings";
import { currentPeriod, formatDocNumber, getNextSeq } from "@/lib/running-number";
import { assignFabricSeq, computeSpecHash } from "@/lib/production-spec-hash";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// S3 CP1 — สร้าง ProductionOrder จาก CustomerPO (Confirm/Issue ทันที ไม่มี draft persist —
// ตาม P1 decision เดิม): ProductionOrder(identity) + ProductionOrderRevision(revNo=0,
// confirmedAt=now) + ProductionItem ต่อบรรทัดที่เลือก + ProductionItemFabric/Layer ต่อรายการ
// สเปกที่กรอก ทั้งหมดในทรานแซกชันเดียว เพราะ Rev.0 ต้อง "พร้อมผลิตจริง" ตั้งแต่สร้าง
// (ไม่ปล่อย fabric/specHash เป็น null ไว้ก่อนแล้วมาเติมทีหลัง — ตามที่ยืนยันไว้)
export async function createProductionOrder(customerPoId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productionOrder.create")) throw new Error("FORBIDDEN");

  let items: z.infer<typeof productionOrderItemInputSchema>[];
  try {
    const raw = JSON.parse(String(formData.get("itemsJson") || "[]"));
    items = z.array(productionOrderItemInputSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ").parse(raw);
  } catch {
    return { success: false, error: "กรุณาเลือกรายการอย่างน้อย 1 รายการ และกรอกสเปกการผลิตให้ครบทุกรายการ" };
  }

  const settings = await getProductionSettings();

  // Business validation ปัจจุบัน (ไม่ใช่ DB constraint) — จำนวนกุ๊นสูงสุด + จำนวนผ้าสูงสุด
  // ต่อ placement (placement-specific ไม่ใช่ global ตามที่ยืนยัน)
  for (const item of items) {
    if (item.gussetCount != null && item.gussetCount > settings.maxGussetCount) {
      return { success: false, error: `จำนวนกุ๊นต้องไม่เกิน ${settings.maxGussetCount} (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)` };
    }
    const countByPlacement = new Map<string, number>();
    for (const f of item.fabrics) countByPlacement.set(f.placement, (countByPlacement.get(f.placement) ?? 0) + 1);
    for (const [placement, count] of countByPlacement) {
      const max = getMaxFabricsForPlacement(settings, placement);
      if (count > max) {
        return { success: false, error: `ตำแหน่งผ้า "${placement}" มีได้สูงสุด ${max} ผืน (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)` };
      }
    }
  }

  const uniqueLineIds = [...new Set(items.map((i) => i.customerPoLineId))];
  const lines = await db.customerPOLine.findMany({
    where: { id: { in: uniqueLineIds }, customerPoId, active: true, lineKind: "CATALOG" },
    include: { product: { select: { id: true, sku: true, name: true, productionLabel: true } } },
  });
  const lineById = new Map(lines.map((l) => [l.id, l]));
  if (lineById.size !== uniqueLineIds.length) {
    return {
      success: false,
      error: "มีรายการที่เลือกไม่ตรงกับ P.O. นี้ หรือถูกแก้ไข/ลบไปแล้วระหว่างที่เปิดหน้าอยู่ กรุณาโหลดหน้าใหม่",
    };
  }

  const defaultStatus = settings.productionOrderStatuses[0] ?? "รอผลิต";

  const productionOrder = await db.$transaction(async (tx) => {
    const period = currentPeriod(new Date());
    const seq = await getNextSeq("PROD", period, tx);
    const prodNo = formatDocNumber("PROD", period, seq);

    const order = await tx.productionOrder.create({
      data: {
        prodNo,
        customerPoId,
        currentRevNo: 0,
        revCounter: 0,
        status: defaultStatus,
        createdById: user.id,
      },
    });

    const revision = await tx.productionOrderRevision.create({
      data: {
        productionOrderId: order.id,
        revNo: 0,
        actorId: user.id,
        confirmedAt: new Date(),
      },
    });

    for (const item of items) {
      const line = lineById.get(item.customerPoLineId)!;
      const fabricsWithSeq = assignFabricSeq(item.fabrics);
      const layersWithSeq = item.layers.map((l, idx) => ({ ...l, seq: idx }));
      const specHash = computeSpecHash({
        productId: line.productId,
        gussetCount: item.gussetCount ?? null,
        thickness: item.thickness || null,
        fabrics: fabricsWithSeq,
        layers: layersWithSeq,
      });

      const createdItem = await tx.productionItem.create({
        data: {
          revisionId: revision.id,
          customerPoLineId: line.id,
          productId: line.productId,
          size: line.size,
          isCustomSize: line.isCustomSize,
          customW: line.customW,
          customL: line.customL,
          customThickness: line.customThickness,
          qty: item.qty,
          gussetCount: item.gussetCount ?? null,
          thickness: item.thickness || null,
          specHash,
          note: item.note || null,
          skuSnapshot: line.product?.sku ?? null,
          nameSnapshot: line.product?.name ?? null,
          productionLabelSnapshot: line.product?.productionLabel ?? line.product?.name ?? null,
        },
      });

      await tx.productionItemFabric.createMany({
        data: fabricsWithSeq.map((f) => ({
          itemId: createdItem.id,
          placement: f.placement,
          seq: f.seq,
          fabricName: f.fabricName,
          fabricCode: f.fabricCode || null,
          waddingWeight: f.waddingWeight || null,
          foamThickness: f.foamThickness || null,
          colorNote: f.colorNote || null,
          displayOverride: f.displayOverride || null,
        })),
      });

      await tx.productionItemLayer.createMany({
        data: layersWithSeq.map((l) => ({
          itemId: createdItem.id,
          seq: l.seq,
          material: l.material,
          spec: l.spec,
          displayOverride: l.displayOverride || null,
        })),
      });
    }

    const po = await tx.customerPO.findUniqueOrThrow({ where: { id: customerPoId }, select: { customerId: true, branchId: true } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "ProductionOrder",
        recordId: order.id,
        customerId: po.customerId,
        branchId: po.branchId,
        customerPoId,
        newValue: { prodNo, itemCount: items.length },
      },
    });

    return order;
  });

  revalidatePath(`/production/orders/${customerPoId}`);
  revalidatePath("/production/production-orders");
  redirect(`/production/production-orders/${productionOrder.id}`);
}
