import { db } from "@/lib/db";
import { createDraftQuotation } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";

export default async function NewQuotationPage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    include: { branches: { where: { active: true } } },
    orderBy: { companyName: "asc" },
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-xl">
      <a href="/quotations" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบเสนอราคา
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">สร้างใบเสนอราคาใหม่</h1>

      <ActionForm id="createQuotationForm" action={createDraftQuotation} className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3">
        <SelectField label="ลูกค้า *" name="customerId" required autoFocus defaultValue="">
          <option value="" disabled>
            เลือกลูกค้า
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName} ({c.code})
            </option>
          ))}
        </SelectField>
        {/* Owner UAT Fix Batch 1 — ข้อ 3 */}
        <SelectField label="สาขา (ถ้ามี)" name="branchId" defaultValue="">
          <option value="" disabled>
            — เลือกลูกค้าก่อน —
          </option>
        </SelectField>
        <Field label="วันที่เอกสาร *" name="quotationDate" type="date" defaultValue={today} required />
        <Field label="อ้างอิง" name="reference" />
        <Field label="สถานที่ส่งสินค้า (ดึงจากที่อยู่สาขาอัตโนมัติ แก้ไขได้)" name="placeToDelivery" />
        <div className="col-span-2">
          <TextareaField label="หมายเหตุ" name="note" />
        </div>
        <div className="col-span-2">
          <SubmitButton pendingLabel="กำลังสร้าง...">สร้างใบเสนอราคา → ไปคีย์รายการสินค้า</SubmitButton>
        </div>
      </ActionForm>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const customersData = ${safeJsonForScript(
              customers.map((c) => ({
                id: c.id,
                branches: c.branches.map((b) => ({ id: b.id, name: b.name, address: b.address ?? "" })),
              }))
            )};
            const customerSelect = document.querySelector('#createQuotationForm select[name="customerId"]');
            const branchSelect = document.querySelector('#createQuotationForm select[name="branchId"]');
            const placeToDeliveryInput = document.querySelector('#createQuotationForm input[name="placeToDelivery"]');
            function updateBranches() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              branchSelect.innerHTML = '';
              const emptyOpt = document.createElement('option');
              emptyOpt.value = '';
              emptyOpt.selected = true;
              if (!customer || customer.branches.length === 0) {
                emptyOpt.textContent = 'ลูกค้ารายนี้ยังไม่มีสาขา — ไม่ต้องเลือก';
                branchSelect.appendChild(emptyOpt);
                placeToDeliveryInput.value = '';
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
              updatePlaceToDelivery();
            }
            function updatePlaceToDelivery() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              const branch = customer && customer.branches.find(b => b.id === branchSelect.value);
              // เลือกสาขา = ดึงที่อยู่สาขา (ค่าสด ณ ตอนโหลดหน้า — แก้ข้อมูลลูกค้าแล้วกลับมา
              // หน้านี้ใหม่จะได้ค่าใหม่เสมอ) — ไม่เลือกสาขา = ล้างช่องให้พิมพ์เอง — พิมพ์
              // แก้ด้วยมือทับได้ตลอดหลังดึงมาแล้ว (Input ธรรมดา ไม่ล็อก)
              placeToDeliveryInput.value = branch ? branch.address : '';
            }
            customerSelect.addEventListener('change', updateBranches);
            branchSelect.addEventListener('change', updatePlaceToDelivery);
          `,
        }}
      />
    </div>
  );
}
