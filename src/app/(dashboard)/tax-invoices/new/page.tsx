import { db } from "@/lib/db";
import { todayInputValue } from "@/lib/date-utils";
import { createManualTaxInvoice } from "../actions";
import { ManualTaxInvoiceItemEntry } from "@/components/manual-tax-invoice-item-entry";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { getEffectiveVatRate } from "@/lib/pricing";

export default async function NewTaxInvoicePage() {
  const [customers, vatPctToday] = await Promise.all([
    db.customer.findMany({
      where: { active: true },
      include: { branches: { where: { active: true } } },
      orderBy: { companyName: "asc" },
    }),
    // Phase H — อัตรา VAT จริงจาก configuration (ห้าม Hardcode 7) สำหรับ Preview ฝั่ง
    // Client — ตอนสร้างจริง Server อ่านอัตราตามวันที่เอกสารซ้ำอีกครั้งเสมอ
    getEffectiveVatRate(new Date()),
  ]);

  const today = todayInputValue();

  return (
    <div className="max-w-4xl">
      <a href="/tax-invoices" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบกำกับภาษี
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบกำกับภาษี (เลือกรายการเอง)</h1>
      <p className="text-sm text-gray-500 mb-4">
        ใช้เมื่อลูกค้าแจ้งรายการ/ยอดที่ต้องการออกใบกำกับภาษีมาเอง (ไม่จำเป็นต้องตรงกับใบส่งของทั้งหมด)
        กรอกรายการตามที่ลูกค้าแจ้ง ระบบจะคำนวณ VAT ให้อัตโนมัติจากยอดรวม
      </p>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
          <select
            name="customerId"
            form="taxInvoiceForm"
            id="customerSelect"
            required
            defaultValue=""
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
        {/* Owner UAT Fix Batch 1 — ข้อ 3 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สาขา (ถ้ามี)</label>
          <select
            name="branchId"
            form="taxInvoiceForm"
            id="branchSelect"
            defaultValue=""
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              — เลือกลูกค้าก่อน —
            </option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ *</label>
          <input
            name="taxInvoiceDate"
            form="taxInvoiceForm"
            type="date"
            defaultValue={today}
            required
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สถานที่ส่งสินค้า (ดึงจากที่อยู่สาขา/ลูกค้าอัตโนมัติ แก้ไขได้)</label>
          <input
            name="placeToDelivery"
            form="taxInvoiceForm"
            id="placeToDelivery"
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <ManualTaxInvoiceItemEntry createAction={createManualTaxInvoice} vatPctToday={Number(vatPctToday)} />

      {/* เชื่อม input ของ customer/branch/date เข้ากับ form หลักที่อยู่ใน ManualTaxInvoiceItemEntry
          ผ่าน form="taxInvoiceForm" attribute — ต้องตั้งชื่อ form ให้ตรงกัน */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const customersData = ${safeJsonForScript(
              customers.map((c) => ({
                id: c.id,
                // Owner UAT (2026-08-23) — address ของลูกค้าเอง: Fallback เมื่อไม่เลือกสาขา
                address: c.address ?? "",
                branches: c.branches.map((b) => ({ id: b.id, name: b.name, address: b.address ?? "" })),
              }))
            )};
            const customerSelect = document.getElementById('customerSelect');
            const branchSelect = document.getElementById('branchSelect');
            const placeToDeliveryInput = document.getElementById('placeToDelivery');
            function updateBranches() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              branchSelect.innerHTML = '';
              const emptyOpt = document.createElement('option');
              emptyOpt.value = '';
              emptyOpt.selected = true;
              if (!customer || customer.branches.length === 0) {
                emptyOpt.textContent = 'ลูกค้ารายนี้ยังไม่มีสาขา — ไม่ต้องเลือก';
                branchSelect.appendChild(emptyOpt);
                placeToDeliveryInput.value = customer ? customer.address : '';
                return;
              }
              emptyOpt.textContent = '— ไม่ระบุสาขา —';
              branchSelect.appendChild(emptyOpt);
              customer.branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                branchSelect.appendChild(opt);
              });
              // Owner UAT (2026-08-23) — ลูกค้ามีสาขาเดียว: เลือกสาขานั้นให้ทันทีตั้งแต่
              // เลือกลูกค้า เพื่อให้ที่อยู่ถูกดึงจากฐานข้อมูลเลย (ไม่ต้องกดเลือกสาขาซ้ำ)
              if (customer.branches.length === 1) branchSelect.value = customer.branches[0].id;
              updatePlace();
            }
            function updatePlace() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              const branch = customer && customer.branches.find(b => b.id === branchSelect.value);
              // เลือกสาขา = ดึงที่อยู่สาขา (ค่าสด ณ ตอนโหลดหน้า) — ไม่เลือกสาขา = ล้างช่อง
              // ให้พิมพ์เอง — พิมพ์แก้ด้วยมือทับได้ตลอดหลังดึงมาแล้ว (Input ธรรมดา ไม่ล็อก)
              placeToDeliveryInput.value = branch ? branch.address : (customer ? customer.address : '');
            }
            customerSelect.addEventListener('change', updateBranches);
            branchSelect.addEventListener('change', updatePlace);
          `,
        }}
      />
    </div>
  );
}
