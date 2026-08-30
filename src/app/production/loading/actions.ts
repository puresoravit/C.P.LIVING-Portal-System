"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { currentPeriod, formatDocNumber, getNextSeq } from "@/lib/running-number";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

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
  const customerPoLineId = String(formData.get("customerPoLineId") || "").trim();
  if (!customerPoLineId) return { success: false, error: "กรุณาเลือกรายการสินค้า" };
  const qtyPlanned = Number(formData.get("qtyPlanned"));
  if (!Number.isInteger(qtyPlanned) || qtyPlanned <= 0) {
    return { success: false, error: "จำนวนที่วางแผนต้องเป็นจำนวนเต็มมากกว่า 0" };
  }

  try {
    await db.$transaction(async (tx) => {
      await casDraftTrip(tx, tripId, version);
      const drop = await tx.loadingDrop.findFirst({ where: { id: dropId, tripId }, select: { customerId: true, branchId: true } });
      if (!drop) throw new TripConflictError();
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
      return { success: false, error: "รายการที่เลือกไม่พร้อมขึ้นรถแล้ว (อาจถูกยกเลิก/แก้ไข) — กรุณาโหลดหน้าใหม่" };
    }
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
