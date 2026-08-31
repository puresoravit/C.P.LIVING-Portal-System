import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelBillingNote } from "../actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CancelButton } from "@/components/cancel-button";
import { CopyDocumentNumber } from "@/components/copy-document-number";
import { discountLinesByInvoiceId, liveTypeNamesByCode, resolveNoteGroupLabel } from "@/lib/billing-note-discount";
import { BackLink } from "@/components/back-link";
import { NumberReleasedBadge } from "@/components/number-released-badge";

// R5 — Label ตรงกับหน้า List (CONFIRMED = สร้างแล้วแต่ยังไม่ยืนยันพิมพ์จริง — ดูเหตุผลเต็ม
// ที่ billing-notes/page.tsx)
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยังไม่พิมพ์", className: "bg-yellow-100 text-yellow-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function BillingNoteDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const note = await db.billingNote.findUnique({
    where: { id: params.id },
    include: { invoices: { orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }] } },
  });
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;
  const status = STATUS_LABEL[note.status];
  const cancelAction = cancelBillingNote.bind(null, note.id);
  const activeSiblingNote = note.numberReleased
    ? await db.billingNote.findFirst({ where: { billingNoteNumber: note.billingNoteNumber, numberReleased: false }, select: { id: true } })
    : null;

  // Smoke Test (2026-08-25) — แจงส่วนลดต่อใบจาก Snapshot ที่เก็บตอนสร้าง (ไม่คำนวณสดซ้ำ)
  // — ใบวางบิล Legacy ที่ไม่มี discountDetail จะได้ Map ว่าง → แสดงผลเหมือนเดิมทุกประการ
  const showDiscount = note.applyDiscount;
  const discountByInvoice = discountLinesByInvoiceId(note.discountDetail);
  // R5 — ชื่อกลุ่มเชื่อมโยงสดกับชื่อปัจจุบันเสมอ (Owner ยืนยัน) — Snapshot เป็นแค่ Fallback
  const liveNames = await liveTypeNamesByCode(note.invoices.map((inv) => inv.productTypeCode));
  const grossTotal = note.invoices.reduce((s, inv) => s + Number(inv.grandTotal), 0);
  const discountTotal = grossTotal - Number(note.totalAmount);
  // R9 — Owner: ไม่ว่าจะติ๊กส่วนลดหรือไม่ ใบวางบิลต้องบอกชัดว่าเป็นกลุ่มส่วนลดไหน (R7 แยกใบ
  // ตามกลุ่มเสมออยู่แล้ว) — Resolve จากชื่อกลุ่มปัจจุบันของทุก Invoice ในใบนี้
  const groupLabel = resolveNoteGroupLabel(
    note.invoices.map((inv) => liveNames.get(inv.productTypeCode) ?? "ไม่ระบุกลุ่มส่วนลด")
  );

  return (
    <div className="max-w-3xl">
      <BackLink href="/billing-notes">← กลับไปรายการใบวางบิล</BackLink>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono flex items-center gap-1.5">
          {note.billingNoteNumber}
          <CopyDocumentNumber value={note.billingNoteNumber} />
        </h1>
        <span className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
          {note.numberReleased && <NumberReleasedBadge />}
        </span>
      </div>
      {note.numberReleased && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          เลขที่นี้ถูกยกเลิกก่อนใช้งานจริงและถูกปล่อยคืนให้เอกสารถัดไปใช้ต่อแล้ว
          {activeSiblingNote && (
            <>
              {" "}
              — <a href={`/billing-notes/${activeSiblingNote.id}`} className="underline">ดูเอกสารที่ใช้เลขนี้อยู่ตอนนี้</a>
            </>
          )}
        </p>
      )}
      <p className="text-sm text-gray-500 mb-4">
        {note.customerNameSnapshot} · {note.billingNoteDate.toLocaleDateString("th-TH")}
        {groupLabel && (
          <>
            {" "}
            · <span className="font-medium text-gray-700">กลุ่มส่วนลด: {groupLabel}</span>
          </>
        )}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">วันครบกำหนด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
              {showDiscount && <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>}
              {showDiscount && <th className="px-4 py-2 font-medium text-right">สุทธิ</th>}
            </tr>
          </thead>
          <tbody>
            {note.invoices.map((inv) => {
              const line = discountByInvoice.get(inv.id);
              const discountAmount = line?.amount ?? 0;
              const typeName = liveNames.get(inv.productTypeCode) ?? line?.typeName ?? null;
              return (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2">
                    <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{addDays(inv.invoiceDate, creditDays).toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  {showDiscount && (
                    <td className="px-4 py-2 text-right">
                      {line?.alreadyDiscounted ? (
                        <span className="text-xs text-gray-400 whitespace-nowrap">หักแล้วตอนออกใบ</span>
                      ) : discountAmount > 0 ? (
                        <span className="whitespace-nowrap">
                          {money(discountAmount)}{" "}
                          <span className="text-xs text-gray-500">
                            ({line!.pct}%{typeName ? ` — ${typeName}` : ""})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  {showDiscount && <td className="px-4 py-2 text-right">{money(Number(inv.grandTotal) - discountAmount)}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td colSpan={3} className="px-4 py-2 text-right">
                รวม
              </td>
              {showDiscount ? (
                <>
                  <td className="px-4 py-2 text-right">{money(grossTotal)}</td>
                  <td className="px-4 py-2 text-right text-red-600">-{money(discountTotal)}</td>
                  <td className="px-4 py-2 text-right">{money(note.totalAmount)}</td>
                </>
              ) : (
                <td className="px-4 py-2 text-right">{money(note.totalAmount)}</td>
              )}
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <div className="flex gap-2">
        <a
          href={`/billing-notes/${note.id}/print`}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          พิมพ์เอกสาร
        </a>
        {note.status !== "CANCELLED" && (
          <CancelButton
            action={cancelAction}
            confirmMessage="ยืนยันยกเลิกใบวางบิลนี้? (Invoice จะกลับไปวางบิลใหม่ได้)"
            label="ยกเลิก (Invoice จะกลับไปวางบิลใหม่ได้)"
            successMessage="ยกเลิกใบวางบิลสำเร็จ"
          />
        )}
      </div>
    </div>
  );
}
