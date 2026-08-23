import { db } from "@/lib/db";
import { createBillingNoteAction } from "../actions";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Owner UAT Fix Batch — ข้อ 2: เพิ่มช่วงวันที่ (วันที่เริ่มต้น → วันที่สิ้นสุด) ก่อนแสดง
// Invoice ที่เข้าเงื่อนไข — Flow เดิม "เลือก Customer → แสดง Invoice → ติ๊ก → สร้าง" ยังคง
// เหมือนเดิมทุกประการ แค่เพิ่ม Filter วันที่เข้าไปในขั้นตอน "แสดง Invoice" เท่านั้น —
// billingNoteId:null (กัน Invoice ถูกวางบิลซ้ำ) ยังคงเดิมไม่แตะ — invoiceDate ยังเป็น
// Field หลักที่ใช้กรองเหมือนเดิม (ตรงกับ Business Rule เดิมของหน้านี้ที่ Sort ด้วย
// invoiceDate อยู่แล้ว ไม่มี Semantic อื่นที่ต้องรักษาเป็นพิเศษ) — createBillingNote
// Action เดิมไม่ต้องแก้เลย เพราะรับแค่ invoiceIds ที่ติ๊กมาจริงอยู่แล้ว (Date Range เป็นแค่
// ตัวช่วยค้นหา ไม่ใช่ Field ที่ต้อง Persist ไปกับ BillingNote)
//
// Owner UAT Fix Batch 3 — ข้อ 1: Source ต้องเป็น Invoice ที่ status=PRINTED เท่านั้น (ผ่าน
// Checkpoint กระดาษต่อเนื่อง 9×11 จริง — Audit แล้วว่า markInvoicePrinted (invoices/
// actions.ts) เขียน status="PRINTED" ได้ก็ต่อเมื่อ printProfile==="continuous" เท่านั้น
// เข้มงวดอยู่แล้วตั้งแต่ R6 Phase D ไม่มีทางเกิดจาก A4/เปิด Preview เฉยๆ) — เดิมใช้
// status:{not:"CANCELLED"} ซึ่งหลุดรวม CONFIRMED-แต่ยังไม่พิมพ์มาด้วยผิดๆ แก้เป็น
// status:"PRINTED" ตรงๆ — เอาช่อง "วันที่วางบิล" แยกออกจาก Flow แล้ว (ไม่จำเป็นต้องให้
// User กรอกเอง เพราะเป็นแค่วันที่ออกเอกสารจริง = วันนี้เสมอในทางปฏิบัติ) แต่ยังคง Field
// เดิมของ BillingNote/createBillingNote Action ไว้ทั้งหมด (ยังต้องมีค่าอยู่ดีเพราะขับ
// วันครบกำหนด = billingNoteDate + creditDays) แค่ส่งเป็น Hidden Input ค่าวันนี้แทนให้
// User กรอกเอง (Server-computed ค่าเดียว ไม่มี Hydration Risk)
export default async function NewBillingNotePage(props: {
  searchParams: Promise<{ customerId?: string; dateFrom?: string; dateTo?: string; billing?: string }>;
}) {
  const searchParams = await props.searchParams;
  const customers = await db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } });

  const selectedCustomerId = searchParams.customerId;
  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  // Owner UAT — ต้องดู/สลับได้ทั้ง 2 สถานะของ PRINTED Invoice ในหน้านี้เลย (ยังไม่วางบิล
  // / วางบิลแล้ว) ตาม Customer+ช่วงวันที่เดียวกัน ไม่ใช่แค่เห็นฝั่งที่เลือกได้อย่างเดียว —
  // "วางบิลแล้ว" เป็น View-only (เชื่อมไปดู Billing Note ที่ผูกอยู่ได้) ห้ามเลือกสร้างซ้ำ
  // ตาม Business Rule เดิม — ทั้งสอง Query ใช้เงื่อนไข Customer+Date Range เดียวกันเป๊ะ
  // ต่างกันแค่ billingNoteId เท่านั้น (Reuse Relation เดิม ไม่มี Query ใหม่)
  const billingView = searchParams.billing === "billed" ? "billed" : "unbilled";
  // Prisma gte/lte เป็น Inclusive อยู่แล้วโดย Default — dateTo เป็นเที่ยงคืนของวันนั้น
  // (เหมือน Pattern เดิมที่ Order/Invoice List ใช้อยู่แล้วทุกจุด) invoiceDate ในระบบนี้
  // ไม่มี Time Component จริง (เก็บเป็นวันที่ล้วนตอนสร้างเอกสารเสมอ) จึง lte ตรงๆ ครอบคลุม
  // ทั้งวันนั้นถูกต้องอยู่แล้ว ไม่ต้องเติม 23:59:59 เพิ่ม
  const invoiceDateFilter = { gte: new Date(dateFrom), lte: new Date(dateTo) };
  const [eligibleInvoices, billedInvoices] = selectedCustomerId
    ? await Promise.all([
        db.invoice.findMany({
          where: { customerId: selectedCustomerId, billingNoteId: null, status: "PRINTED", invoiceDate: invoiceDateFilter },
          orderBy: { invoiceDate: "asc" },
        }),
        db.invoice.findMany({
          where: { customerId: selectedCustomerId, billingNoteId: { not: null }, status: "PRINTED", invoiceDate: invoiceDateFilter },
          include: { billingNote: { select: { id: true, billingNoteNumber: true } } },
          orderBy: { invoiceDate: "asc" },
        }),
      ])
    : [[], []];
  const totalAmount = eligibleInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
  const billedTotalAmount = billedInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);

  const today = new Date().toISOString().slice(0, 10);
  const viewLinkParams = (billing: "unbilled" | "billed") =>
    new URLSearchParams({
      ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
      dateFrom,
      dateTo,
      billing,
    }).toString();

  return (
    <div className="max-w-3xl">
      <a href="/billing-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบวางบิล
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบวางบิล</h1>
      <p className="text-sm text-gray-500 mb-4">
        เลือกลูกค้าและช่วงวันที่เพื่อดู Invoice ที่พิมพ์แล้ว (9×11) และยังไม่เคยถูกวางบิล แล้วติ๊กใบที่ต้องการรวมเป็นใบวางบิลเดียว
      </p>

      <form method="get" className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-4 gap-3 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า</label>
          <select
            name="customerId"
            defaultValue={selectedCustomerId ?? ""}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              เลือกลูกค้า
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่มต้น</label>
          <input name="dateFrom" type="date" defaultValue={dateFrom} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
          <input name="dateTo" type="date" defaultValue={dateTo} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-4">
          <button className="text-sm text-blue-600 hover:underline">ดู Invoice ที่ยังไม่วางบิล</button>
        </div>
      </form>

      {/* Owner UAT — สลับดู 2 สถานะของ Invoice ที่ PRINTED ในช่วง Customer+วันที่เดียวกันนี้
          ได้เลย: "ยังไม่วางบิล" (เลือกสร้างใบวางบิลได้ — Default) กับ "วางบิลแล้ว" (View-only
          เชื่อมไปดู Billing Note ที่ผูกอยู่ได้ ห้ามเลือกสร้างซ้ำตาม Business Rule เดิม) */}
      {selectedCustomerId && (
        <div className="flex gap-1 mb-3 border-b">
          <a
            href={`/billing-notes/new?${viewLinkParams("unbilled")}`}
            className={`px-3 py-2 text-sm border-b-2 ${
              billingView === "unbilled" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            ยังไม่วางบิล <span className={billingView === "unbilled" ? "text-blue-600" : "text-gray-400"}>({eligibleInvoices.length})</span>
          </a>
          <a
            href={`/billing-notes/new?${viewLinkParams("billed")}`}
            className={`px-3 py-2 text-sm border-b-2 ${
              billingView === "billed" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            วางบิลแล้ว <span className={billingView === "billed" ? "text-blue-600" : "text-gray-400"}>({billedInvoices.length})</span>
          </a>
        </div>
      )}

      {selectedCustomerId && billingView === "billed" && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
                <th className="px-4 py-2 font-medium">ใบวางบิลที่ผูกอยู่</th>
              </tr>
            </thead>
            <tbody>
              {billedInvoices.map((inv) => (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2 font-mono">
                    <a href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  <td className="px-4 py-2">
                    {inv.billingNote && (
                      <a
                        href={`/billing-notes/${inv.billingNote.id}`}
                        className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap"
                      >
                        {inv.billingNote.billingNoteNumber}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {billedInvoices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    ลูกค้ารายนี้ไม่มี Invoice ที่วางบิลแล้วในช่วงวันที่นี้
                  </td>
                </tr>
              )}
            </tbody>
            {billedInvoices.length > 0 && (
              <tfoot>
                <tr className="border-t font-medium bg-gray-50">
                  <td colSpan={2} className="px-4 py-2 text-right">
                    รวม ({billedInvoices.length} ใบ)
                  </td>
                  <td className="px-4 py-2 text-right">{money(billedTotalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {selectedCustomerId && billingView === "unbilled" && (
        <form action={createBillingNoteAction}>
          <input type="hidden" name="customerId" value={selectedCustomerId} />
          {/* Owner UAT Fix Batch 3 — ข้อ 1: เอาช่อง "วันที่วางบิล" ออกจาก Flow ที่ User ต้อง
              กรอกเอง — Field เดิมของ createBillingNote Action ยังต้องมีค่าอยู่ (ขับวันครบ
              กำหนด = วันนี้ + creditDays) จึงส่งเป็น Hidden Input ค่าวันนี้ (Server-computed
              ตอน Render หน้า ไม่มี Hydration Risk เพราะเป็นค่าคงที่ ไม่เปลี่ยนหลัง Mount) */}
          <input type="hidden" name="billingNoteDate" value={today} />

          <div className="bg-white border rounded-lg overflow-hidden mb-4">
            <table id="billingNoteInvoiceTable" className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {eligibleInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        name="invoiceIds"
                        value={inv.id}
                        data-amount={Number(inv.grandTotal)}
                        defaultChecked
                        className="billing-note-invoice-checkbox"
                      />
                    </td>
                    <td className="px-4 py-2 font-mono">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  </tr>
                ))}
                {eligibleInvoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      ลูกค้ารายนี้ไม่มี Invoice ที่พิมพ์แล้ว (9×11) และยังไม่ถูกวางบิลในช่วงวันที่นี้
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Owner UAT Fix Batch — ข้อ 2: "สรุปยอด" ตาม Flow ที่ระบุ (เลือก Customer →
                  เลือก Date Range → แสดง Invoice ที่เข้าเงื่อนไข → สรุปยอด → สร้าง) — ค่า
                  เริ่มต้น Server คำนวณจาก Invoice ที่เข้าเงื่อนไขทั้งหมด (ตรงกับตอนโหลดหน้า
                  ที่ Checkbox ทุกกล่อง defaultChecked อยู่แล้ว ไม่มี Hydration Mismatch) แล้ว
                  อัปเดตสดด้วย Vanilla Script เมื่อผู้ใช้ติ๊ก/ยกเลิกติ๊กบางใบออก */}
              {eligibleInvoices.length > 0 && (
                <tfoot>
                  <tr className="border-t font-medium bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-right">
                      สรุปยอด ({eligibleInvoices.length} ใบ)
                    </td>
                    <td id="billingNoteTotal" className="px-4 py-2 text-right">
                      {money(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {eligibleInvoices.length > 0 && (
            <button className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded px-4 py-2">
              ✓ สร้างใบวางบิลจากรายการที่เลือก
            </button>
          )}
        </form>
      )}

      {selectedCustomerId && billingView === "unbilled" && eligibleInvoices.length > 0 && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const boxes = Array.from(document.querySelectorAll('.billing-note-invoice-checkbox'));
              const totalCell = document.getElementById('billingNoteTotal');
              function recomputeBillingNoteTotal() {
                const sum = boxes.filter(b => b.checked).reduce((s, b) => s + Number(b.dataset.amount || 0), 0);
                totalCell.textContent = sum.toLocaleString('th-TH', { minimumFractionDigits: 2 });
              }
              boxes.forEach(b => b.addEventListener('change', recomputeBillingNoteTotal));
            `,
          }}
        />
      )}
    </div>
  );
}
