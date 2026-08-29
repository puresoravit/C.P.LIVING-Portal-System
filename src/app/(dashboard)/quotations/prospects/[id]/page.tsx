import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { displayQuotationNumber } from "@/lib/running-number";
import { findAdoptableHeadsForProspect } from "@/lib/prospect-products";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { linkProspectToCustomer, createCustomerFromProspect, adoptProspectProducts } from "../actions";
import { BackLink } from "@/components/back-link";

// ==========================================================================
// R10 — รายละเอียด "ราย" ของใบเสนอราคาลูกค้าที่ไม่มีในระบบ: ข้อมูลที่เคยกรอก + ประวัติ QT
// ทุกใบ (เปิดดูเอกสารจริงได้) + เชื่อม/สร้าง Customer Master + นำสินค้าเสนอราคาที่เคยใช้
// ไปเข้า Shared/Private ของลูกค้าจริง (ไม่ Duplicate สินค้า — ย้ายสังกัด Head เดิม)
// ==========================================================================

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function QuotationProspectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!can(role, "quotation.view")) redirect("/");
  const canManageCustomers = can(role, "customer.edit");
  const canManageProducts = can(role, "product.edit");

  const prospect = await db.quotationProspect.findUnique({
    where: { id: params.id },
    include: {
      linkedCustomer: { select: { id: true, companyName: true, code: true } },
      quotations: {
        select: {
          id: true,
          quotationNumber: true,
          revisionNo: true,
          quotationDate: true,
          grandTotal: true,
          status: true,
          items: { select: { productId: true } },
        },
        orderBy: { quotationDate: "desc" },
      },
    },
  });
  if (!prospect) notFound();

  const customers = await db.customer.findMany({
    where: { active: true },
    select: { id: true, companyName: true, code: true },
    orderBy: { companyName: "asc" },
  });

  // R11 — สินค้าที่รายนี้เคยใช้และ Head ยังอยู่ใน "สินค้าเสนอราคา" — Logic เดียวกับ
  // One-step Adopt ใน Action (findAdoptableHeadsForProspect จุดเดียวร่วมกัน)
  const adoptable = await findAdoptableHeadsForProspect(prospect.id);
  const adoptableHeads = adoptable.products;
  const adoptableModels = adoptable.models;

  return (
    <div className="max-w-4xl">
      <BackLink href="/quotations/prospects">← กลับรายชื่อใบเสนอราคาลูกค้าที่ไม่มีในระบบ</BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-1">{prospect.name}</h1>
      <p className="text-sm text-gray-500 mb-4">{prospect.quotations.length} ใบเสนอราคาในรายนี้</p>

      {/* ข้อมูลที่เคยกรอก */}
      <div className="bg-white border rounded-lg p-4 mb-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <span className="text-gray-500">เลขผู้เสียภาษี:</span> {prospect.taxId ?? "-"}
        </div>
        <div>
          <span className="text-gray-500">ผู้ติดต่อ:</span> {prospect.contactPerson ?? "-"}
        </div>
        <div>
          <span className="text-gray-500">โทร:</span> {prospect.phone ?? "-"}
        </div>
        <div className="sm:col-span-2">
          <span className="text-gray-500">ที่อยู่:</span> {prospect.address ?? "-"}
        </div>
      </div>

      {/* สถานะการเชื่อม Customer Master */}
      {prospect.linkedCustomer ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-sm text-green-800">
          เชื่อมกับลูกค้าแล้ว:{" "}
          <a href={`/customers/${prospect.linkedCustomer.id}`} className="font-medium underline">
            {prospect.linkedCustomer.companyName} ({prospect.linkedCustomer.code})
          </a>{" "}
          — ใบเสนอราคาเดิมของรายนี้ยังคง Snapshot เดิมทุกใบ (ไม่ถูกแก้ย้อนหลัง)
        </div>
      ) : canManageCustomers ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* เชื่อมกับลูกค้าที่มีอยู่ */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-1">เชื่อมกับลูกค้าที่มีอยู่</h2>
            <p className="text-xs text-gray-500 mb-3">กรณีสร้างลูกค้ารายนี้ใน Customer Master ไว้แล้ว</p>
            <ActionForm action={linkProspectToCustomer.bind(null, prospect.id)} successMessage="เชื่อมลูกค้าสำเร็จ" className="flex items-end gap-2">
              <div className="flex-1">
                <SelectField label="เลือกลูกค้า" name="customerId" defaultValue="">
                  <option value="" disabled>
                    — เลือกลูกค้า —
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.code})
                    </option>
                  ))}
                </SelectField>
              </div>
              <SubmitButton className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2">เชื่อม</SubmitButton>
            </ActionForm>
          </div>

          {/* สร้างเป็นลูกค้าใหม่ (Pre-fill จากข้อมูลราย — ตรวจ/แก้ก่อน Save) */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-1">สร้างเป็นลูกค้า</h2>
            <p className="text-xs text-gray-500 mb-3">Pre-fill จากข้อมูลที่เคยกรอก — ตรวจสอบ/แก้ไขก่อนบันทึก</p>
            <ActionForm
              action={createCustomerFromProspect.bind(null, prospect.id)}
              successMessage="สร้างลูกค้าและเชื่อมรายสำเร็จ"
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <Field label="รหัสลูกค้า / Code * (เช่น ABC01)" name="code" required />
              <Field label="ชื่อบริษัท *" name="companyName" defaultValue={prospect.name} required />
              <Field label="เลขผู้เสียภาษี" name="taxId" defaultValue={prospect.taxId ?? ""} />
              <Field label="โทร" name="phone" defaultValue={prospect.phone ?? ""} />
              <div className="sm:col-span-2">
                <Field label="ที่อยู่" name="address" defaultValue={prospect.address ?? ""} />
              </div>
              {(adoptableHeads.length > 0 || adoptableModels.length > 0) && (
                <div className="sm:col-span-2 rounded-lg border bg-gray-50 px-3 py-2.5 space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="adoptAll" value="1" defaultChecked className="w-4 h-4" />
                    นำสินค้าที่เคยเสนอทั้งหมด ({adoptableHeads.length + adoptableModels.length} รายการ — สินค้ามีไซส์พาทุกไซส์ไปครบ)
                    เข้ารายการสินค้าของลูกค้าให้เลย
                  </label>
                  <div className="flex flex-wrap gap-2 pl-6">
                    <label className="flex items-center gap-2 rounded-full border-2 border-emerald-500 bg-emerald-50 pl-3 pr-4 py-1.5 cursor-pointer text-emerald-900 text-xs">
                      <input type="radio" name="adoptTarget" value="shared" defaultChecked className="accent-emerald-600" />
                      <span className="font-semibold">Shared</span> — ทุกบริษัทในกลุ่มเห็นร่วมกัน
                    </label>
                    <label className="flex items-center gap-2 rounded-full border-2 border-amber-500 bg-amber-50 pl-3 pr-4 py-1.5 cursor-pointer text-amber-900 text-xs">
                      <input type="radio" name="adoptTarget" value="private" className="accent-amber-600" />
                      <span className="font-semibold">Private</span> — เฉพาะลูกค้ารายนี้
                    </label>
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <SubmitButton className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2">
                  ตรวจสอบแล้ว — สร้างลูกค้า
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-4">การเชื่อม/สร้างลูกค้าต้องใช้สิทธิ์จัดการลูกค้า (customer.edit)</p>
      )}

      {/* นำสินค้าเสนอราคาที่เคยใช้ ไปใช้กับลูกค้าจริง */}
      {prospect.linkedCustomer && canManageProducts && (adoptableHeads.length > 0 || adoptableModels.length > 0) && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-1">นำสินค้าที่เคยเสนอ ไปใช้กับลูกค้าจริง</h2>
          <p className="text-xs text-gray-500 mb-3">
            สินค้าเหล่านี้ยังอยู่ใน &quot;สินค้าเสนอราคา&quot; — เลือกแล้วย้ายเข้า Shared ของกลุ่ม หรือ Private ของ{" "}
            {prospect.linkedCustomer.companyName} (ไม่ Duplicate — ใบเสนอราคาเดิมยังอ้างสินค้าตัวเดิมได้ครบ) —
            สินค้าที่มีไซส์ (เช่นที่นอน) ย้ายทั้งครอบครัว: <b>ทุกไซส์ตามไปครบ</b> ไม่ใช่เฉพาะไซส์ที่เคยสั่ง
          </p>
          <ActionForm action={adoptProspectProducts.bind(null, prospect.id)} successMessage="ย้ายสินค้าสำเร็จ" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {adoptableHeads.map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-gray-50">
                  <input type="checkbox" name="productIds" value={h.id} className="w-4 h-4" />
                  <span className="font-mono text-xs text-gray-500">{h.sku}</span> {h.name}
                  {h.sizeVariantCount > 0 && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5">
                      +{h.sizeVariantCount} ไซส์
                    </span>
                  )}
                </label>
              ))}
              {adoptableModels.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-gray-50">
                  <input type="checkbox" name="modelIds" value={m.id} className="w-4 h-4" />
                  {m.name}
                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5">
                    รุ่นสินค้า · {m.productCount} ไซส์
                  </span>
                </label>
              ))}
            </div>
            {/* R10.2 — โทนสีเดียวกับกล่อง Shared/Private ของหน้ารายการสินค้า (เขียว/เหลือง) */}
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-full border-2 border-emerald-500 bg-emerald-50 pl-4 pr-5 py-2 cursor-pointer text-emerald-900">
                <input type="radio" name="target" value="shared" defaultChecked className="accent-emerald-600" />
                <span className="text-sm whitespace-nowrap">
                  <span className="font-semibold">Shared</span> — ทุกบริษัทในกลุ่มของลูกค้ารายนี้เห็นร่วมกัน
                </span>
              </label>
              <label className="flex items-center gap-2 rounded-full border-2 border-amber-500 bg-amber-50 pl-4 pr-5 py-2 cursor-pointer text-amber-900">
                <input type="radio" name="target" value="private" className="accent-amber-600" />
                <span className="text-sm whitespace-nowrap">
                  <span className="font-semibold">Private</span> — เฉพาะ {prospect.linkedCustomer.companyName}
                </span>
              </label>
            </div>
            <SubmitButton className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2">
              ย้ายสินค้าที่เลือก
            </SubmitButton>
          </ActionForm>
        </div>
      )}

      {/* ประวัติ QT ทั้งหมด */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 text-sm font-medium">ประวัติใบเสนอราคา</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-600 text-left border-t">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium text-right">ยอดรวม</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {prospect.quotations.map((q) => {
                const st = STATUS_LABEL[q.status] ?? { label: q.status, className: "bg-gray-100 text-gray-500" };
                return (
                  <tr key={q.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{displayQuotationNumber(q.quotationNumber, q.revisionNo)}</td>
                    <td className="px-4 py-2">{q.quotationDate.toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-2 text-right">{money(q.grandTotal)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <a href={`/quotations/${q.id}`} className="text-xs text-blue-600 hover:underline">
                        เปิดเอกสาร
                      </a>
                    </td>
                  </tr>
                );
              })}
              {prospect.quotations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    ยังไม่มีใบเสนอราคาในรายนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
