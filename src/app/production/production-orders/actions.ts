"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma, CustomerPOLine, Product } from "@prisma/client";
import { can } from "@/lib/permissions";
import { productionOrderItemInputSchema } from "@/lib/validation";
import { getMaxFabricsForPlacement, getProductionSettings, type ProductionSettings } from "@/lib/production-settings";
import { currentPeriod, formatDocNumber, getNextSeq } from "@/lib/running-number";
import { assignFabricSeq, computeSpecHash } from "@/lib/production-spec-hash";
import { resolveAccessHead } from "@/lib/product-company-access";
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

type LineWithProduct = CustomerPOLine & { product: Pick<Product, "id" | "sku" | "name" | "productionLabel" | "parentProductId" | "modelId"> | null };

/** Business validation ปัจจุบัน (ไม่ใช่ DB constraint) — จำนวนกุ๊นสูงสุด + จำนวนผ้าสูงสุดต่อ
 * placement (placement-specific ไม่ใช่ global) ใช้ร่วมกันทั้ง create และ revise เพื่อไม่ให้
 * เกณฑ์ 2 ทางเบี้ยวกันในอนาคต */
function validateItemCaps(
  items: z.infer<typeof productionOrderItemInputSchema>[],
  settings: Pick<ProductionSettings, "maxGussetCount" | "maxFabricsPerPlacement">
): string | null {
  for (const item of items) {
    if (item.gussetCount != null && item.gussetCount > settings.maxGussetCount) {
      return `จำนวนกุ๊นต้องไม่เกิน ${settings.maxGussetCount} (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)`;
    }
    const countByPlacement = new Map<string, number>();
    for (const f of item.fabrics) countByPlacement.set(f.placement, (countByPlacement.get(f.placement) ?? 0) + 1);
    for (const [placement, count] of countByPlacement) {
      const max = getMaxFabricsForPlacement(settings, placement);
      if (count > max) return `ตำแหน่งผ้า "${placement}" มีได้สูงสุด ${max} ผืน (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)`;
    }
  }
  return null;
}

/** สร้าง ProductionItem + Fabric + Layer ทั้งชุดของ 1 Revision — ใช้ร่วมกันทั้ง create (Rev.0)
 * และ revise (Rev.N ใหม่) เพราะเนื้อหาที่ต้อง snapshot เหมือนกันทุกประการ ต่างแค่ revisionId
 * ที่ผูก (ห้ามแตะ Revision เก่าเด็ดขาด — สร้างแถวใหม่ทั้งชุดเสมอตามสถาปัตยกรรม immutable) */
async function createItemsForRevision(
  tx: Prisma.TransactionClient,
  revisionId: string,
  items: z.infer<typeof productionOrderItemInputSchema>[],
  lineById: Map<string, LineWithProduct>
) {
  for (const item of items) {
    const line = lineById.get(item.customerPoLineId)!;
    const fabricsWithSeq = assignFabricSeq(item.fabrics);
    const layersWithSeq = item.layers.map((l, idx) => ({ ...l, seq: idx }));
    // "รุ่น" ที่เข้า specHash ต้องเป็น Family Head ไม่ใช่ Product.id ตรงๆ (ต่างไซส์ของรุ่น
    // เดียวกันเป็นคนละแถว Product) — reuse resolveAccessHead() เดิม (Family Head XOR:
    // parentProductId > modelId > ตัวเอง) ไม่ใช่คิด familyId ใหม่
    const familyHead = line.product ? resolveAccessHead(line.product) : null;
    const productFamilyKey = familyHead ? `${familyHead.kind}:${familyHead.id}` : null;
    const specHash = computeSpecHash({
      productFamilyKey,
      gussetCount: item.gussetCount ?? null,
      thickness: item.thickness || null,
      fabrics: fabricsWithSeq,
      layers: layersWithSeq,
    });

    const createdItem = await tx.productionItem.create({
      data: {
        revisionId,
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
        printVisible: f.printVisible,
      })),
    });

    await tx.productionItemLayer.createMany({
      data: layersWithSeq.map((l) => ({
        itemId: createdItem.id,
        seq: l.seq,
        material: l.material,
        spec: l.spec,
        displayOverride: l.displayOverride || null,
        printVisible: l.printVisible,
      })),
    });
  }
}

async function parseAndValidateItems(formData: FormData): Promise<
  | { ok: true; items: z.infer<typeof productionOrderItemInputSchema>[] }
  | { ok: false; error: string }
> {
  let items: z.infer<typeof productionOrderItemInputSchema>[];
  try {
    const raw = JSON.parse(String(formData.get("itemsJson") || "[]"));
    items = z.array(productionOrderItemInputSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ").parse(raw);
  } catch {
    return { ok: false, error: "กรุณาเลือกรายการอย่างน้อย 1 รายการ และกรอกสเปกการผลิตให้ครบทุกรายการ" };
  }
  const settings = await getProductionSettings();
  const capError = validateItemCaps(items, settings);
  if (capError) return { ok: false, error: capError };
  return { ok: true, items };
}

// S3 CP1 — สร้าง ProductionOrder จาก CustomerPO (Confirm/Issue ทันที ไม่มี draft persist —
// ตาม P1 decision เดิม): ProductionOrder(identity) + ProductionOrderRevision(revNo=0,
// confirmedAt=now) + ProductionItem ต่อบรรทัดที่เลือก + ProductionItemFabric/Layer ต่อรายการ
// สเปกที่กรอก ทั้งหมดในทรานแซกชันเดียว เพราะ Rev.0 ต้อง "พร้อมผลิตจริง" ตั้งแต่สร้าง
// (ไม่ปล่อย fabric/specHash เป็น null ไว้ก่อนแล้วมาเติมทีหลัง — ตามที่ยืนยันไว้)
export async function createProductionOrder(customerPoId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productionOrder.create")) throw new Error("FORBIDDEN");

  const parsed = await parseAndValidateItems(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { items } = parsed;

  const uniqueLineIds = [...new Set(items.map((i) => i.customerPoLineId))];
  const lines = await db.customerPOLine.findMany({
    where: { id: { in: uniqueLineIds }, customerPoId, active: true, lineKind: "CATALOG" },
    include: { product: { select: { id: true, sku: true, name: true, productionLabel: true, parentProductId: true, modelId: true } } },
  });
  const lineById = new Map(lines.map((l) => [l.id, l as LineWithProduct]));
  if (lineById.size !== uniqueLineIds.length) {
    return {
      success: false,
      error: "มีรายการที่เลือกไม่ตรงกับ P.O. นี้ หรือถูกแก้ไข/ลบไปแล้วระหว่างที่เปิดหน้าอยู่ กรุณาโหลดหน้าใหม่",
    };
  }

  const settings = await getProductionSettings();
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

    await createItemsForRevision(tx, revision.id, items, lineById);

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

// สัญญาณ "มีคนออก Rev ใหม่ไปแล้วระหว่างที่เปิดฟอร์มอยู่" — Pattern เดียวกับ ConcurrentEditError
// ของ updateCustomerPO (CustomerPO.version) แต่ที่นี่ CAS บน ProductionOrder.currentRevNo แทน
class ConcurrentReviseError extends Error {}

// S3 CP3 — ออก Revision ใหม่: สร้างแถว ProductionItem/Fabric/Layer ชุดใหม่ทั้งหมดผูกกับ
// ProductionOrderRevision แถวใหม่ (revNo = revCounter อะตอมิก) ไม่แตะ/ไม่ลบ Revision เดิม
// เลยแม้แต่แถวเดียว (ตามสถาปัตยกรรม immutable ที่ยืนยันไว้ — Rev เก่าต้อง reconstruct ได้ครบ
// เสมอ) currentRevNo ขยับไปชี้ Rev ใหม่แบบ atomic ในทรานแซกชันเดียวกับการสร้างแถวทั้งหมด —
// concurrency ใช้ compare-and-swap บน currentRevNo (Pattern เดียวกับ CustomerPO.version)
export async function reviseProductionOrder(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productionOrder.revise")) throw new Error("FORBIDDEN");

  const baseRevNo = Number(formData.get("baseRevNo"));
  if (!Number.isFinite(baseRevNo)) {
    return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง" };
  }

  const reason = String(formData.get("reason") || "").trim();
  if (!reason) {
    return { success: false, error: "กรุณากรอกเหตุผลที่ออก Revision ใหม่", fieldErrors: { reason: "กรุณากรอกเหตุผลที่ออก Revision ใหม่" } };
  }

  const parsed = await parseAndValidateItems(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { items } = parsed;

  const order = await db.productionOrder.findUnique({ where: { id }, select: { customerPoId: true } });
  if (!order) return { success: false, error: "ไม่พบใบสั่งผลิตนี้ กรุณาโหลดหน้าใหม่" };

  const uniqueLineIds = [...new Set(items.map((i) => i.customerPoLineId))];
  const lines = await db.customerPOLine.findMany({
    where: { id: { in: uniqueLineIds }, customerPoId: order.customerPoId, active: true, lineKind: "CATALOG" },
    include: { product: { select: { id: true, sku: true, name: true, productionLabel: true, parentProductId: true, modelId: true } } },
  });
  const lineById = new Map(lines.map((l) => [l.id, l as LineWithProduct]));
  if (lineById.size !== uniqueLineIds.length) {
    return {
      success: false,
      error: "มีรายการที่เลือกไม่ตรงกับ P.O. นี้ หรือถูกแก้ไข/ลบไปแล้วระหว่างที่เปิดหน้าอยู่ กรุณาโหลดหน้าใหม่",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const cas = await tx.productionOrder.updateMany({
        where: { id, currentRevNo: baseRevNo },
        data: { currentRevNo: { increment: 1 }, revCounter: { increment: 1 } },
      });
      if (cas.count === 0) throw new ConcurrentReviseError();

      const updated = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
      const newRevNo = updated.revCounter; // เพิ่งเพิ่มแบบ atomic ข้างบน ตรงกับ currentRevNo ใหม่พอดี

      const revision = await tx.productionOrderRevision.create({
        data: { productionOrderId: id, revNo: newRevNo, actorId: user.id, reason, confirmedAt: new Date() },
      });

      await createItemsForRevision(tx, revision.id, items, lineById);

      const po = await tx.customerPO.findUniqueOrThrow({ where: { id: order.customerPoId }, select: { customerId: true, branchId: true } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "ProductionOrder",
          recordId: id,
          customerId: po.customerId,
          branchId: po.branchId,
          customerPoId: order.customerPoId,
          oldValue: { revNo: newRevNo - 1 },
          newValue: { revNo: newRevNo, itemCount: items.length, reason },
        },
      });
    });
  } catch (error) {
    if (error instanceof ConcurrentReviseError) {
      return {
        success: false,
        error: "ใบสั่งผลิตนี้ถูกออก Revision ใหม่โดยคนอื่นระหว่างที่คุณเปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง (ไม่มีการรวมข้อมูลอัตโนมัติ)",
      };
    }
    throw error;
  }

  revalidatePath(`/production/orders/${order.customerPoId}`);
  revalidatePath("/production/production-orders");
  revalidatePath(`/production/production-orders/${id}`);
  redirect(`/production/production-orders/${id}`);
}
