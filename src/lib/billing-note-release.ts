import { db } from "@/lib/db";

// ==========================================================================
// Smoke Test R11 (2026-08-25) — Owner ยืนยัน Semantic สุดท้ายของใบวางบิล:
// "ออกจาก Print Preview โดยยังไม่กดยืนยันพิมพ์ = ไม่ต้องมีสถานะค้างอะไรทั้งสิ้น Invoice
// กลับไปอยู่ ยังไม่วางบิล พร้อมใช้เหมือนเดิม"
//
// กลไก: ใบวางบิลถูกสร้างจริง (ต้องมีเลขที่ก่อนพิมพ์กระดาษเสมอ — เลขบนกระดาษต้องตรงกับระบบ)
// แต่ถ้าผู้ใช้กลับมาที่หน้าเลือกใบโดยใบนั้นยังไม่ผ่านการยืนยัน "พิมพ์สำเร็จ" ระบบถือว่า
// "ละทิ้ง" → ยกเลิกใบนั้นให้อัตโนมัติ (สถานะ CANCELLED + ปลด Invoice คืน — กลไกเดียวกับ
// กดยกเลิกเอง) — เลขที่ที่ถูกละทิ้งคงอยู่ในระบบเป็นใบยกเลิก (Audit ครบ ไม่มีเลขหาย)
//
// เรียกจากหน้า "สร้างใบวางบิล" ตอนโหลด (ก่อน Query รายการ) — Idempotent: ไม่มีใบค้าง = ไม่ทำ
// อะไรเลย — CAS ต่อใบกันชนกับการกด "พิมพ์สำเร็จ" พร้อมกันจากแท็บอื่น (ใครเขียนก่อนชนะ:
// ถ้า Mark ชนะ ใบเป็น PRINTED แล้ว CAS นี้ไม่แตะ)
// ==========================================================================

export async function autoReleaseUnprintedBillingNotes(customerId: string, userId: string): Promise<number> {
  const pending = await db.billingNote.findMany({
    where: { customerId, status: "CONFIRMED" },
    select: { id: true, billingNoteNumber: true },
  });
  if (pending.length === 0) return 0;

  let released = 0;
  for (const note of pending) {
    await db.$transaction(async (tx) => {
      const cas = await tx.billingNote.updateMany({
        where: { id: note.id, status: "CONFIRMED" },
        data: { status: "CANCELLED" },
      });
      if (cas.count === 0) return; // มีคน Mark PRINTED/Cancel ตัดหน้าไปแล้ว — ปล่อยผ่าน
      await tx.invoice.updateMany({
        where: { billingNoteId: note.id },
        data: { billingNoteId: null },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "CANCEL",
          module: "BillingNote",
          recordId: note.id,
          oldValue: { status: "CONFIRMED" },
          newValue: { status: "CANCELLED", reason: "AUTO_RELEASED_UNPRINTED", billingNoteNumber: note.billingNoteNumber },
        },
      });
      released += 1;
    });
  }
  return released;
}
