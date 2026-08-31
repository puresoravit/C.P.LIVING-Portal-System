"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod, releaseSeqIfLatest } from "@/lib/running-number";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

const itemSchema = z.object({
  description: z.string().min(1),
  // Owner UAT Fix Batch 1 — ข้อ 5: เชื่อม Product Search Picker เข้ากับเอกสารนี้ —
  // size เป็น Autofill Helper ล้วนๆ (Client-side) ยังไม่ผูก FK ตามเจตนาเดิม
  size: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const createSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  // Owner UAT Fix Batch 1 — ข้อ 3: เหมือน Order ทุกประการ
  branchId: z.string().optional(),
  noteDate: z.coerce.date(),
  placeToDelivery: z.string().optional(),
  reference: z.string().optional(),
  remark: z.string().optional(),
  items: z.array(itemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

// เอกสารนี้ไม่ผูกกับ Order/Invoice หรือ Pricing Engine เลย (ไม่ใช่การขาย)
// เป็นแค่บันทึกว่าส่งสินค้าที่ซ่อมเสร็จแล้วคืนลูกค้า
export async function createRepairReturnNote(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "repairNote.create")) throw new Error("FORBIDDEN");

  const itemsRaw = JSON.parse(String(formData.get("itemsJson") || "[]"));

  const parsed = createSchema.parse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    noteDate: formData.get("noteDate"),
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    reference: formData.get("reference") || undefined,
    remark: formData.get("remark") || undefined,
    items: itemsRaw,
  });

  const [customer, branch] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: parsed.customerId } }),
    // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขาได้แล้ว
    parsed.branchId ? db.branch.findUniqueOrThrow({ where: { id: parsed.branchId } }) : Promise.resolve(null),
  ]);

  const period = currentPeriod(parsed.noteDate);

  const note = await db.$transaction(async (tx) => {
    const seq = await getNextSeq("DEP", period, tx);
    const noteNumber = formatDocNumber("DEP", period, seq, 3);

    const created = await tx.repairReturnNote.create({
      data: {
        noteNumber,
        noteDate: parsed.noteDate,
        customerId: parsed.customerId,
        branchId: parsed.branchId ?? null,
        customerNameSnapshot: customer.companyName,
        addressSnapshot: branch?.address ?? customer.address ?? null,
        placeToDelivery: parsed.placeToDelivery,
        reference: parsed.reference,
        remark: parsed.remark,
        status: "CONFIRMED",
        createdById: user.id,
        items: { create: parsed.items },
      },
    });

    await tx.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "RepairReturnNote", recordId: created.id, newValue: { noteNumber } },
    });

    return created;
  });

  revalidatePath("/repair-notes");
  redirect(`/repair-notes/${note.id}`);
}

export async function cancelRepairReturnNote(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "repairNote.cancel")) throw new Error("FORBIDDEN");

  const note = await db.repairReturnNote.findUniqueOrThrow({ where: { id } });
  // Phase E1 — return แทน throw สำหรับ Validation Error ที่คาดไว้แล้ว (ดู
  // src/lib/action-result.ts สำหรับ root cause)
  if (note.status === "CANCELLED") return { success: false, error: "เอกสารนี้ถูกยกเลิกไปแล้ว" };

  const before = note.status;
  // Final Audit — CAS กัน Concurrent Status Change (Pattern C1/C2 เดิม)
  const cas = await db.repairReturnNote.updateMany({
    where: { id, status: before },
    data: { status: "CANCELLED" },
  });
  if (cas.count === 0) {
    return { success: false, error: "สถานะเอกสารเปลี่ยนไปแล้วระหว่างดำเนินการ — กรุณารีเฟรชหน้าแล้วลองใหม่" };
  }

  await releaseSeqIfLatest("DEP", note.noteNumber);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CANCEL",
      module: "RepairReturnNote",
      recordId: id,
      oldValue: { status: before },
      newValue: { status: "CANCELLED" },
    },
  });

  revalidatePath(`/repair-notes/${id}`);
  revalidatePath("/repair-notes");
  return { success: true };
}
