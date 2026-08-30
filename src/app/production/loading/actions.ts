"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";
import { currentPeriod, formatDocNumber, getNextSeq } from "@/lib/running-number";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { freshCapacityFor } from "@/lib/loading-reconcile";

// P2 CP1 — โครงเที่ยวรถ (docs 04/06/07): ทุก mutation อยู่ใน transaction เดียว + optimistic
// lock ผ่าน LoadingTrip.version CAS (pattern CustomerPO.version) + audit ทุกครั้ง (module
// "LoadingTrip", newValue.event) — แก้ได้เฉพาะช่วง DRAFT (loadedAt/cancelledAt ยังว่าง —
// timestamp fact ไม่ใช่ status text) — CP1 ยังไม่มี ยืนยันขึ้นของ/reconcile/photo/ADHOC ตาม
// boundary ที่ Owner กำหนด

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// CAS ล้มเหลว: version ไม่ตรง (มีคนแก้พร้อมกัน) หรือเที่ยวพ้นสถานะ DRAFT ไปแล้ว
class TripConflictError extends Error {}

/** CAS กลางของทุก mutation: เพิ่ม version +1 เฉพาะเมื่อ version ตรงและยังเป็น DRAFT อยู่จริง */
async function casDraftTrip(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], tripId: string, version: number) {
  const cas = await tx.loadingTrip.updateMany({
    where: { id: tripId, version, loadedAt: null, cancelledAt: null },
    data: { version: { increment: 1 } },
  });
  if (cas.count === 0) throw new TripConflictError();
}

function conflictResult(): ActionResult {
  return {
    success: false,
    error: "เที่ยวรถนี้ถูกแก้ไขโดยคนอื่น หรือพ้นขั้นตอนวางแผนไปแล้ว — กรุณาโหลดหน้าใหม่",
  };
}

/** CP3 — CAS สำหรับช่วง "ขึ้นของแล้ว รอกระทบยอด" (loadedAt มีค่า, reconciledAt/cancelledAt ว่าง) */
async function casLoadedTrip(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], tripId: string, version: number) {
  const cas = await tx.loadingTrip.updateMany({
    where: { id: tripId, version, loadedAt: { not: null }, reconciledAt: null, cancelledAt: null },
    data: { version: { increment: 1 } },
  });
  if (cas.count === 0) throw new TripConflictError();
}

async function auditTrip(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: { userId: string; tripId: string; event: string; customerId?: string | null; branchId?: string | null; detail?: Record<string, unknown> }
) {
  await tx.auditLog.create({
    data: {
      userId: params.userId,
      action: params.event === "CREATE" ? "CREATE" : "UPDATE",
      module: "LoadingTrip",
      recordId: params.tripId,
      customerId: params.customerId ?? null,
      branchId: params.branchId ?? null,
      newValue: { event: params.event, ...(params.detail ?? {}) },
    },
  });
}

export async function createLoadingTrip(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");

  const tripDateRaw = String(formData.get("tripDate") || "").trim();
  if (!tripDateRaw) {
    return { success: false, error: "กรุณาเลือกวันที่ออกรถ", fieldErrors: { tripDate: "กรุณาเลือกวันที่ออกรถ" } };
  }
  const vehicleNote = String(formData.get("vehicleNote") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;

  const trip = await db.$transaction(async (tx) => {
    const period = currentPeriod(new Date());
    const seq = await getNextSeq("TRIP", period, tx);
    const tripNo = formatDocNumber("TRIP", period, seq);
    const created = await tx.loadingTrip.create({
      data: { tripNo, tripDate: new Date(`${tripDateRaw}T00:00:00`), vehicleNote, note, createdById: user.id },
    });
    await auditTrip(tx, { userId: user.id, tripId: created.id, event: "CREATE", detail: { tripNo } });
    return created;
  });

  revalidatePath("/production/loading");
  redirect(`/production/loading/${trip.id}`);
}

export async function updateLoadingTripHeader(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");

  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const tripDateRaw = String(formData.get("tripDate") || "").trim();
  if (!tripDateRaw) return { success: false, error: "กรุณาเลือกวันที่ออกรถ" };
  const vehicleNote = String(formData.get("vehicleNote") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      await tx.loadingTrip.update({
        where: { id: tripId },
        data: { tripDate: new Date(`${tripDateRaw}T00:00:00`), vehicleNote, note },
      });
      await auditTrip(tx, { userId: user.id, tripId, event: "EDIT_HEADER", detail: { tripDate: tripDateRaw, vehicleNote, note } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  revalidatePath("/production/loading");
  return { success: true };
}

export async function addLoadingDrop(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");

  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) return { success: false, error: "กรุณาเลือกลูกค้าปลายทาง" };
  const branchId = String(formData.get("branchId") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      // กันข้อมูลปลอม: ลูกค้า/สาขาต้องมีจริงและเข้าคู่กัน
      const customer = await tx.customer.findFirst({ where: { id: customerId, active: true }, select: { id: true } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, customerId }, select: { id: true } });
        if (!branch) throw new Error("BRANCH_MISMATCH");
      }
      const last = await tx.loadingDrop.findFirst({ where: { tripId }, orderBy: { seq: "desc" }, select: { seq: true } });
      await tx.loadingDrop.create({ data: { tripId, seq: (last?.seq ?? 0) + 1, customerId, branchId, note } });
      await auditTrip(tx, { userId: user.id, tripId, event: "ADD_DROP", customerId, branchId, detail: {} });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    if (error instanceof Error && (error.message === "CUSTOMER_NOT_FOUND" || error.message === "BRANCH_MISMATCH")) {
      return { success: false, error: "ลูกค้า/สาขาที่เลือกไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

export async function removeLoadingDrop(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { customerId: true, branchId: true } });
      if (!drop) throw new TripConflictError(); // ถูกลบไปแล้วโดยคนอื่น — ให้ reload
      // แผนช่วง DRAFT ยังไม่ใช่เอกสาร/ประวัติทางธุรกิจ (ยังไม่มี fact การขึ้นของจริง) — hard
      // delete ได้ โดยการลบถูกบันทึกใน AuditLog แทน (กฎห้าม hard delete ใช้กับเอกสารจริง)
      await tx.loadingLine.deleteMany({ where: { dropId } });
      await tx.loadingDrop.delete({ where: { id: dropId } });
      await auditTrip(tx, { userId: user.id, tripId, event: "REMOVE_DROP", customerId: drop.customerId, branchId: drop.branchId, detail: {} });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

export async function moveLoadingDrop(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  const direction = String(formData.get("direction"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  if (direction !== "up" && direction !== "down") return { success: false, error: "ทิศทางไม่ถูกต้อง" };

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { id: true, seq: true } });
      if (!drop) throw new TripConflictError();
      const neighbor = await tx.loadingDrop.findFirst({
        where: { tripId, seq: direction === "up" ? { lt: drop.seq } : { gt: drop.seq } },
        orderBy: { seq: direction === "up" ? "desc" : "asc" },
        select: { id: true, seq: true },
      });
      if (!neighbor) return; // อยู่หัว/ท้ายแล้ว — no-op
      // สลับ seq ใต้ @@unique([tripId, seq]) — ต้องผ่านค่า temp กัน constraint ชนกลางทาง
      await tx.loadingDrop.update({ where: { id: drop.id }, data: { seq: -1 } });
      await tx.loadingDrop.update({ where: { id: neighbor.id }, data: { seq: drop.seq } });
      await tx.loadingDrop.update({ where: { id: drop.id }, data: { seq: neighbor.seq } });
      await auditTrip(tx, { userId: user.id, tripId, event: "REORDER_DROPS", detail: { dropId, direction } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

export async function addLoadingLine(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  // CP3 — picker มี 2 โหมด: FRESH (จากออเดอร์) หรือ OUTSTANDING (จากบัตรค้างเดิม lock 7)
  const outstandingId = String(formData.get("outstandingId") || "").trim();
  const customerPoLineId = String(formData.get("customerPoLineId") || "").trim();
  if (!customerPoLineId && !outstandingId) return { success: false, error: "กรุณาเลือกรายการสินค้า" };
  const qtyPlanned = Number(formData.get("qtyPlanned"));
  if (!Number.isInteger(qtyPlanned) || qtyPlanned <= 0) {
    return { success: false, error: "จำนวนที่วางแผนต้องเป็นจำนวนเต็มมากกว่า 0" };
  }

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { customerId: true, branchId: true } });
      if (!drop) throw new TripConflictError();

      if (outstandingId) {
        // OUTSTANDING picker (CP3): บัตรต้องเปิดอยู่ (closed/cancelled ไม่ eligible) และเป็น
        // ของลูกค้าจุดส่งนี้ — customerPoLineId เก็บจากบัตรเพื่อ trace, plannedOutstandingId
        // เป็นแค่บริบท prefill ตอน reconcile (planned ≠ final allocation)
        const outstanding = await tx.outstandingDelivery.findFirst({
          where: { id: outstandingId, closedAt: null },
          select: { id: true, customerPoLineId: true },
        });
        if (!outstanding) throw new Error("LINE_NOT_ELIGIBLE");
        const srcLine = await tx.customerPOLine.findFirst({
          where: { id: outstanding.customerPoLineId, customerPo: { customerId: drop.customerId } },
          include: { product: { select: { id: true, sku: true, name: true, productionLabel: true } } },
        });
        if (!srcLine) throw new Error("LINE_NOT_ELIGIBLE");
        await tx.loadingLine.create({
          data: {
            dropId,
            sourceType: "OUTSTANDING",
            customerPoLineId: srcLine.id,
            plannedOutstandingId: outstanding.id,
            productId: srcLine.productId,
            skuSnapshot: srcLine.product?.sku ?? null,
            labelSnapshot: srcLine.product?.productionLabel ?? srcLine.product?.name ?? "—",
            size: srcLine.size,
            qtyPlanned,
          },
        });
        await auditTrip(tx, {
          userId: user.id,
          tripId,
          event: "ADD_LINE",
          customerId: drop.customerId,
          branchId: drop.branchId,
          detail: { outstandingId: outstanding.id, qtyPlanned },
        });
        return;
      }

      // FRESH picker (CP1): บรรทัดต้อง active + CATALOG + เป็นของลูกค้าปลายทางจุดส่งนี้ +
      // ออเดอร์ต้นทางยังไม่ถูกยกเลิก (CP0 fact) — snapshot ชื่อ/SKU ณ วันวางแผน
      const line = await tx.customerPOLine.findFirst({
        where: {
          id: customerPoLineId,
          active: true,
          lineKind: "CATALOG",
          customerPo: { customerId: drop.customerId, cancelledAt: null },
        },
        include: { product: { select: { id: true, sku: true, name: true, productionLabel: true } } },
      });
      if (!line) throw new Error("LINE_NOT_ELIGIBLE");
      await tx.loadingLine.create({
        data: {
          dropId,
          sourceType: "FRESH",
          customerPoLineId: line.id,
          productionItemId: null, // CP1 ไม่เดาว่าผลิตจากใบไหน — คนเลือกจริงตอน reconcile (CP3)
          productId: line.productId,
          skuSnapshot: line.product?.sku ?? null,
          labelSnapshot: line.product?.productionLabel ?? line.product?.name ?? "—",
          size: line.size,
          qtyPlanned,
        },
      });
      await auditTrip(tx, {
        userId: user.id,
        tripId,
        event: "ADD_LINE",
        customerId: drop.customerId,
        branchId: drop.branchId,
        detail: { customerPoLineId: line.id, qtyPlanned },
      });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    if (error instanceof Error && error.message === "LINE_NOT_ELIGIBLE") {
      return { success: false, error: "รายการที่เลือกไม่พร้อมขึ้นรถแล้ว (อาจถูกยกเลิก/ปิด/แก้ไข) — กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// CP2 — ยกเลิกเที่ยว (DRAFT เท่านั้น) · ยืนยันขึ้นของจริง · ลบรูปหลักฐาน
// ---------------------------------------------------------------------------

// CP2 — ยกเลิกเที่ยวช่วงวางแผน: terminal fact + เหตุผล + audit ไม่ hard delete ไม่ cascade
// ไปออเดอร์/ใบสั่งผลิตใดๆ (เที่ยวเป็นแค่แผน ไม่ใช่เอกสารต้นทาง) — เที่ยวที่พ้น DRAFT แล้ว
// (loadedAt มีค่า = ของขึ้นรถจริงไปแล้ว) ยกเลิกด้วย flow นี้ไม่ได้โดยเจตนา: ความจริงทาง
// กายภาพเกิดแล้ว ต้องไปจัดการที่ขั้นกระทบยอด (CP3) ไม่ใช่ทำเหมือนเที่ยวไม่เคยเกิด
export async function cancelLoadingTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) return { success: false, error: "กรุณากรอกเหตุผลที่ยกเลิก", fieldErrors: { reason: "กรุณากรอกเหตุผลที่ยกเลิก" } };

  try {
    await db.$transaction(async (tx) => {
      const cas = await tx.loadingTrip.updateMany({
        where: { id: tripId, version, loadedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelledById: user.id, cancelReason: reason, version: { increment: 1 } },
      });
      if (cas.count === 0) throw new TripConflictError();
      await auditTrip(tx, { userId: user.id, tripId, event: "CANCEL", detail: { reason } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "ยกเลิกไม่ได้ — เที่ยวนี้ถูกแก้ไข/ยืนยันขึ้นของ/ยกเลิกไปแล้ว กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// CP2 — ลบรูป (เฉพาะช่วง DRAFT — หลังยืนยันขึ้นของแล้วรูปคือหลักฐานประกอบ fact ห้ามถอน)
export async function removeLoadingPhoto(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  const path = String(formData.get("path") || "");
  if (!Number.isFinite(version) || !path) return { success: false, error: "ข้อมูลไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { photoPaths: true, customerId: true, branchId: true } });
      if (!drop || !drop.photoPaths.includes(path)) throw new TripConflictError();
      await tx.loadingDrop.update({ where: { id: dropId }, data: { photoPaths: drop.photoPaths.filter((p) => p !== path) } });
      await auditTrip(tx, { userId: user.id, tripId, event: "REMOVE_PHOTO", customerId: drop.customerId, branchId: drop.branchId, detail: { path } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

export async function removeLoadingLine(tripId: string, lineId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const line = await tx.loadingLine.findFirst({
        where: { id: lineId, drop: { tripId } },
        select: { id: true, labelSnapshot: true, drop: { select: { customerId: true, branchId: true } } },
      });
      if (!line) throw new TripConflictError();
      await tx.loadingLine.delete({ where: { id: lineId } });
      await auditTrip(tx, {
        userId: user.id,
        tripId,
        event: "REMOVE_LINE",
        customerId: line.drop.customerId,
        branchId: line.drop.branchId,
        detail: { label: line.labelSnapshot },
      });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// ===========================================================================
// CP6 — Queue-first UX (2026-08-30): เริ่มงานจากคิวใบสั่งผลิต ไม่ใช่สร้างเที่ยวเปล่า
// ===========================================================================

// กด "ยืนยันว่าจะขึ้นออเดอร์นี้วันนี้" จากคิว: (1) บันทึก fact ผลิตเสร็จ (ครั้งแรกเท่านั้น —
// ฝ่ายขึ้นของคือผู้ตรวจของจริงจุดสุดท้าย) (2) สร้าง "รอบจัดส่ง" ใหม่ หรือเพิ่มเข้ารอบเดิมที่ยัง
// วางแผนอยู่ (3) เปิดจุดส่งของลูกค้าใบนี้ + prefill รายการจากใบสั่งผลิต Rev ปัจจุบัน —
// ทั้งหมดใน tx เดียว · idempotent: ใบที่อยู่ในรอบ active แล้ว → พาไปรอบนั้นเลย ไม่สร้างซ้ำ
export async function startLoadingJob(productionOrderId: string, formData: FormData): Promise<ActionResult & { tripId?: string }> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const mode = String(formData.get("mode") || "new"); // "new" | "existing"
  const existingTripId = String(formData.get("tripId") || "").trim();
  if (mode === "existing" && !existingTripId) return { success: false, error: "กรุณาเลือกรอบจัดส่งที่จะเพิ่มเข้า" };

  let resultTripId = "";
  try {
    await db.$transaction(async (tx) => {
      const po = await tx.productionOrder.findUniqueOrThrow({
        where: { id: productionOrderId },
        include: {
          customerPo: { select: { id: true, customerId: true, branchId: true, cancelledAt: true } },
        },
      });
      if (po.cancelledAt || po.customerPo.cancelledAt) throw new Error("CANCELLED_SOURCE");

      // มีจุดส่งของใบนี้ในรอบ active (ยังไม่ส่งออก/ไม่ยกเลิก) อยู่แล้ว → ใช้รอบนั้น (idempotent)
      const existingDrop = await tx.loadingDrop.findFirst({
        where: { productionOrderId, trip: { cancelledAt: null, reconciledAt: null } },
        select: { tripId: true },
      });
      if (existingDrop) {
        resultTripId = existingDrop.tripId;
        return;
      }

      // fact ผลิตเสร็จ — ตั้งครั้งเดียวตลอดชีวิตใบ (updateMany CAS: ครั้งถัดไป no-op เงียบ)
      const completedCas = await tx.productionOrder.updateMany({
        where: { id: productionOrderId, productionCompletedAt: null },
        data: { productionCompletedAt: new Date(), productionCompletedById: user.id },
      });
      if (completedCas.count > 0) {
        await tx.auditLog.create({
          data: {
            userId: user.id, action: "UPDATE", module: "ProductionOrder", recordId: productionOrderId,
            customerId: po.customerPo.customerId, branchId: po.customerPo.branchId, customerPoId: po.customerPo.id,
            newValue: { event: "PRODUCTION_COMPLETED", confirmedByLoading: true },
          },
        });
      }

      // รอบจัดส่ง: ใหม่ หรือรอบเดิมที่ยัง DRAFT
      let tripId: string;
      if (mode === "existing") {
        const trip = await tx.loadingTrip.findFirst({
          where: { id: existingTripId, loadedAt: null, reconciledAt: null, cancelledAt: null },
          select: { id: true },
        });
        if (!trip) throw new Error("RUN_NOT_OPEN");
        tripId = trip.id;
        await tx.loadingTrip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      } else {
        const period = currentPeriod(new Date());
        const seq = await getNextSeq("TRIP", period, tx);
        const created = await tx.loadingTrip.create({
          data: { tripNo: formatDocNumber("TRIP", period, seq), tripDate: new Date(), createdById: user.id },
        });
        tripId = created.id;
        await auditTrip(tx, { userId: user.id, tripId, event: "CREATE", detail: { tripNo: created.tripNo } });
      }
      resultTripId = tripId;

      const last = await tx.loadingDrop.findFirst({ where: { tripId }, orderBy: { seq: "desc" }, select: { seq: true } });
      const drop = await tx.loadingDrop.create({
        data: { tripId, seq: (last?.seq ?? 0) + 1, customerId: po.customerPo.customerId, branchId: po.customerPo.branchId, productionOrderId },
      });

      // prefill จากใบสั่งผลิต Rev ปัจจุบัน (snapshot ฝั่งผลิตคือของที่พร้อมขึ้นจริง)
      const revision = await tx.productionOrderRevision.findUnique({
        where: { productionOrderId_revNo: { productionOrderId, revNo: po.currentRevNo } },
        include: { items: true },
      });
      for (const item of revision?.items ?? []) {
        await tx.loadingLine.create({
          data: {
            dropId: drop.id,
            sourceType: item.customerPoLineId ? "FRESH" : "ADHOC",
            customerPoLineId: item.customerPoLineId,
            productionItemId: item.id,
            productId: item.productId,
            skuSnapshot: item.skuSnapshot,
            labelSnapshot: item.productionLabelSnapshot ?? item.nameSnapshot ?? "—",
            size: item.size,
            qtyPlanned: item.qty,
          },
        });
      }
      await auditTrip(tx, {
        userId: user.id, tripId, event: "START_LOADING_JOB",
        customerId: po.customerPo.customerId, branchId: po.customerPo.branchId,
        detail: { productionOrderId, prodNo: po.prodNo, itemCount: revision?.items.length ?? 0 },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CANCELLED_SOURCE") {
      return { success: false, error: "ใบสั่งผลิต/ออเดอร์นี้ถูกยกเลิกแล้ว ขึ้นของไม่ได้" };
    }
    if (error instanceof Error && error.message === "RUN_NOT_OPEN") {
      return { success: false, error: "รอบจัดส่งที่เลือกปิด/ยกเลิกไปแล้ว — กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${resultTripId}`);
  return { success: true, tripId: resultTripId };
}

// งานจากสต็อก/ไม่มีใบสั่งผลิต — เปิดจุดส่งเปล่าให้ไปเพิ่มสินค้า (ADHOC/จากออเดอร์) ที่หน้าเตรียม
export async function startStockJob(formData: FormData): Promise<ActionResult & { tripId?: string }> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) return { success: false, error: "กรุณาเลือกลูกค้าปลายทาง" };
  const branchId = String(formData.get("branchId") || "").trim() || null;
  const mode = String(formData.get("mode") || "new");
  const existingTripId = String(formData.get("tripId") || "").trim();

  let resultTripId = "";
  try {
    await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, active: true }, select: { id: true } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, customerId }, select: { id: true } });
        if (!branch) throw new Error("CUSTOMER_NOT_FOUND");
      }
      let tripId: string;
      if (mode === "existing" && existingTripId) {
        const trip = await tx.loadingTrip.findFirst({ where: { id: existingTripId, loadedAt: null, reconciledAt: null, cancelledAt: null }, select: { id: true } });
        if (!trip) throw new Error("RUN_NOT_OPEN");
        tripId = trip.id;
        await tx.loadingTrip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      } else {
        const period = currentPeriod(new Date());
        const seq = await getNextSeq("TRIP", period, tx);
        const created = await tx.loadingTrip.create({ data: { tripNo: formatDocNumber("TRIP", period, seq), tripDate: new Date(), createdById: user.id } });
        tripId = created.id;
        await auditTrip(tx, { userId: user.id, tripId, event: "CREATE", detail: { tripNo: created.tripNo } });
      }
      resultTripId = tripId;
      const last = await tx.loadingDrop.findFirst({ where: { tripId }, orderBy: { seq: "desc" }, select: { seq: true } });
      await tx.loadingDrop.create({ data: { tripId, seq: (last?.seq ?? 0) + 1, customerId, branchId, productionOrderId: null } });
      await auditTrip(tx, { userId: user.id, tripId, event: "START_STOCK_JOB", customerId, branchId, detail: {} });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return { success: false, error: "ลูกค้า/สาขาไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
    if (error instanceof Error && error.message === "RUN_NOT_OPEN") return { success: false, error: "รอบจัดส่งที่เลือกปิด/ยกเลิกไปแล้ว — กรุณาโหลดหน้าใหม่" };
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${resultTripId}`);
  return { success: true, tripId: resultTripId };
}

// เพิ่มสินค้าแบบไม่มีออเดอร์ (สต็อก/ของกะทันหัน) ช่วงเตรียมขึ้นของ — ADHOC planned line
// (ห้ามสร้าง fake order เพื่อให้ FK ครบ — บันทึกตรงๆ ตามจริง)
export async function addAdhocPlannedLine(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const label = String(formData.get("label") || "").trim();
  if (!label) return { success: false, error: "กรุณากรอกชื่อสินค้า" };
  const size = String(formData.get("size") || "").trim() || null;
  const productId = String(formData.get("productId") || "").trim() || null;
  const qtyPlanned = Number(formData.get("qtyPlanned"));
  if (!Number.isInteger(qtyPlanned) || qtyPlanned <= 0) return { success: false, error: "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" };

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { customerId: true, branchId: true } });
      if (!drop) throw new TripConflictError();
      let sku: string | null = null;
      if (productId) {
        const product = await tx.product.findUnique({ where: { id: productId }, select: { sku: true } });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        sku = product.sku;
      }
      await tx.loadingLine.create({
        data: { dropId, sourceType: "ADHOC", productId, skuSnapshot: sku, labelSnapshot: label, size, qtyPlanned },
      });
      await auditTrip(tx, { userId: user.id, tripId, event: "ADD_ADHOC_LINE", customerId: drop.customerId, branchId: drop.branchId, detail: { label, size, qtyPlanned } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return conflictResult();
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return { success: false, error: "สินค้าที่เลือกผูกไม่ถูกต้อง" };
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// ยืนยันหลัง print dialog (pattern S4: browser แยกกด Print/Cancel ไม่ได้ — มนุษย์ยืนยันเอง)
// พิมพ์ ≠ ขึ้นของ/ส่งออก — ไม่แตะ quantity/loaded/reconcile ใดๆ
export async function confirmSheetPrinted(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  try {
    await db.$transaction(async (tx) => {
      const cas = await tx.loadingTrip.updateMany({
        where: { id: tripId, version, reconciledAt: null, cancelledAt: null },
        data: { sheetPrintedAt: new Date(), sheetPrintedById: user.id, sheetPrintedVersion: version, version: { increment: 1 } },
      });
      if (cas.count === 0) throw new TripConflictError();
      await auditTrip(tx, { userId: user.id, tripId, event: "PRINT_SHEET", detail: { planVersion: version } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) return { success: false, error: "บันทึกไม่ได้ — รอบนี้ถูกแก้/ปิด/ยกเลิกไปแล้ว กรุณาโหลดหน้าใหม่" };
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${tripId}`);
  revalidatePath(`/production/loading/${tripId}/print`);
  return { success: true };
}

// ===========================================================================
// CP6 — "ยืนยันส่งออก": finalization เดียวจบ (แทน confirm-loaded + reconcile 2 ขั้นของเดิม)
// tx เดียว atomic: ยอดขึ้นจริง + loadedAt + allocations + เปิด/ปิดบัตรค้าง + reconciledAt —
// ล้มจุดไหน rollback หมด "สินค้าถูกส่งออกแล้ว" เกิดเฉพาะเมื่อทุกอย่างสำเร็จจริงเท่านั้น
// invariants เดิมทุกข้อคงอยู่: รูปครบต่อจุด · ทุกชิ้นมีที่มา · FRESH ไม่เกิน demand ลูกค้า ·
// OUTSTANDING ไม่เกินยอดเหลือ · บัตรใหม่จาก demand เท่านั้น · ไม่มี FIFO · Serializable
// ===========================================================================
type AllocationInput = { kind: "FRESH" | "OUTSTANDING" | "ADHOC"; outstandingId?: string; qty: number };

export async function finalizeLoadingTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  let qtyEntries: Map<string, number>;
  let allocInput: Map<string, AllocationInput[]>;
  try {
    const rawQty = JSON.parse(String(formData.get("linesJson") || "[]"));
    qtyEntries = new Map(rawQty.map((e: any) => [String(e.lineId), Number(e.qtyLoaded)]));
    for (const q of qtyEntries.values()) if (!Number.isInteger(q) || q < 0) throw new Error("bad");
    const rawAlloc = JSON.parse(String(formData.get("allocationsJson") || "[]"));
    allocInput = new Map(
      rawAlloc.map((e: any) => [
        String(e.lineId),
        (Array.isArray(e.allocations) ? e.allocations : []).map((a: any) => ({
          kind: a.kind, outstandingId: a.outstandingId ? String(a.outstandingId) : undefined, qty: Number(a.qty),
        })),
      ])
    );
    for (const list of allocInput.values())
      for (const a of list) {
        if (!["FRESH", "OUTSTANDING", "ADHOC"].includes(a.kind) || !Number.isInteger(a.qty) || a.qty <= 0) throw new Error("bad");
        if (a.kind === "OUTSTANDING" && !a.outstandingId) throw new Error("bad");
      }
  } catch {
    return { success: false, error: "ข้อมูลไม่ถูกต้อง — กรุณาโหลดหน้าใหม่แล้วกรอกอีกครั้ง" };
  }

  try {
    await db.$transaction(
      async (tx) => {
        // CAS: ยังเป็นช่วงเตรียม (ยังไม่ finalize/ยกเลิก) — one-way สู่ส่งออกแล้ว
        const cas = await tx.loadingTrip.updateMany({
          where: { id: tripId, version, loadedAt: null, reconciledAt: null, cancelledAt: null },
          data: { version: { increment: 1 } },
        });
        if (cas.count === 0) throw new TripConflictError();

        const drops = await tx.loadingDrop.findMany({
          where: { tripId },
          select: { customerId: true, photoPaths: true, lines: { select: { id: true, customerPoLineId: true, sourceType: true } } },
        });
        const allLines = drops.flatMap((d) => d.lines.map((l) => ({ ...l, customerId: d.customerId })));
        if (allLines.length === 0) throw new Error("NO_LINES");
        // หลักฐานมาก่อนตัวเลข: ทุกจุดที่มีรายการต้องมีรูปใบขีดนับ
        if (drops.find((d) => d.lines.length > 0 && d.photoPaths.length === 0)) throw new Error("PHOTO_REQUIRED");
        // ครอบคลุมทุกรายการเป๊ะทั้งยอดจริงและการตัด
        if (allLines.length !== qtyEntries.size || allLines.some((l) => !qtyEntries.has(l.id))) throw new Error("LINES_MISMATCH");
        if (allLines.length !== allocInput.size || allLines.some((l) => !allocInput.has(l.id))) throw new Error("LINES_MISMATCH");
        // ทุกชิ้นที่ขึ้นจริงต้องมีที่มา (Σ = ยอดจริงเป๊ะ)
        for (const line of allLines) {
          const sum = (allocInput.get(line.id) ?? []).reduce((s, a) => s + a.qty, 0);
          if (sum !== qtyEntries.get(line.id)) throw new Error("ALLOC_SUM_MISMATCH");
        }
        // FRESH ≤ demand ลูกค้าปัจจุบัน (ไม่ใช่ยอดผลิต) — ออเดอร์ยกเลิก = 0
        const freshBy = new Map<string, number>();
        for (const line of allLines)
          for (const a of allocInput.get(line.id) ?? [])
            if (a.kind === "FRESH") {
              if (!line.customerPoLineId) throw new Error("FRESH_NEEDS_SOURCE");
              freshBy.set(line.customerPoLineId, (freshBy.get(line.customerPoLineId) ?? 0) + a.qty);
            }
        for (const [poLineId, qty] of freshBy) {
          const { capacity, cancelled } = await freshCapacityFor(tx, poLineId);
          if (cancelled) throw new Error("FRESH_CANCELLED_ORDER");
          if (qty > capacity) throw new Error("FRESH_OVER_CAPACITY");
        }
        // OUTSTANDING ≤ ยอดเหลือของบัตรเปิด
        const outBy = new Map<string, number>();
        for (const line of allLines)
          for (const a of allocInput.get(line.id) ?? [])
            if (a.kind === "OUTSTANDING") outBy.set(a.outstandingId!, (outBy.get(a.outstandingId!) ?? 0) + a.qty);
        const outRemaining = new Map<string, number>();
        for (const [oid, qty] of outBy) {
          const o = await tx.outstandingDelivery.findFirst({
            where: { id: oid, closedAt: null },
            select: { qtyOriginal: true, allocations: { select: { qty: true } } },
          });
          if (!o) throw new Error("OUTSTANDING_NOT_OPEN");
          const remaining = o.qtyOriginal - o.allocations.reduce((s, a) => s + a.qty, 0);
          if (qty > remaining) throw new Error("OUTSTANDING_OVER_REMAINING");
          outRemaining.set(oid, remaining);
        }

        const now = new Date();
        // บันทึกยอดจริง + fact ขึ้นของ
        for (const [lineId, q] of qtyEntries) await tx.loadingLine.update({ where: { id: lineId }, data: { qtyLoaded: q } });
        // ledger การตัด (immutable — ใครเลือกอะไร)
        for (const line of allLines)
          for (const a of allocInput.get(line.id) ?? []) {
            await tx.loadingAllocation.create({
              data: {
                loadingLineId: line.id, kind: a.kind,
                outstandingId: a.kind === "OUTSTANDING" ? a.outstandingId : null,
                customerPoLineId: a.kind === "FRESH" ? line.customerPoLineId : null,
                qty: a.qty, actorId: user.id,
              },
            });
          }
        // ปิดบัตรที่ครบ
        const closed: string[] = [];
        for (const [oid, qty] of outBy)
          if (qty === outRemaining.get(oid)) {
            await tx.outstandingDelivery.update({ where: { id: oid }, data: { closedAt: now } });
            closed.push(oid);
          }
        // เปิดบัตรใหม่จาก demand ที่ยังไม่ครบ (เฉพาะบรรทัดที่รอบนี้แตะ)
        const touched = [...new Set(allLines.filter((l) => l.customerPoLineId).map((l) => l.customerPoLineId!))];
        const opened: { id: string; qty: number }[] = [];
        for (const poLineId of touched) {
          const { capacity, cancelled } = await freshCapacityFor(tx, poLineId);
          if (cancelled || capacity <= 0) continue;
          const created = await tx.outstandingDelivery.create({
            data: { customerPoLineId: poLineId, qtyOriginal: capacity, openedById: user.id, openedFromTripId: tripId, openedAt: now },
          });
          opened.push({ id: created.id, qty: capacity });
          const poLine = await tx.customerPOLine.findUniqueOrThrow({
            where: { id: poLineId },
            select: { customerPoId: true, customerPo: { select: { customerId: true, branchId: true } } },
          });
          await tx.auditLog.create({
            data: {
              userId: user.id, action: "CREATE", module: "Outstanding", recordId: created.id,
              customerId: poLine.customerPo.customerId, branchId: poLine.customerPo.branchId, customerPoId: poLine.customerPoId,
              correlationId: `dispatch-${tripId}`,
              newValue: { event: "OPEN_OUTSTANDING", qtyOriginal: capacity, fromTripId: tripId },
            },
          });
        }
        for (const oid of closed) {
          await tx.auditLog.create({
            data: { userId: user.id, action: "UPDATE", module: "Outstanding", recordId: oid, correlationId: `dispatch-${tripId}`, newValue: { event: "CLOSE_OUTSTANDING", fromTripId: tripId } },
          });
        }
        // facts ปิดรอบ: ขึ้นของแล้ว + ส่งออกแล้ว ใน moment เดียว (finalization เดียวของ CP6)
        await tx.loadingTrip.update({ where: { id: tripId }, data: { loadedAt: now, loadedById: user.id, reconciledAt: now, reconciledById: user.id } });
        const totalLoaded = [...qtyEntries.values()].reduce((s, v) => s + v, 0);
        await auditTrip(tx, { userId: user.id, tripId, event: "CONFIRM_LOADED", detail: { totalLoaded, lineCount: allLines.length } });
        await tx.auditLog.create({
          data: { userId: user.id, action: "UPDATE", module: "LoadingTrip", recordId: tripId, correlationId: `dispatch-${tripId}`, newValue: { event: "RECONCILE", opened, closed } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { success: false, error: "มีการบันทึกชนกันพอดี — กรุณาลองอีกครั้ง" };
    }
    if (error instanceof TripConflictError) return { success: false, error: "ยืนยันไม่ได้ — รอบนี้ถูกแก้/ส่งออก/ยกเลิกไปแล้ว กรุณาโหลดหน้าใหม่" };
    if (error instanceof Error) {
      if (error.message === "NO_LINES") return { success: false, error: "รอบนี้ยังไม่มีรายการสินค้า" };
      if (error.message === "PHOTO_REQUIRED") return { success: false, error: "ทุกจุดส่งที่มีรายการต้องแนบรูปใบขึ้นของที่ขีดนับแล้ว (หลักฐานมาก่อนตัวเลข)" };
      if (error.message === "LINES_MISMATCH") return { success: false, error: "รายการถูกแก้ระหว่างเปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่" };
      if (error.message === "ALLOC_SUM_MISMATCH") return { success: false, error: "ยอดที่ตัดรวมต้องเท่ายอดขึ้นจริงเป๊ะทุกรายการ (ส่วนเกินระบุเป็น 'ไม่มีออเดอร์/หน้างาน')" };
      if (error.message === "FRESH_NEEDS_SOURCE") return { success: false, error: "รายการที่ไม่มีออเดอร์ต้นทาง ตัดเป็น 'ออเดอร์ใหม่' ไม่ได้" };
      if (error.message === "FRESH_CANCELLED_ORDER") return { success: false, error: "ออเดอร์ต้นทางถูกยกเลิกแล้ว — ระบุเป็นของหน้างานหรือบัตรค้างเดิมแทน" };
      if (error.message === "FRESH_OVER_CAPACITY") return { success: false, error: "ตัดออเดอร์ใหม่เกินยอดที่ลูกค้ายังต้องได้ — ส่วนเกินระบุเป็น 'ไม่มีออเดอร์/หน้างาน'" };
      if (error.message === "OUTSTANDING_NOT_OPEN") return { success: false, error: "บัตรค้างที่เลือกถูกปิดแล้ว — กรุณาโหลดหน้าใหม่" };
      if (error.message === "OUTSTANDING_OVER_REMAINING") return { success: false, error: "ตัดบัตรค้างเกินยอดที่เหลือ — กรุณาปรับ" };
    }
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${tripId}`);
  revalidatePath("/production/outstanding");
  revalidatePath("/production");
  return { success: true };
}
