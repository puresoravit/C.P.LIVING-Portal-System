import { db } from "@/lib/db";
import { createProduct, toggleProductActive, deleteProduct } from "./actions";
import { bulkAssignProductModel } from "../product-models/actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { CancelButton } from "@/components/cancel-button";

export default async function ProductsPage(props: { searchParams: Promise<{ q?: string; unassigned?: string }> }) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim();
  const unassignedOnly = searchParams.unassigned === "1";

  const [products, productTypes, categories, productModels] = await Promise.all([
    db.product.findMany({
      where: {
        ...(q
          ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] }
          : {}),
        ...(unassignedOnly ? { modelId: null } : {}),
      },
      include: {
        productType: true,
        category: true,
        model: true,
        _count: { select: { priceRules: true, orderItems: true, invoiceItems: true, quotationItems: true, sizeVariants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const unassignedCount = await db.product.count({ where: { modelId: null } });

  // ข้อมูลสำหรับ Model dropdown ที่กรองตาม Type ที่เลือก (Pattern เดียวกับ
  // Customer→Branch dependent select ที่ใช้อยู่แล้วในระบบ) — ไม่ auto-derive ชื่อ
  // Model จากอะไรทั้งสิ้น เป็นแค่ filter รายการที่มีอยู่แล้วให้เลือกง่ายขึ้น
  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-4">สินค้า</h1>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มสินค้าใหม่</summary>
        <ActionForm id="createProductForm" action={createProduct} successMessage="เพิ่มสินค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-3 gap-3">
          <Field label="รหัสสินค้า / Code (เว้นว่าง = ระบบสร้างให้อัตโนมัติ)" name="sku" />
          <div className="col-span-2">
            <Field label="ชื่อสินค้า *" name="name" required />
          </div>
          <SelectField label="กลุ่มส่วนลด (ถ้ามี)" name="productTypeId" defaultValue="">
            <option value="">— ไม่ระบุกลุ่มส่วนลด —</option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="ประเภทสินค้า (ถ้ามี)" name="categoryId" defaultValue="">
            <option value="">— ไม่ระบุประเภทสินค้า —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {/* Owner UAT — ข้อ 1: "รุ่นสินค้า" เป็น Legacy/Advanced แล้ว — ปกติไม่ต้องใช้อีก
              ต่อไป (เว้นว่างไว้เสมอ) เพราะ Size/Pricing ทำงานจาก Product ตรงๆ ได้แล้วผ่าน
              ช่อง "ราคาต่อฟุต" ด้านล่าง — ยังคง Field ไว้เพื่อ Backward Compatible กับ
              Workflow เดิม (ผูก Product เข้ากับ ProductModel ที่มีอยู่แล้วได้เหมือนเดิม) */}
          <SelectField label="รุ่นสินค้า (Legacy — ปกติไม่ต้องใช้)" name="modelId" defaultValue="">
            <option value="">— ไม่ผูก (ปกติ) —</option>
          </SelectField>
          {/* Owner UAT — ข้อ 1: เตือนเฉพาะกรณีเลือกประเภทสินค้าที่ใช้ขนาด แต่ทั้งไม่ได้ผูก
              รุ่นสินค้า (Legacy) และไม่ได้กรอกราคาต่อฟุตด้านล่างเลย — ชี้ตรงไปที่ช่องราคาต่อ
              ฟุตในฟอร์มนี้เอง ไม่ต้องออกไปหน้าอื่นอีกต่อไป */}
          <div id="createUsesSizeWarning" className="col-span-3 hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠️ ประเภทสินค้านี้ใช้ขนาด (Size) — กรุณากรอก &quot;ราคาต่อฟุต&quot; ด้านล่าง เพื่อให้เลือกขนาดได้ตอนออกเอกสาร
            มิฉะนั้นสินค้านี้จะไม่มีตัวเลือกขนาดให้เลือกเลย
          </div>
          <Field label="หน่วย * (เช่น หลัง, ใบ)" name="unit" required />
          {/* Owner UAT Fix Batch 1 — ข้อ 1: ป้ายราคาสลับตาม ProductCategory.usesSize ที่
              เลือก (ราคาต่อฟุต / ราคาต่อหน่วย) — ยังคงเป็น Field เดียวกัน (standardPrice)
              ไม่มีการเพิ่ม Field คู่ขนานใดๆ ทั้งสิ้น เปลี่ยนแค่ป้ายข้อความให้ตรงความหมาย */}
          <Field label="ราคาตั้งต้น (รวม VAT) *" name="standardPrice" type="number" required />
          {/* Owner UAT — ข้อ 1: Product เป็น Size Family Anchor ของตัวเองได้เลย ไม่ต้อง
              สร้างรุ่นสินค้าแยก — กรอกราคาต่อฟุตตรงนี้ = ระบบสร้าง/อัปเดต Size 3/3.5/4/5/6
              ฟุต + ขนาดพิเศษ ให้อัตโนมัติทันที (เหมือนหน้ารุ่นสินค้าทุกประการ) เว้นว่าง =
              สินค้านี้มีราคาเดียวตายตัว ไม่มี Size ย่อย — ใช้ไม่ได้ถ้าผูกรุ่นสินค้า (Legacy)
              ไว้ด้านบนแล้ว (เลือกได้ทางใดทางหนึ่งเท่านั้น) */}
          <div id="createPricePerFootWrap" className="col-span-3 hidden">
            <Field
              label="ราคาต่อฟุต (รวม VAT) — กรอกเพื่อสร้าง Size 3/3.5/4/5/6 ฟุต + ขนาดพิเศษ อัตโนมัติ (เว้นว่าง = ไม่มี Size ย่อย)"
              name="pricePerFoot"
              type="number"
            />
          </div>
          <div className="col-span-3">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <div className="col-span-3">
            <SubmitButton>บันทึกสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="flex items-center justify-between mb-3 gap-3">
        <form className="flex-1">
          <input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาด้วยรหัสสินค้าหรือชื่อสินค้า..."
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>
        <a
          href={unassignedOnly ? "/products" : "/products?unassigned=1"}
          className={`text-xs whitespace-nowrap px-3 py-2 rounded border ${
            unassignedOnly ? "bg-amber-50 border-amber-300 text-amber-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {unassignedOnly ? "✓ " : ""}ยังไม่ระบุรุ่นสินค้า ({unassignedCount})
        </a>
      </div>

      {unassignedOnly && productModels.length > 0 && (
        <ActionForm
          id="bulkAssignForm"
          action={bulkAssignProductModel}
          successMessage="กำหนดรุ่นสินค้าสำเร็จ"
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2 text-sm"
        >
          <span className="text-gray-600 shrink-0">กำหนดรุ่นสินค้าให้รายการที่เลือกไว้ทั้งหมดเป็น:</span>
          <div className="flex-1">
            <SelectField label="" name="modelId" required defaultValue="">
              <option value="" disabled>
                เลือกรุ่นสินค้า
              </option>
              {productModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          <SubmitButton className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded px-3 py-1.5">
            กำหนดรุ่น
          </SubmitButton>
        </ActionForm>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {unassignedOnly && <th className="px-4 py-2 w-8"></th>}
              <th className="px-4 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium">ประเภทสินค้า</th>
              <th className="px-4 py-2 font-medium">รุ่นสินค้า</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคาตั้งต้น</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                {unassignedOnly && (
                  <td className="px-4 py-2">
                    <input type="checkbox" name="productId" value={p.id} form="bulkAssignForm" className="product-checkbox" />
                  </td>
                )}
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">
                  {p.productType ? p.productType.name : <span className="text-gray-400">ไม่ระบุกลุ่มส่วนลด</span>}
                </td>
                <td className="px-4 py-2">
                  {p.category ? p.category.name : <span className="text-gray-400">— ไม่ระบุ —</span>}
                </td>
                <td className="px-4 py-2">
                  {p.model ? p.model.name : <span className="text-gray-400">— ยังไม่ระบุ —</span>}
                </td>
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2 text-right">
                  {Number(p.standardPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                {/* Owner UAT Fix Batch 1 — ข้อ 10: whitespace-nowrap กัน "ใช้งาน" ตัด
                    บรรทัดกลางคำเป็น "ใช้ / งาน" ตอนคอลัมน์แคบ (Thai Line-breaking ของ
                    Browser ถือว่ามี Break Opportunity ระหว่างพยางค์ได้แม้ไม่มีเว้นวรรค)
                    — ไม่แตะ Status Logic ใดๆ ทั้งสิ้น */}
                <td className="px-4 py-2 whitespace-nowrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {p.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  {/* Owner UAT — ข้อ 2: เพิ่ม "ลบ" — deleteProduct ตัดสินใจเองฝั่ง Server ว่า
                      ลบถาวรได้จริง (ไม่มีการใช้งานอ้างอิงเลย) หรือปิดใช้งานแทน (มีประวัติ
                      เอกสาร/ราคาเฉพาะ/ขนาดย่อยผูกอยู่ — ต้องรักษา Historical Snapshot ไว้)
                      แล้วสื่อสารผลจริงกลับผ่าน message ของ ActionResult — ปุ่ม
                      เปิดใช้งาน/ปิดใช้งาน เดิมยังคงอยู่แยกต่างหาก สำหรับสลับสถานะโดยไม่ลบ */}
                  <CancelButton
                    action={deleteProduct.bind(null, p.id)}
                    confirmMessage={`ยืนยันลบสินค้า "${p.name}" ? (หากมีการใช้งานในเอกสาร/ราคาเฉพาะ/ขนาดย่อยอยู่แล้ว ระบบจะปิดใช้งานแทนการลบถาวร เพื่อรักษาประวัติเอกสารเก่า)`}
                    label="ลบ"
                    successMessage="ลบสินค้าสำเร็จ"
                    className="text-xs text-gray-500 hover:text-red-600 border-0 p-0 inline"
                  />
                  <form action={toggleProductActive.bind(null, p.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {p.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={unassignedOnly ? 10 : 9} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Type→Model dependent dropdown บนฟอร์มสร้างสินค้า — Pattern เดียวกับ
          Customer→Branch ที่ใช้อยู่แล้ว ไม่มี Business Logic ใดๆ แค่กรอง option */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const modelsByType = ${safeJsonForScript(modelsByType)};
            const productTypeSelect = document.querySelector('#createProductForm select[name="productTypeId"]');
            const modelSelect = document.querySelector('#createProductForm select[name="modelId"]');
            function updateModels() {
              const typeId = productTypeSelect.value;
              modelSelect.innerHTML = '<option value="">— ไม่ผูก (ปกติ) —</option>';
              modelsByType.filter(m => m.productTypeId === typeId).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
              });
              // เปลี่ยน productTypeId ล้าง modelId กลับเป็นว่างเสมอ (เปลี่ยนแบบ Programmatic
              // ไม่ยิง change Event เอง) ต้องเรียกอัปเดตคำเตือนต่อเองตรงนี้ — ปลอดภัยเพราะ
              // Function Declaration ถูก Hoist ไว้แล้ว แม้เขียนอยู่ท้าย Script (เรียกได้
              // ก็ต่อเมื่อมี Event จริงจากผู้ใช้เท่านั้น ไม่ใช่ตอน Script รันครั้งแรก)
              updatePricePerFootUi();
            }
            productTypeSelect.addEventListener('change', updateModels);

            // Owner UAT Fix Batch 1 — ข้อ 1: สลับป้ายราคาตาม Category.usesSize
            const categoriesUsesSize = ${safeJsonForScript(categories.map((c) => ({ id: c.id, usesSize: c.usesSize })))};
            const categorySelect = document.querySelector('#createProductForm select[name="categoryId"]');
            const priceLabel = document.querySelector('#createProductForm label[for="standardPrice"]');
            function updatePriceLabel() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              priceLabel.textContent = cat && cat.usesSize ? 'ราคาต่อฟุต (รวม VAT) *' : cat ? 'ราคาต่อหน่วย (รวม VAT) *' : 'ราคาตั้งต้น (รวม VAT) *';
            }
            // หมายเหตุ: ห้ามเรียก updatePriceLabel() ทันทีตอน Script รัน — Category
            // เริ่มต้นของฟอร์มนี้เป็นค่าว่างเสมอ (ตรงกับป้ายเริ่มต้นที่ Server Render
            // มาให้แล้ว) เรียกตอนนี้จะไป Mutate DOM Node ที่ React (Field Component)
            // กำลัง Hydrate อยู่ ทำให้ Text ไม่ตรงกับที่ Server Render จริง เกิด Hydration
            // Mismatch (React Error #418) แล้วทำให้ทั้งฟอร์ม Remount ใหม่ฝั่ง Client
            // (Query Selector อื่นที่จับ Element ไว้ก่อนหน้ากลายเป็น Node ที่หลุดออกจาก
            // DOM จริงไปเงียบๆ) — ให้ทำงานเฉพาะตอนมี change Event จริงจากผู้ใช้เท่านั้น
            categorySelect.addEventListener('change', updatePriceLabel);

            // Owner UAT — ข้อ 1: โชว์ช่อง "ราคาต่อฟุต" เฉพาะตอนเลือกประเภทสินค้าที่ใช้ขนาด
            // และไม่ได้ผูกรุ่นสินค้า (Legacy) — ปิดใช้งาน (ไม่ใช่ซ่อนเฉยๆ) ตอนผูกรุ่นสินค้า
            // ไว้แล้ว เพื่อกันส่งค่าซ้อนกันทั้งสองทาง (Mutual Exclusive ตาม Server
            // Validation) — เตือนเพิ่มเมื่อ usesSize=true แต่ไม่ได้กรอกราคาต่อฟุตและไม่ได้
            // ผูกรุ่นสินค้าเลยทั้งคู่ (ไม่เรียกตอนโหลดหน้า เพราะค่าเริ่มต้น hidden ตรงกับ
            // Server Render อยู่แล้ว — Category/pricePerFoot เริ่มต้นว่างเสมอ)
            const usesSizeWarning = document.getElementById('createUsesSizeWarning');
            const pricePerFootWrap = document.getElementById('createPricePerFootWrap');
            const pricePerFootInput = document.querySelector('#createProductForm input[name="pricePerFoot"]');
            function updatePricePerFootUi() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              const usesSize = !!(cat && cat.usesSize);
              const hasModel = !!modelSelect.value;
              pricePerFootWrap.classList.toggle('hidden', !usesSize);
              pricePerFootInput.disabled = hasModel;
              if (hasModel) pricePerFootInput.value = '';
              const showWarning = usesSize && !hasModel && !pricePerFootInput.value;
              usesSizeWarning.classList.toggle('hidden', !showWarning);
            }
            categorySelect.addEventListener('change', updatePricePerFootUi);
            modelSelect.addEventListener('change', updatePricePerFootUi);
            pricePerFootInput.addEventListener('input', updatePricePerFootUi);
          `,
        }}
      />
    </div>
  );
}
