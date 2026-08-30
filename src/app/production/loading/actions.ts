"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
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

// CP2 — "ยืนยันขึ้นของจริง": เหตุการณ์ทางกายภาพเดียวที่ตั้ง loadedAt คือ มนุษย์นับยอดที่ขึ้น
// รถจริงครบทุกรายการ (qtyLoaded — planned ≠ loaded โดยชอบธรรม รวมถึง 0 ได้ถ้าไม่ได้ขึ้น)
// พร้อมรูปใบขีดนับครบทุกจุดส่ง — การพิมพ์ใบขึ้นของไม่เกี่ยวกับ fact นี้เลย (พิมพ์ = กระดาษ
// เปล่าสำหรับ tally ไม่ mutate อะไร) — one-way: หลังยืนยันแล้วแผน/ยอดถูก freeze แก้ผ่าน
// การกระทบยอด (CP3) เท่านั้น — ไม่สร้าง Outstanding/reconcile ใดๆ ที่นี่ (CP3)
export async function confirmLoadingTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  let entries: { lineId: string; qtyLoaded: number }[];
  try {
    const raw = JSON.parse(String(formData.get("linesJson") || "[]"));
    if (!Array.isArray(raw)) throw new Error("bad");
    entries = raw.map((e: any) => ({ lineId: String(e.lineId), qtyLoaded: Number(e.qtyLoaded) }));
    if (entries.some((e) => !e.lineId || !Number.isInteger(e.qtyLoaded) || e.qtyLoaded < 0)) throw new Error("bad");
  } catch {
    return { success: false, error: "ข้อมูลยอดขึ้นจริงไม่ถูกต้อง — กรุณากรอกจำนวนเต็ม 0 ขึ้นไปให้ครบทุกรายการ" };
  }

  try {
    await db.$transaction(async (tx) => {
      const cas = await tx.loadingTrip.updateMany({
        where: { id: tripId, version, loadedAt: null, cancelledAt: null },
        data: { version: { increment: 1 } },
      });
      if (cas.count === 0) throw new TripConflictError();

      const drops = await tx.loadingDrop.findMany({
        where: { tripId },
        select: { id: true, customerId: true, photoPaths: true, lines: { select: { id: true } } },
      });
      const allLineIds = drops.flatMap((d) => d.lines.map((l) => l.id));
      if (allLineIds.length === 0) throw new Error("NO_LINES");

      // ทุกรายการต้องมียอดจริงส่งมาครบ (กันหน้าเก่าค้าง: รายการที่เพิ่งถูกเพิ่ม/ลบไม่ตรง)
      const entryById = new Map(entries.map((e) => [e.lineId, e.qtyLoaded]));
      if (allLineIds.length !== entries.length || allLineIds.some((id) => !entryById.has(id))) {
        throw new Error("LINES_MISMATCH");
      }
      // กฎ "หลักฐานมาก่อนตัวเลข": ทุกจุดส่งที่มีรายการ ต้องมีรูปใบขีดนับอย่างน้อย 1 รูป —
      // enforce ฝั่ง server ไม่ใช่แค่ UI
      const dropMissingPhoto = drops.find((d) => d.lines.length > 0 && d.photoPaths.length === 0);
      if (dropMissingPhoto) throw new Error("PHOTO_REQUIRED");

      for (const [lineId, qtyLoaded] of entryById) {
        await tx.loadingLine.update({ where: { id: lineId }, data: { qtyLoaded } });
      }
      await tx.loadingTrip.update({
        where: { id: tripId },
        data: { loadedAt: new Date(), loadedById: user.id },
      });
      const totalLoaded = entries.reduce((s, e) => s + e.qtyLoaded, 0);
      await auditTrip(tx, {
        userId: user.id,
        tripId,
        event: "CONFIRM_LOADED",
        detail: { lineCount: entries.length, totalLoaded },
      });
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "ยืนยันไม่ได้ — เที่ยวนี้ถูกแก้ไข/ยืนยัน/ยกเลิกไปแล้ว กรุณาโหลดหน้าใหม่" };
    }
    if (error instanceof Error && error.message === "NO_LINES") {
      return { success: false, error: "เที่ยวนี้ยังไม่มีรายการสินค้า — เพิ่มรายการก่อนยืนยันขึ้นของ" };
    }
    if (error instanceof Error && error.message === "LINES_MISMATCH") {
      return { success: false, error: "รายการในเที่ยวถูกแก้ไขระหว่างที่เปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่แล้วกรอกยอดอีกครั้ง" };
    }
    if (error instanceof Error && error.message === "PHOTO_REQUIRED") {
      return { success: false, error: "ทุกจุดส่งที่มีรายการต้องแนบรูปใบขึ้นของที่ขีดนับแล้วอย่างน้อย 1 รูป (หลักฐานมาก่อนตัวเลข)" };
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

// ---------------------------------------------------------------------------
// CP3 — ADHOC หน้างาน · แก้ยอดขึ้นจริง · Reconcile (ธุรกรรมใหญ่สุดของ P2)
// ---------------------------------------------------------------------------

// CP3 lock 1 — รายการเขียนมือหน้างาน คีย์เข้าระบบช่วง "ขึ้นของแล้ว รอกระทบยอด" ได้เลย
// ไม่ต้องย้อนบังคับคีย์ก่อน loadedAt — ไม่มี source order จริงก็เก็บเป็น ADHOC ตรงๆ ห้าม
// สร้าง fake order เพื่อให้ FK ครบ · resolve เป็นสินค้าจริงได้ให้ผูก productId (optional)
export async function addAdhocLine(tripId: string, dropId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const label = String(formData.get("label") || "").trim();
  if (!label) return { success: false, error: "กรุณากรอกชื่อสินค้า" };
  const size = String(formData.get("size") || "").trim() || null;
  const productId = String(formData.get("productId") || "").trim() || null;
  const qtyLoaded = Number(formData.get("qtyLoaded"));
  if (!Number.isInteger(qtyLoaded) || qtyLoaded <= 0) {
    return { success: false, error: "จำนวนที่ขึ้นจริงต้องเป็นจำนวนเต็มมากกว่า 0" };
  }

  try {
    await db.$transaction(async (tx) => {
      await casLoadedTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { customerId: true, branchId: true } });
      if (!drop) throw new TripConflictError();
      let sku: string | null = null;
      if (productId) {
        const product = await tx.product.findUnique({ where: { id: productId }, select: { sku: true } });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        sku = product.sku;
      }
      await tx.loadingLine.create({
        data: {
          dropId,
          sourceType: "ADHOC",
          productId,
          skuSnapshot: sku,
          labelSnapshot: label,
          size,
          qtyPlanned: 0, // ไม่ได้อยู่ในแผน — ขึ้นหน้างานล้วน
          qtyLoaded,
        },
      });
      await auditTrip(tx, {
        userId: user.id,
        tripId,
        event: "ADD_ADHOC_LINE",
        customerId: drop.customerId,
        branchId: drop.branchId,
        detail: { label, size, qtyLoaded, productId },
      });
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "เพิ่มไม่ได้ — เที่ยวต้องอยู่ในสถานะ 'ขึ้นของแล้ว รอกระทบยอด' และไม่ถูกแก้พร้อมกัน กรุณาโหลดหน้าใหม่" };
    }
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return { success: false, error: "สินค้าที่เลือกผูกไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// CP3 — ลบรายการ ADHOC ที่คีย์ผิด (เฉพาะก่อนกระทบยอด และเฉพาะ ADHOC — รายการแผนเดิมถูก
// freeze ตั้งแต่ยืนยันขึ้นของแล้ว)
export async function removeAdhocLine(tripId: string, lineId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  try {
    await db.$transaction(async (tx) => {
      await casLoadedTrip(tx, tripId, version);
      const line = await tx.loadingLine.findFirst({
        where: { id: lineId, drop: { tripId }, sourceType: "ADHOC" },
        select: { id: true, labelSnapshot: true, drop: { select: { customerId: true, branchId: true } } },
      });
      if (!line) throw new TripConflictError();
      await tx.loadingLine.delete({ where: { id: lineId } });
      await auditTrip(tx, { userId: user.id, tripId, event: "REMOVE_ADHOC_LINE", customerId: line.drop.customerId, branchId: line.drop.branchId, detail: { label: line.labelSnapshot } });
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "ลบไม่ได้ — เฉพาะรายการหน้างานก่อนกระทบยอดเท่านั้น กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// CP3 lock 2 — แก้ยอดขึ้นจริงที่คีย์ผิด: ได้เฉพาะช่วง "ขึ้นของแล้ว รอกระทบยอด" (ไม่ reopen
// DRAFT, ไม่แตะแผน/จุดส่ง/source) บังคับเหตุผล + audit before/after — หลัง reconcile แล้ว
// ห้าม direct edit เด็ดขาด (casLoadedTrip กันให้) ต้องเป็น compensating event ที่ขั้นถัดไป
// — ใช้ AuditLog เดิมเก็บ correction history (เพียงพอ ไม่สร้างตารางใหม่ตามเงื่อนไข Owner)
export async function correctLoadingLineQty(tripId: string, lineId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) return { success: false, error: "กรุณากรอกเหตุผลที่แก้ยอด", fieldErrors: { reason: "กรุณากรอกเหตุผลที่แก้ยอด" } };
  const qtyLoaded = Number(formData.get("qtyLoaded"));
  if (!Number.isInteger(qtyLoaded) || qtyLoaded < 0) {
    return { success: false, error: "ยอดขึ้นจริงต้องเป็นจำนวนเต็ม 0 ขึ้นไป" };
  }

  try {
    await db.$transaction(async (tx) => {
      await casLoadedTrip(tx, tripId, version);
      const line = await tx.loadingLine.findFirst({
        where: { id: lineId, drop: { tripId } },
        select: { id: true, qtyLoaded: true, labelSnapshot: true, drop: { select: { customerId: true, branchId: true } } },
      });
      if (!line) throw new TripConflictError();
      await tx.loadingLine.update({ where: { id: lineId }, data: { qtyLoaded } });
      // before/after เต็มใน AuditLog (oldValue/newValue) — รูปหลักฐานเดิมไม่ถูกแตะ
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "LoadingTrip",
          recordId: tripId,
          customerId: line.drop.customerId,
          branchId: line.drop.branchId,
          reason,
          oldValue: { lineId, label: line.labelSnapshot, qtyLoaded: line.qtyLoaded },
          newValue: { event: "CORRECT_QTY_LOADED", lineId, label: line.labelSnapshot, qtyLoaded },
        },
      });
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "แก้ยอดไม่ได้ — ทำได้เฉพาะช่วง 'ขึ้นของแล้ว รอกระทบยอด' เท่านั้น กรุณาโหลดหน้าใหม่" };
    }
    throw error;
  }
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}

// CP3 — Reconcile: all-or-nothing ธุรกรรมเดียว — คนเป็นผู้ตัดสินว่ายอดขึ้นจริงแต่ละก้อน
// ตัดจากอะไร (ออเดอร์ใหม่/บัตรค้างเดิม/ADHOC) ไม่มี FIFO อัตโนมัติ · ทุกชิ้นต้องมีที่มา
// (Σ allocation ต่อรายการ = qtyLoaded เป๊ะ) เกิน capacity ต้อง resolve เป็น ADHOC เอง ระบบ
// ไม่ over-allocate เงียบๆ · ของค้างใหม่เกิดจาก customer demand (qtyCurrent) ที่ยังไม่ถูก
// fulfill หลัง allocation เที่ยวนี้เท่านั้น — ไม่ใช่ส่วนต่างจากยอดผลิต (lock 3)
type AllocationInput = { kind: "FRESH" | "OUTSTANDING" | "ADHOC"; outstandingId?: string; qty: number };

export async function reconcileLoadingTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "loadingTrip.manage")) throw new Error("FORBIDDEN");
  const version = Number(formData.get("version"));
  if (!Number.isFinite(version)) return { success: false, error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };

  let perLine: { lineId: string; allocations: AllocationInput[] }[];
  try {
    const raw = JSON.parse(String(formData.get("allocationsJson") || "[]"));
    if (!Array.isArray(raw)) throw new Error("bad");
    perLine = raw.map((e: any) => ({
      lineId: String(e.lineId),
      allocations: (Array.isArray(e.allocations) ? e.allocations : []).map((a: any) => ({
        kind: a.kind,
        outstandingId: a.outstandingId ? String(a.outstandingId) : undefined,
        qty: Number(a.qty),
      })),
    }));
    for (const e of perLine) {
      for (const a of e.allocations) {
        if (!["FRESH", "OUTSTANDING", "ADHOC"].includes(a.kind) || !Number.isInteger(a.qty) || a.qty <= 0) throw new Error("bad");
        if (a.kind === "OUTSTANDING" && !a.outstandingId) throw new Error("bad");
      }
    }
  } catch {
    return { success: false, error: "ข้อมูลการตัดยอดไม่ถูกต้อง — กรุณาโหลดหน้าใหม่แล้วจัดสรรอีกครั้ง" };
  }

  try {
    await db.$transaction(async (tx) => {
      await casLoadedTrip(tx, tripId, version);

      const drops = await tx.loadingDrop.findMany({
        where: { tripId },
        select: {
          id: true,
          customerId: true,
          photoPaths: true,
          lines: { select: { id: true, qtyLoaded: true, customerPoLineId: true, sourceType: true } },
        },
      });
      // กฎหลักฐานยังต้องครบ ณ เวลากระทบยอดจริง (รวม ADHOC ที่เพิ่งเพิ่ม)
      if (drops.find((d) => d.lines.length > 0 && d.photoPaths.length === 0)) throw new Error("PHOTO_REQUIRED");

      const allLines = drops.flatMap((d) => d.lines.map((l) => ({ ...l, customerId: d.customerId })));
      const lineById = new Map(allLines.map((l) => [l.id, l]));
      const inputById = new Map(perLine.map((e) => [e.lineId, e.allocations]));
      // ครอบคลุมทุกรายการของเที่ยวเป๊ะ (กันหน้าเก่าค้าง/รายการ ADHOC ที่เพิ่งเพิ่ม)
      if (allLines.length !== perLine.length || allLines.some((l) => !inputById.has(l.id))) throw new Error("LINES_MISMATCH");

      // Σ ต่อรายการต้องเท่ายอดขึ้นจริงเป๊ะ — ทุกชิ้นมีที่มา ไม่ขาดไม่เกิน
      for (const line of allLines) {
        const sum = (inputById.get(line.id) ?? []).reduce((s, a) => s + a.qty, 0);
        if (sum !== (line.qtyLoaded ?? 0)) throw new Error(`ALLOC_SUM_MISMATCH:${line.id}`);
      }

      // FRESH: รวมต่อ customerPoLineId แล้วเช็ค capacity (demand จริงของลูกค้า ไม่ใช่ยอดผลิต)
      const freshByPoLine = new Map<string, number>();
      for (const line of allLines) {
        for (const a of inputById.get(line.id) ?? []) {
          if (a.kind === "FRESH") {
            if (!line.customerPoLineId) throw new Error("FRESH_NEEDS_SOURCE");
            freshByPoLine.set(line.customerPoLineId, (freshByPoLine.get(line.customerPoLineId) ?? 0) + a.qty);
          }
        }
      }
      for (const [poLineId, qty] of freshByPoLine) {
        const { capacity, cancelled } = await freshCapacityFor(tx, poLineId);
        if (cancelled) throw new Error("FRESH_CANCELLED_ORDER");
        if (qty > capacity) throw new Error("FRESH_OVER_CAPACITY");
      }

      // OUTSTANDING: บัตรต้องเปิด + ของลูกค้าเดียวกับจุดส่ง + ไม่ตัดเกินยอดเหลือ (รวมทุกรายการในเที่ยวนี้)
      const outstandingAlloc = new Map<string, number>();
      for (const line of allLines) {
        for (const a of inputById.get(line.id) ?? []) {
          if (a.kind === "OUTSTANDING") outstandingAlloc.set(a.outstandingId!, (outstandingAlloc.get(a.outstandingId!) ?? 0) + a.qty);
        }
      }
      const outstandingById = new Map<string, { remaining: number; customerPoLineId: string }>();
      for (const [oid, qty] of outstandingAlloc) {
        const o = await tx.outstandingDelivery.findFirst({
          where: { id: oid, closedAt: null },
          select: { id: true, qtyOriginal: true, customerPoLineId: true, allocations: { select: { qty: true } } },
        });
        if (!o) throw new Error("OUTSTANDING_NOT_OPEN");
        const remaining = o.qtyOriginal - o.allocations.reduce((s, a) => s + a.qty, 0);
        if (qty > remaining) throw new Error("OUTSTANDING_OVER_REMAINING");
        outstandingById.set(oid, { remaining, customerPoLineId: o.customerPoLineId });
      }

      // สร้าง allocation ledger (immutable) — actorId = ใครเลือก (D1)
      for (const line of allLines) {
        for (const a of inputById.get(line.id) ?? []) {
          await tx.loadingAllocation.create({
            data: {
              loadingLineId: line.id,
              kind: a.kind,
              outstandingId: a.kind === "OUTSTANDING" ? a.outstandingId : null,
              customerPoLineId: a.kind === "FRESH" ? line.customerPoLineId : null,
              qty: a.qty,
              actorId: user.id,
            },
          });
        }
      }

      const now = new Date();
      const correlationId = `reconcile-${tripId}-${now.getTime()}`;

      // ปิดบัตรที่ Σ ครบ (ใน tx เดียวกัน — ไม่มีครึ่งๆ กลางๆ)
      const closedOutstandings: string[] = [];
      for (const [oid, qty] of outstandingAlloc) {
        const info = outstandingById.get(oid)!;
        if (qty === info.remaining) {
          await tx.outstandingDelivery.update({ where: { id: oid }, data: { closedAt: now } });
          closedOutstandings.push(oid);
        }
      }

      // เปิดบัตรค้างใหม่: demand ที่เที่ยวนี้แตะ (FRESH source) แต่ยังไม่ถูก fulfill หลัง
      // allocation — คำนวณจาก capacity ใหม่หลังบันทึก allocation แล้ว (0 สำหรับออเดอร์ที่ถูก
      // ยกเลิก — lock 3) — บัตรเดิมที่เปิดอยู่ไม่ถูกแตะ (อายุไม่ reset — D1/D2)
      const touchedPoLines = [...new Set(allLines.filter((l) => l.customerPoLineId).map((l) => l.customerPoLineId!))];
      const openedOutstandings: { id: string; customerPoLineId: string; qty: number; customerId: string }[] = [];
      for (const poLineId of touchedPoLines) {
        const { capacity, cancelled } = await freshCapacityFor(tx, poLineId);
        if (cancelled || capacity <= 0) continue;
        const created = await tx.outstandingDelivery.create({
          data: { customerPoLineId: poLineId, qtyOriginal: capacity, openedById: user.id, openedFromTripId: tripId, openedAt: now },
        });
        const lineOwner = allLines.find((l) => l.customerPoLineId === poLineId)!;
        openedOutstandings.push({ id: created.id, customerPoLineId: poLineId, qty: capacity, customerId: lineOwner.customerId });
      }

      await tx.loadingTrip.update({ where: { id: tripId }, data: { reconciledAt: now, reconciledById: user.id } });

      // Audit: RECONCILE + OPEN/CLOSE ต่อบัตร — correlationId เดียวกันทั้งหมด
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "LoadingTrip",
          recordId: tripId,
          correlationId,
          newValue: {
            event: "RECONCILE",
            lineCount: allLines.length,
            openedOutstandings: openedOutstandings.map((o) => ({ id: o.id, qty: o.qty })),
            closedOutstandings,
          },
        },
      });
      for (const o of openedOutstandings) {
        const poLine = await tx.customerPOLine.findUniqueOrThrow({
          where: { id: o.customerPoLineId },
          select: { customerPoId: true, customerPo: { select: { customerId: true, branchId: true } } },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CREATE",
            module: "Outstanding",
            recordId: o.id,
            customerId: poLine.customerPo.customerId,
            branchId: poLine.customerPo.branchId,
            customerPoId: poLine.customerPoId,
            correlationId,
            newValue: { event: "OPEN_OUTSTANDING", qtyOriginal: o.qty, fromTripId: tripId },
          },
        });
      }
      for (const oid of closedOutstandings) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            module: "Outstanding",
            recordId: oid,
            correlationId,
            newValue: { event: "CLOSE_OUTSTANDING", fromTripId: tripId },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof TripConflictError) {
      return { success: false, error: "กระทบยอดไม่ได้ — เที่ยวต้องยืนยันขึ้นของแล้ว ยังไม่ถูกกระทบยอด/ยกเลิก และไม่ถูกแก้พร้อมกัน กรุณาโหลดหน้าใหม่" };
    }
    if (error instanceof Error) {
      if (error.message === "PHOTO_REQUIRED") return { success: false, error: "ทุกจุดส่งที่มีรายการต้องมีรูปใบขึ้นของ (หลักฐานมาก่อนตัวเลข)" };
      if (error.message === "LINES_MISMATCH") return { success: false, error: "รายการในเที่ยวถูกแก้ระหว่างเปิดหน้าอยู่ — กรุณาโหลดหน้าใหม่แล้วจัดสรรอีกครั้ง" };
      if (error.message.startsWith("ALLOC_SUM_MISMATCH")) return { success: false, error: "ยอดที่ตัดรวมต้องเท่ายอดขึ้นจริงเป๊ะทุกรายการ (ทุกชิ้นต้องมีที่มา — ส่วนเกินให้ระบุเป็น 'ไม่มีออเดอร์/หน้างาน')" };
      if (error.message === "FRESH_NEEDS_SOURCE") return { success: false, error: "รายการหน้างาน (ไม่มีออเดอร์ต้นทาง) ตัดเป็น 'ออเดอร์ใหม่' ไม่ได้ — เลือกบัตรค้างเดิมหรือระบุเป็นของหน้างาน" };
      if (error.message === "FRESH_CANCELLED_ORDER") return { success: false, error: "ออเดอร์ต้นทางถูกยกเลิกแล้ว — ตัดเป็นออเดอร์ใหม่ไม่ได้ ให้ระบุเป็นของหน้างานหรือบัตรค้างเดิม" };
      if (error.message === "FRESH_OVER_CAPACITY") return { success: false, error: "ตัดออเดอร์ใหม่เกินยอดที่ลูกค้ายังต้องได้จริง — ส่วนเกินให้ระบุเป็น 'ไม่มีออเดอร์/หน้างาน' หรือบัตรค้างเดิม" };
      if (error.message === "OUTSTANDING_NOT_OPEN") return { success: false, error: "บัตรค้างที่เลือกถูกปิด/ไม่พบแล้ว — กรุณาโหลดหน้าใหม่" };
      if (error.message === "OUTSTANDING_OVER_REMAINING") return { success: false, error: "ตัดบัตรค้างเกินยอดที่เหลือ — กรุณาปรับการจัดสรร" };
    }
    throw error;
  }
  revalidatePath("/production/loading");
  revalidatePath(`/production/loading/${tripId}`);
  return { success: true };
}
