import { db } from "@/lib/db";
import { todayInputValue } from "@/lib/date-utils";
import { createDraftOrder } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";
import { DraftRedirect } from "@/components/draft-return";
import { Suspense } from "react";

export default async function NewOrderPage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    include: { branches: { where: { active: true } } },
    orderBy: { companyName: "asc" },
  });

  const today = todayInputValue();

  return (
    <div className="max-w-xl">
      <Suspense>
        <DraftRedirect docKey="order" />
      </Suspense>
      <a href="/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">สร้างออเดอร์ใหม่</h1>

      <ActionForm id="createOrderForm" action={createDraftOrder} className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        {/* Owner UAT Fix Batch 1 — ข้อ 3: บริษัทที่ไม่มีสาขาต้องสร้างเอกสารได้ด้วย Customer
            อย่างเดียว — เอา required ออก + ป้าย "(ถ้ามี)" แทน "*" */}
        <SelectField label="สาขา (ถ้ามี)" name="branchId" defaultValue="">
          <option value="" disabled>
            — เลือกลูกค้าก่อน —
          </option>
        </SelectField>
        <Field label="วันที่ออเดอร์ *" name="orderDate" type="date" defaultValue={today} required />
        <Field label="อ้างอิง" name="reference" />
        <div className="col-span-1 sm:col-span-2">
          <Field label="สถานที่ส่งสินค้า (ดึงจากที่อยู่สาขา/ลูกค้าอัตโนมัติ แก้ไขได้)" name="placeToDelivery" />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <TextareaField label="หมายเหตุ" name="note" />
        </div>
        <div className="col-span-1 sm:col-span-2 flex items-center gap-1.5 text-sm">
          {/* Owner UAT (2026-08-23) — ค่าเริ่มต้นต้อง "ไม่ติ้ก" ใช้ส่วนลด (เดิม defaultChecked)
              — ติ้กเองเมื่อต้องการใช้จริงเท่านั้น (เหมือนกันทุกประเภทเอกสารที่มี Toggle นี้) */}
          <input id="applyDiscount" type="checkbox" name="applyDiscount" />
          <label htmlFor="applyDiscount">ใช้ส่วนลด (ตาม % กลุ่มส่วนลด / เงื่อนไขลูกค้า-สาขาที่ตั้งไว้)</label>
        </div>
        <div className="col-span-1 sm:col-span-2">
          <SubmitButton pendingLabel="กำลังสร้าง...">สร้างออเดอร์ → ไปคีย์รายการสินค้า</SubmitButton>
        </div>
      </ActionForm>

      {/* สคริปต์เล็กๆ กรอง Branch ตาม Customer ที่เลือก + auto-fill สถานที่ส่งสินค้าจากที่อยู่สาขา
          เขียนแบบ inline script เพราะเป็นแค่ UX helper ไม่ใช่ business logic (แยกจาก server actions ชัดเจน) */}
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
            const customerSelect = document.querySelector('#createOrderForm select[name="customerId"]');
            const branchSelect = document.querySelector('#createOrderForm select[name="branchId"]');
            const placeToDeliveryInput = document.querySelector('#createOrderForm input[name="placeToDelivery"]');
            function updateBranches() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              branchSelect.innerHTML = '';
              // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขาก็ยังสร้างเอกสารได้ — Option ว่าง
              // เลือกได้ปกติ (ไม่ disabled) ไม่บล็อกผู้ใช้อีกต่อไป
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
          `,
        }}
      />
    </div>
  );
}
