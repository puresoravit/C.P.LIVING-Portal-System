import { db } from "@/lib/db";
import { todayInputValue } from "@/lib/date-utils";
import { createDraftQuotation } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";
import { DraftResumeBanner } from "@/components/draft-return";

export default async function NewQuotationPage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    include: { branches: { where: { active: true } } },
    orderBy: { companyName: "asc" },
  });

  const today = todayInputValue();

  return (
    <div className="max-w-xl">
      <DraftResumeBanner docKey="quotation" label="ใบเสนอราคา" />
      <a href="/quotations" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบเสนอราคา
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">สร้างใบเสนอราคาใหม่</h1>

      <ActionForm id="createQuotationForm" action={createDraftQuotation} className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Phase H — Guest/Manual Customer เฉพาะใบเสนอราคา: เลือกได้ว่าจะใช้ลูกค้าใน
            ระบบเดิม หรือกรอกข้อมูลลูกค้าเองโดยไม่สร้าง Customer Master (ข้อมูล Snapshot
            ติดใบเสนอราคา เปิด/พิมพ์ย้อนหลังได้เสมอ) — สลับโหมดด้วย Vanilla Script ตาม
            Pattern เดิมของหน้านี้ (Customer→Branch Cascade) ไม่ใช่ Client Component ใหม่ */}
        <div className="col-span-1 sm:col-span-2 flex gap-4 text-sm border-b pb-3">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="customerMode" value="MASTER" defaultChecked />
            ลูกค้าในระบบ
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="customerMode" value="GUEST" />
            กรอกข้อมูลลูกค้าเอง (ไม่บันทึกเข้าฐานลูกค้า)
          </label>
        </div>

        <div id="masterCustomerFields" className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="ลูกค้า *" name="customerId" autoFocus defaultValue="">
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
        </div>

        <div id="guestCustomerFields" className="col-span-1 sm:col-span-2 hidden grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-1 sm:col-span-2">
            <Field label="ชื่อลูกค้า/บริษัท *" name="guestName" />
          </div>
          <Field label="เลขประจำตัวผู้เสียภาษี" name="guestTaxId" />
          <Field label="โทรศัพท์" name="guestPhone" />
          <Field label="ผู้ติดต่อ" name="guestContact" />
          <div className="col-span-1 sm:col-span-2">
            <TextareaField label="ที่อยู่" name="guestAddress" />
          </div>
        </div>

        <Field label="วันที่เอกสาร *" name="quotationDate" type="date" defaultValue={today} required />
        <Field label="อ้างอิง" name="reference" />
        <Field label="สถานที่ส่งสินค้า (ดึงจากที่อยู่สาขา/ลูกค้าอัตโนมัติ แก้ไขได้)" name="placeToDelivery" />
        <div className="col-span-1 sm:col-span-2">
          <TextareaField label="หมายเหตุ" name="note" />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <SubmitButton pendingLabel="กำลังสร้าง...">สร้างใบเสนอราคา → ไปคีย์รายการสินค้า</SubmitButton>
        </div>
      </ActionForm>

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
              updatePlaceToDelivery();
            }
            function updatePlaceToDelivery() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              const branch = customer && customer.branches.find(b => b.id === branchSelect.value);
              // เลือกสาขา = ดึงที่อยู่สาขา (ค่าสด ณ ตอนโหลดหน้า — แก้ข้อมูลลูกค้าแล้วกลับมา
              // หน้านี้ใหม่จะได้ค่าใหม่เสมอ) — ไม่เลือกสาขา = ล้างช่องให้พิมพ์เอง — พิมพ์
              // แก้ด้วยมือทับได้ตลอดหลังดึงมาแล้ว (Input ธรรมดา ไม่ล็อก)
              placeToDeliveryInput.value = branch ? branch.address : (customer ? customer.address : '');
            }
            customerSelect.addEventListener('change', updateBranches);
            branchSelect.addEventListener('change', updatePlaceToDelivery);

            // Phase H — สลับโหมด MASTER/GUEST: ซ่อน+ปิด (disabled) ฝั่งที่ไม่ใช้ เพื่อไม่ให้
            // ค่าติดไปกับ FormData เลย (Server แยกโหมดด้วย discriminatedUnion อีกชั้น) —
            // required ของ guestName ตั้งเฉพาะตอนโหมด GUEST ไม่งั้น Browser จะบล็อก Submit
            // ของโหมด MASTER เพราะ Field ที่ซ่อนอยู่
            const masterBox = document.getElementById('masterCustomerFields');
            const guestBox = document.getElementById('guestCustomerFields');
            const guestNameInput = document.querySelector('#createQuotationForm input[name="guestName"]');
            function applyCustomerMode() {
              const mode = document.querySelector('#createQuotationForm input[name="customerMode"]:checked').value;
              const isGuest = mode === 'GUEST';
              masterBox.classList.toggle('hidden', isGuest);
              guestBox.classList.toggle('hidden', !isGuest);
              guestBox.classList.toggle('grid', isGuest);
              customerSelect.disabled = isGuest;
              branchSelect.disabled = isGuest;
              customerSelect.required = !isGuest;
              guestBox.querySelectorAll('input, textarea').forEach(el => { el.disabled = !isGuest; });
              guestNameInput.required = isGuest;
            }
            document.querySelectorAll('#createQuotationForm input[name="customerMode"]')
              .forEach(r => r.addEventListener('change', applyCustomerMode));
            applyCustomerMode();
          `,
        }}
      />
    </div>
  );
}
