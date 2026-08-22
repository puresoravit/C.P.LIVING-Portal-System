import { db } from "@/lib/db";
import { createBillingNoteAction } from "../actions";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Owner UAT Fix Batch — ข้อ 2: เพิ่มช่วงวันที่ (วันที่เริ่มต้น → วันที่สิ้นสุด) ก่อนแสดง
// Invoice ที่เข้าเงื่อนไข — Flow เดิม "เลือก Customer → แสดง Invoice → ติ๊ก → สร้าง" ยังคง
// เหมือนเดิมทุกประการ แค่เพิ่ม Filter วันที่เข้าไปในขั้นตอน "แสดง Invoice" เท่านั้น —
// billingNoteId:null + status ≠ CANCELLED (กัน Invoice ถูกวางบิลซ้ำ) ยังคงเดิมไม่แตะ —
// invoiceDate ยังเป็น Field หลักที่ใช้กรองเหมือนเดิม (ตรงกับ Business Rule เดิมของหน้านี้
// ที่ Sort ด้วย invoiceDate อยู่แล้ว ไม่มี Semantic อื่นที่ต้องรักษาเป็นพิเศษ) — createBillingNote
// Action เดิมไม่ต้องแก้เลย เพราะรับแค่ invoiceIds ที่ติ๊กมาจริงอยู่แล้ว (Date Range เป็นแค่
// ตัวช่วยค้นหา ไม่ใช่ Field ที่ต้อง Persist ไปกับ BillingNote)
export default async function NewBillingNotePage(props: { searchParams: Promise<{ customerId?: string; dateFrom?: string; dateTo?: string }> }) {
  const searchParams = await props.searchParams;
  const customers = await db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } });

  const selectedCustomerId = searchParams.customerId;
  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfCurrentMonth();
  // Prisma gte/lte เป็น Inclusive อยู่แล้วโดย Default — dateTo เป็นเที่ยงคืนของวันนั้น
  // (เหมือน Pattern เดิมที่ Order/Invoice List ใช้อยู่แล้วทุกจุด) invoiceDate ในระบบนี้
  // ไม่มี Time Component จริง (เก็บเป็นวันที่ล้วนตอนสร้างเอกสารเสมอ) จึง lte ตรงๆ ครอบคลุม
  // ทั้งวันนั้นถูกต้องอยู่แล้ว ไม่ต้องเติม 23:59:59 เพิ่ม
  const eligibleInvoices = selectedCustomerId
    ? await db.invoice.findMany({
        where: {
          customerId: selectedCustomerId,
          billingNoteId: null,
          status: { not: "CANCELLED" },
          invoiceDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        },
        orderBy: { invoiceDate: "asc" },
      })
    : [];
  const totalAmount = eligibleInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <a href="/billing-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบวางบิล
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบวางบิล</h1>
      <p className="text-sm text-gray-500 mb-4">
        เลือกลูกค้าและช่วงวันที่เพื่อดู Invoice ที่ยังไม่เคยถูกวางบิล แล้วติ๊กใบที่ต้องการรวมเป็นใบวางบิลเดียว
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

      {selectedCustomerId && (
        <form action={createBillingNoteAction}>
          <input type="hidden" name="customerId" value={selectedCustomerId} />
          <div className="bg-white border rounded-lg p-4 mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">วันที่วางบิล *</label>
            <input name="billingNoteDate" type="date" defaultValue={today} required className="border rounded px-3 py-1.5 text-sm" />
          </div>

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
                      ลูกค้ารายนี้ไม่มี Invoice ที่รอวางบิล
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

      {selectedCustomerId && eligibleInvoices.length > 0 && (
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
