"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerPOSchema, customerPOLineInputSchema } from "@/lib/validation";
import { getNextBranchOrderSeq } from "@/lib/branch-order-sequence";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";

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
        status: "OPEN",
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
