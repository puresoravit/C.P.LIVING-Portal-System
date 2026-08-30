"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerPOSchema, customerPOLineInputSchema, customerPOLineUpdateInputSchema } from "@/lib/validation";
import { getNextBranchOrderSeq } from "@/lib/branch-order-sequence";
import { getProductionSettings } from "@/lib/production-settings";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";
import type { RevisionChangeType } from "@prisma/client";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Production Module (P1/S2) — Checkpoint 1: สร้าง CustomerPO ใหม่เท่านั้น (ยังไม่มีแก้ไข/
// Revision ในรอบนี้ — เก็บไว้ Checkpoint 2 ตามที่ตกลง) ทุกอย่างในทรานแซกชันเดียว: header +
// lines + CustomerPORevision(revNo=0) + CustomerPORevisionChange ต่อบรรทัด (ADD_LINE) —
// ตั้งใจสร้าง revision ตั้งแต่ใบแรกเพื่อให้ประวัติเริ่มนับจากวันสร้างจริง ไม่ใช่นับจากตอนแก้
// ครั้งแรก (ตรงกับกฎข้อ 3 "ห้ามเขียนทับประวัติ" — ต้องมี "ก่อน" ให้เทียบเสมอ)
export async function createCustomerPO(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customerPo.create")) throw new Error("FORBIDDEN");

  const raw = customerPOSchema.safeParse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    dateMode: formData.get("dateMode") || "UNSET",
    requestedDate: formData.get("requestedDate") || undefined,
    urgency: formData.get("urgency") === "1",
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const header = raw.data;

  let lines: z.infer<typeof customerPOLineInputSchema>[];
  try {
    const linesRaw = JSON.parse(String(formData.get("linesJson") || "[]"));
    lines = z.array(customerPOLineInputSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ").parse(linesRaw);
  } catch {
    return {
      success: false,
      error: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ และเลือกสินค้าหรือกรอกชื่อสินค้าให้ครบทุกบรรทัด",
    };
  }

  // S3 CP1 — ก่อนหน้านี้ hardcode "OPEN" ตรงๆ ขัดกับ comment ของ schema เอง ("ค่าตั้งค่าใน
  // AppSetting ไม่ hardcode") แก้ให้ดึงจาก production-settings.ts (รายการแรก = default)
  const { customerPoStatuses } = await getProductionSettings();
  const defaultStatus = customerPoStatuses[0] ?? "เปิดงาน";

  const po = await db.$transaction(async (tx) => {
    const orderSeqNo = header.branchId ? await getNextBranchOrderSeq(header.branchId, tx) : null;

    const created = await tx.customerPO.create({
      data: {
        customerId: header.customerId,
        branchId: header.branchId || null,
        dateMode: header.dateMode,
        requestedDate: header.requestedDate ? new Date(header.requestedDate) : null,
        orderSeqNo,
        urgency: header.urgency,
        status: defaultStatus,
        createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            lineKind: l.lineKind,
            productId: l.lineKind === "CATALOG" ? l.productId : null,
            rawProductText: l.lineKind === "UNRESOLVED" ? l.rawProductText : null,
            size: l.size || null,
            qtyCurrent: l.qtyCurrent,
            urgency: l.urgency,
            requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
            note: l.note || null,
          })),
        },
      },
      include: { lines: true },
    });

    const revision = await tx.customerPORevision.create({
      data: { customerPoId: created.id, revNo: 0, actorId: user.id },
    });

    await tx.customerPORevisionChange.createMany({
      data: created.lines.map((line) => ({
        revisionId: revision.id,
        orderLineId: line.id,
        changeType: "ADD_LINE" as const,
        qtyDelta: line.qtyCurrent,
        before: {},
        after: {
          lineKind: line.lineKind,
          productId: line.productId,
          rawProductText: line.rawProductText,
          size: line.size,
          qty: line.qtyCurrent,
        },
      })),
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "CustomerPO",
        recordId: created.id,
        customerId: created.customerId,
        branchId: created.branchId,
        customerPoId: created.id,
        newValue: { lineCount: lines.length },
      },
    });

    return created;
  });

  revalidatePath("/production/orders");
  redirect(`/production/orders/${po.id}`);
}

// ---------------------------------------------------------------------------
// S2 Checkpoint 2 — แก้ไข CustomerPO พร้อม Revision History + Optimistic Concurrency
// ---------------------------------------------------------------------------

type ExistingLineLike = {
  id: string;
  lineKind: string;
  productId: string | null;
  rawProductText: string | null;
  size: string | null;
  qtyCurrent: number;
  urgency: boolean;
  requiredDate: Date | null;
  note: string | null;
};

function lineSnapshot(line: ExistingLineLike) {
  return {
    lineKind: line.lineKind,
    productId: line.productId,
    rawProductText: line.rawProductText,
    size: line.size,
    qty: line.qtyCurrent,
    urgency: line.urgency,
    requiredDate: line.requiredDate?.toISOString() ?? null,
    note: line.note,
  };
}

function lineDiffers(existing: ExistingLineLike, next: Omit<ExistingLineLike, "id">): boolean {
  return (
    existing.lineKind !== next.lineKind ||
    (existing.productId ?? null) !== (next.productId ?? null) ||
    (existing.rawProductText ?? null) !== (next.rawProductText ?? null) ||
    (existing.size ?? null) !== (next.size ?? null) ||
    existing.qtyCurrent !== next.qtyCurrent ||
    existing.urgency !== next.urgency ||
    (existing.requiredDate?.toISOString() ?? null) !== (next.requiredDate?.toISOString() ?? null) ||
    (existing.note ?? null) !== (next.note ?? null)
  );
}

// สัญญาณ "มีคนแก้ไปก่อนแล้วระหว่างที่เปิดฟอร์มอยู่" — จับแยกจาก Error ที่ไม่คาดคิดจริงๆ
// (ตาม Pattern ActionResult เดิม: Error ที่คาดไว้แล้ว return แทนการ throw)
class ConcurrentEditError extends Error {}
// CP0 — เอกสารถูกยกเลิกแล้ว ห้ามแก้/เดินงานต่อ (terminal)
class CancelledDocError extends Error {}

// ข้อ 3 (S2 Checkpoint 2 requirement) — Create ครั้งแรก = Rev.0 (ทำแล้วใน createCustomerPO)
// การแก้แต่ละครั้งต้องมี Revision ชัดเจน ทุก Mutation (Header + Lines + Revision + Audit)
// อยู่ในทรานแซกชันเดียว concurrent edit reject+ให้ reload ไม่ auto-merge (compare-and-swap
// บน CustomerPO.version — Pattern เดียวกับ confirmOrder/cancelOrder ของ Billing ที่ใช้ CAS
// บน status แต่ที่นี่ใช้ version number แทนตามที่ตัดสินใจไว้ใน
// docs/production-module/02-P1-schema-decisions.md)
export async function updateCustomerPO(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customerPo.editDraft")) throw new Error("FORBIDDEN");

  const raw = customerPOSchema.safeParse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    dateMode: formData.get("dateMode") || "UNSET",
    requestedDate: formData.get("requestedDate") || undefined,
    urgency: formData.get("urgency") === "1",
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const header = raw.data;

  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) {
    return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง" };
  }

  const reason = String(formData.get("reason") || "").trim();
  if (!reason) {
    return { success: false, error: "กรุณากรอกเหตุผลที่แก้ไข", fieldErrors: { reason: "กรุณากรอกเหตุผลที่แก้ไข" } };
  }

  let lines: z.infer<typeof customerPOLineUpdateInputSchema>[];
  try {
    const linesRaw = JSON.parse(String(formData.get("linesJson") || "[]"));
    lines = z.array(customerPOLineUpdateInputSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ").parse(linesRaw);
  } catch {
    return {
      success: false,
      error: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ และเลือกสินค้าหรือกรอกชื่อสินค้าให้ครบทุกบรรทัด",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      // CP0 — ออเดอร์ที่ยกเลิกแล้วเป็น terminal แก้ไขไม่ได้ (จะกลับมาสั่งใหม่ = สร้างออเดอร์ใหม่
      // ตาม D4) เช็คใน tx + ใส่ใน WHERE ของ CAS ซ้ำอีกชั้นกัน race กับการยกเลิกที่มาพร้อมกัน
      const current = await tx.customerPO.findUniqueOrThrow({ where: { id }, select: { cancelledAt: true } });
      if (current.cancelledAt) throw new CancelledDocError();

      // Compare-and-swap: ถ้า version ไม่ตรง (มีคนแก้ไปแล้วระหว่างเปิดฟอร์มอยู่) count = 0
      const cas = await tx.customerPO.updateMany({
        where: { id, version, cancelledAt: null },
        data: {
          customerId: header.customerId,
          branchId: header.branchId || null,
          dateMode: header.dateMode,
          requestedDate: header.requestedDate ? new Date(header.requestedDate) : null,
          urgency: header.urgency,
          version: { increment: 1 },
          revCounter: { increment: 1 },
        },
      });
      if (cas.count === 0) throw new ConcurrentEditError();

      const existing = await tx.customerPO.findUniqueOrThrow({
        where: { id },
        include: { lines: { where: { active: true } } },
      });
      const revNo = existing.revCounter; // ค่าที่เพิ่งเพิ่มจาก updateMany ข้างบน (atomic แล้ว)

      const submittedIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string));
      const changes: { orderLineId: string | null; changeType: RevisionChangeType; qtyDelta: number | null; before: object; after: object }[] = [];

      // 1) บรรทัดเดิมที่หายไปจากที่ส่งมา = ถูกเอาออกระหว่างแก้ → CANCEL_LINE + Soft-delete
      //    (active=false) เท่านั้น "ห้าม Hard Delete" — id ต้องคงอยู่ถาวรเพราะถูกอ้างอิงต่อ
      //    2 ทาง: (1) CustomerPORevisionChange.orderLineId ในทุก Revision ที่เคยแตะบรรทัดนี้
      //    — Hard Delete จะทำให้ FK (ON DELETE SET NULL) ล้าง orderLineId เป็น null พร้อมกัน
      //    ทุกแถว ตัดเธรดประวัติของบรรทัดเดียวกันข้ามหลาย Revision ขาดจากกัน (2)
      //    ProductionItem.customerPoLineId (P2 เตรียมไว้ใน schema แล้ว) ต้องอ้าง identity
      //    บรรทัดต้นทางถาวรข้ามเวลา — Query/แสดงผลหน้าจอทุกจุดต้อง filter active:true เสมอ
      const toDelete = existing.lines.filter((l) => !submittedIds.has(l.id));
      for (const line of toDelete) {
        changes.push({ orderLineId: line.id, changeType: "CANCEL_LINE", qtyDelta: -line.qtyCurrent, before: lineSnapshot(line), after: {} });
      }
      if (toDelete.length > 0) {
        await tx.customerPOLine.updateMany({ where: { id: { in: toDelete.map((l) => l.id) } }, data: { active: false } });
      }

      // 2) บรรทัดเดิมที่ยังอยู่ — อัปเดตเฉพาะที่เนื้อหาเปลี่ยนจริง (กันประวัติเป็น Noise)
      for (const l of lines) {
        if (!l.id) continue;
        const existingLine = existing.lines.find((e) => e.id === l.id);
        if (!existingLine) continue;
        const nextData = {
          lineKind: l.lineKind,
          productId: l.lineKind === "CATALOG" ? l.productId ?? null : null,
          rawProductText: l.lineKind === "UNRESOLVED" ? l.rawProductText ?? null : null,
          size: l.size || null,
          qtyCurrent: l.qtyCurrent,
          urgency: l.urgency,
          requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
          note: l.note || null,
        };
        if (!lineDiffers(existingLine, nextData)) continue;

        const resolvedNow = existingLine.lineKind === "UNRESOLVED" && nextData.lineKind === "CATALOG" && !!nextData.productId;
        changes.push({
          orderLineId: existingLine.id,
          changeType: resolvedNow ? "RESOLVE_PRODUCT" : "QTY_CHANGE",
          qtyDelta: nextData.qtyCurrent - existingLine.qtyCurrent,
          before: lineSnapshot(existingLine),
          after: lineSnapshot({ ...existingLine, ...nextData }),
        });
        await tx.customerPOLine.update({ where: { id: existingLine.id }, data: nextData });
      }

      // 3) บรรทัดใหม่ที่เพิ่มระหว่างแก้ (ไม่มี id) → ADD_LINE
      for (const l of lines) {
        if (l.id) continue;
        const created = await tx.customerPOLine.create({
          data: {
            customerPoId: id,
            lineKind: l.lineKind,
            productId: l.lineKind === "CATALOG" ? l.productId ?? null : null,
            rawProductText: l.lineKind === "UNRESOLVED" ? l.rawProductText ?? null : null,
            size: l.size || null,
            qtyCurrent: l.qtyCurrent,
            urgency: l.urgency,
            requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
            note: l.note || null,
          },
        });
        changes.push({ orderLineId: created.id, changeType: "ADD_LINE", qtyDelta: created.qtyCurrent, before: {}, after: lineSnapshot(created) });
      }

      // 4) หัวเอกสารเปลี่ยน (ลูกค้า/สาขา/วันที่/ด่วน) → บันทึกเป็น ORDER_LEVEL แยกจากบรรทัด
      const headerChanged =
        existing.customerId !== header.customerId ||
        (existing.branchId ?? null) !== (header.branchId || null) ||
        existing.dateMode !== header.dateMode ||
        existing.urgency !== header.urgency ||
        (existing.requestedDate?.toISOString() ?? null) !== (header.requestedDate ? new Date(header.requestedDate).toISOString() : null);
      if (headerChanged) {
        changes.push({
          orderLineId: null,
          changeType: "ORDER_LEVEL",
          qtyDelta: null,
          before: {
            customerId: existing.customerId,
            branchId: existing.branchId,
            dateMode: existing.dateMode,
            requestedDate: existing.requestedDate?.toISOString() ?? null,
            urgency: existing.urgency,
          },
          after: {
            customerId: header.customerId,
            branchId: header.branchId || null,
            dateMode: header.dateMode,
            requestedDate: header.requestedDate ? new Date(header.requestedDate).toISOString() : null,
            urgency: header.urgency,
          },
        });
      }

      const revision = await tx.customerPORevision.create({
        data: { customerPoId: id, revNo, actorId: user.id, reason },
      });

      if (changes.length > 0) {
        await tx.customerPORevisionChange.createMany({
          data: changes.map((c) => ({
            revisionId: revision.id,
            orderLineId: c.orderLineId,
            changeType: c.changeType,
            qtyDelta: c.qtyDelta,
            before: c.before,
            after: c.after,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "CustomerPO",
          recordId: id,
          customerId: header.customerId,
          branchId: header.branchId || null,
          customerPoId: id,
          oldValue: { revNo: revNo - 1 },
          newValue: { revNo, changeCount: changes.length, reason },
        },
      });
    });
  } catch (error) {
    if (error instanceof CancelledDocError) {
      return { success: false, error: "ออเดอร์นี้ถูกยกเลิกแล้ว แก้ไขไม่ได้ — ถ้าลูกค้ากลับมาสั่งใหม่ให้สร้างออเดอร์ใหม่" };
    }
    if (error instanceof ConcurrentEditError) {
      return {
        success: false,
        error: "ออเดอร์นี้ถูกแก้ไขโดยคนอื่นระหว่างที่คุณเปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง (ไม่มีการรวมข้อมูลอัตโนมัติ)",
      };
    }
    throw error;
  }

  revalidatePath("/production/orders");
  revalidatePath(`/production/orders/${id}`);
  redirect(`/production/orders/${id}`);
}

// ---------------------------------------------------------------------------
// CP0 — ยกเลิกออเดอร์ลูกค้า (docs 05/07 + D1-D5, Owner อนุมัติ 2026-08-30)
// ---------------------------------------------------------------------------

// ยกเลิกไปแล้ว = ผลลัพธ์ที่ผู้ใช้ต้องการเกิดแล้ว — แจ้งเฉยๆ ไม่ใช่ error ระบบ (pattern
// cancelOrder ของ Billing) — แยก class จาก ConcurrentEditError เพราะข้อความต่างกัน
class AlreadyCancelledError extends Error {}
// Lock 3: มีใบที่เริ่มผลิตแล้วแต่ผู้กดไม่มีสิทธิ์ production.cancelStarted — โยนใน
// transaction เพื่อให้ rollback ทั้งก้อน ห้ามเกิด partial cancellation เด็ดขาด
class CancelStartedForbiddenError extends Error {}

// Cancel = terminal fact (D4 ห้าม reopen) เก็บเป็น timestamp ไม่แตะ status text เดิม —
// cascade ทางเดียวไปยังใบสั่งผลิตที่ยัง active ทุกใบใน transaction เดียว (D3/Lock 3) —
// enforce สิทธิ์ผ่าน can() เท่านั้น ไม่เทียบชื่อ role (Lock 1)
export async function cancelCustomerPO(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customerPo.cancel")) throw new Error("FORBIDDEN");

  const reason = String(formData.get("reason") || "").trim();
  if (!reason) {
    return { success: false, error: "กรุณากรอกเหตุผลที่ยกเลิก", fieldErrors: { reason: "กรุณากรอกเหตุผลที่ยกเลิก" } };
  }
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) {
    return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง" };
  }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.customerPO.findUniqueOrThrow({
        where: { id },
        select: { cancelledAt: true, customerId: true, branchId: true },
      });
      if (existing.cancelledAt) throw new AlreadyCancelledError();

      // เช็คสิทธิ์ cancelStarted "ใน transaction" — กัน race ที่มีคนกดยืนยันเริ่มผลิต
      // ระหว่างผู้ใช้เปิด modal ค้างไว้ (เช็คก่อนหน้านั้นจะหลุด) — throw = rollback ทั้งหมด
      const activePOs = await tx.productionOrder.findMany({
        where: { customerPoId: id, cancelledAt: null },
        select: { id: true, prodNo: true, productionStartedAt: true },
      });
      const hasStarted = activePOs.some((p) => p.productionStartedAt !== null);
      if (hasStarted && !can(user.role, "production.cancelStarted")) throw new CancelStartedForbiddenError();

      const now = new Date();
      const cas = await tx.customerPO.updateMany({
        where: { id, version, cancelledAt: null },
        data: {
          cancelledAt: now,
          cancelledById: user.id,
          cancelReason: reason,
          version: { increment: 1 },
          revCounter: { increment: 1 },
        },
      });
      if (cas.count === 0) throw new ConcurrentEditError();

      const updated = await tx.customerPO.findUniqueOrThrow({ where: { id }, select: { revCounter: true } });

      // การยกเลิกเป็นการแก้ไขเนื้อหาออเดอร์ครั้งหนึ่ง — เก็บ Revision + CANCEL_ORDER change
      // ตามกฎ "ห้ามเขียนทับประวัติ" (หน้าประวัติ/detail เดิมแสดงได้ทันทีไม่ต้องแก้ UI)
      const revision = await tx.customerPORevision.create({
        data: { customerPoId: id, revNo: updated.revCounter, actorId: user.id, reason },
      });
      await tx.customerPORevisionChange.create({
        data: {
          revisionId: revision.id,
          orderLineId: null,
          changeType: "CANCEL_ORDER",
          qtyDelta: null,
          before: { cancelled: false },
          after: { cancelled: true, reason },
        },
      });

      if (activePOs.length > 0) {
        await tx.productionOrder.updateMany({
          where: { customerPoId: id, cancelledAt: null },
          data: { cancelledAt: now, cancelledById: user.id, cancelReason: reason },
        });
      }

      // Audit: 1 แถวต่อ entity ที่โดนแตะ ผูกกันด้วย correlationId (การใช้ field นี้ครั้งแรก
      // ตามที่ schema เตรียมไว้) — revision/print/started history ไม่ถูกแตะเลย (D5)
      const correlationId = revision.id;
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "CustomerPO",
          recordId: id,
          customerId: existing.customerId,
          branchId: existing.branchId,
          customerPoId: id,
          correlationId,
          reason,
          newValue: { cancelledProductionOrders: activePOs.map((p) => p.prodNo), hasStartedProduction: hasStarted },
        },
      });
      for (const po of activePOs) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CANCEL",
            module: "ProductionOrder",
            recordId: po.id,
            customerId: existing.customerId,
            branchId: existing.branchId,
            customerPoId: id,
            correlationId,
            reason,
            newValue: { event: "CANCEL", prodNo: po.prodNo, viaCustomerPo: true, wasStarted: po.productionStartedAt !== null },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof AlreadyCancelledError) {
      return { success: false, error: "ออเดอร์นี้ถูกยกเลิกไปแล้ว" };
    }
    if (error instanceof CancelStartedForbiddenError) {
      return {
        success: false,
        error: "มีใบสั่งผลิตที่เริ่มผลิตไปแล้ว — การยกเลิกออเดอร์นี้ต้องให้ผู้ดูแลระบบเป็นผู้ทำ",
      };
    }
    if (error instanceof ConcurrentEditError) {
      return {
        success: false,
        error: "ออเดอร์นี้ถูกแก้ไขโดยคนอื่นระหว่างที่คุณเปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
      };
    }
    throw error;
  }

  revalidatePath("/production/orders");
  revalidatePath(`/production/orders/${id}`);
  revalidatePath("/production/production-orders");
  return { success: true };
}
