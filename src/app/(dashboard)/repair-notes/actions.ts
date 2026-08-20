"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const createSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().min(1, "กรุณาเลือกสาขา"),
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
    branchId: formData.get("branchId"),
    noteDate: formData.get("noteDate"),
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    reference: formData.get("reference") || undefined,
    remark: formData.get("remark") || undefined,
    items: itemsRaw,
  });

  const [customer, branch] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: parsed.customerId } }),
    db.branch.findUniqueOrThrow({ where: { id: parsed.branchId } }),
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
        branchId: parsed.branchId,
        customerNameSnapshot: customer.companyName,
        addressSnapshot: branch.address,
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

export async function cancelRepairReturnNote(id: string) {
  const user = await requireUser();
  if (!can(user.role, "repairNote.cancel")) throw new Error("FORBIDDEN");

  const note = await db.repairReturnNote.findUniqueOrThrow({ where: { id } });
  if (note.status === "CANCELLED") throw new Error("เอกสารนี้ถูกยกเลิกไปแล้ว");

  const before = note.status;
  await db.repairReturnNote.update({ where: { id }, data: { status: "CANCELLED" } });

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
}
