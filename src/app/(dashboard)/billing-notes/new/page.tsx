import { db } from "@/lib/db";
import { startOfMonth, endOfCurrentMonth, safeDateParam, todayInputValue } from "@/lib/date-utils";
import { BillingNoteUnbilledSelector } from "@/components/billing-note-unbilled-selector";
import { BillingNoteBilledTable } from "@/components/billing-note-billed-selector";
import { liveTypeNamesByCode, resolveBillingNoteDiscounts } from "@/lib/billing-note-discount";

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
  searchParams: Promise<{ customerId?: string; dateFrom?: string; dateTo?: string; billing?: string; err?: string }>;
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
  // Smoke Test R10 (2026-08-25) — Owner ยืนยัน Semantic สุดท้าย: Invoice จะถือว่า "วางบิล
  // แล้ว" ก็ต่อเมื่อใบวางบิลที่ผูกอยู่ผ่านการยืนยัน "พิมพ์สำเร็จ" แล้วเท่านั้น (status=
  // PRINTED) — เดิมย้าย Tab ทันทีที่กดสร้างใบ (ยังไม่พิมพ์เลย) ทำให้ดูเหมือน Invoice หายไป
  // เองทั้งที่ยังไม่ได้ทำอะไร — Tab "ยังไม่วางบิล" จึงรวม Invoice ที่ถูกผูกกับใบวางบิลที่
  // "ยังไม่พิมพ์" ด้วย (โชว์ Badge บอกว่าค้างอยู่ในใบไหน ติ๊กซ้ำไม่ได้ — จะเอาคืนต้องยกเลิก
  // ใบนั้นก่อน ซึ่งปลด Invoice กลับมาให้อัตโนมัติ) — Guard กันวางบิลซ้ำเดิม (billingNoteId
  // ต้อง null ตอนสร้าง + CAS ใน Transaction) ไม่แตะเลย
  const [eligibleInvoices, billedInvoices] = selectedCustomerId
    ? await Promise.all([
        db.invoice.findMany({
          where: {
            customerId: selectedCustomerId,
            status: "PRINTED",
            invoiceDate: invoiceDateFilter,
            OR: [{ billingNoteId: null }, { billingNote: { is: { status: "CONFIRMED" } } }],
          },
          include: { billingNote: { select: { id: true, billingNoteNumber: true, status: true } } },
          orderBy: { invoiceDate: "asc" },
        }),
        db.invoice.findMany({
          where: {
            customerId: selectedCustomerId,
            status: "PRINTED",
            invoiceDate: invoiceDateFilter,
            billingNote: { is: { status: "PRINTED" } },
          },
          include: { billingNote: { select: { id: true, billingNoteNumber: true, status: true, applyDiscount: true } } },
          orderBy: { invoiceDate: "asc" },
        }),
      ])
    : [[], []];
  // R9 — ชื่อกลุ่มส่วนลดต่อ Invoice เชื่อมโยงสดกับชื่อปัจจุบันเสมอ (Pattern เดียวกับหน้า
  // Detail/Print ของใบวางบิล — ดู liveTypeNamesByCode) ใช้แสดงทั้ง 2 Tab
  const allCodes = [...eligibleInvoices, ...billedInvoices].map((inv) => inv.productTypeCode);
  const liveGroupNames = await liveTypeNamesByCode(allCodes);
  const today = todayInputValue();
  // R10 — Owner (มาร์คแดงในรูป): ตารางเลือกใบต้องโชว์ % ส่วนลดต่อใบ และสรุปยอดต้องหัก
  // ส่วนลดให้ดูล่วงหน้าเมื่อติ๊ก "ใช้ส่วนลด" — Preview ใช้ Resolver ตัวเดียวกับตอนสร้างจริง
  // เป๊ะ (resolveBillingNoteDiscounts ณ วันนี้) ตัวเลขจึงตรงกับใบวางบิลที่จะออกเสมอ —
  // คำนวณเฉพาะใบที่ยังเลือกได้ (ไม่ติดใบวางบิลค้าง)
  const selectableForPreview = eligibleInvoices.filter((inv) => !inv.billingNote);
  const discountPreview = selectedCustomerId
    ? await resolveBillingNoteDiscounts({
        customerId: selectedCustomerId,
        billingNoteDate: new Date(today),
        invoices: selectableForPreview.map((inv) => ({
          id: inv.id,
          branchId: inv.branchId,
          productTypeCode: inv.productTypeCode,
          grandTotal: inv.grandTotal,
          discountAmount: inv.discountAmount,
        })),
      })
    : { lines: [], discountTotal: null };
  const previewByInvoiceId = new Map(discountPreview.lines.map((line) => [line.invoiceId, line]));
  const viewLinkParams = (billing: "unbilled" | "billed") =>
    new URLSearchParams({
      ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
      dateFrom,
      dateTo,
      billing,
    }).toString();

  return (
    // R10 — Owner: ตาราง Tab "วางบิลแล้ว" คอลัมน์เยอะจนข้อความถูกบีบตัดหลายบรรทัด — ขยาย
    // Container จาก max-w-3xl เป็น max-w-5xl ให้ทุกแถวอยู่บรรทัดเดียว (คู่กับ whitespace-nowrap
    // ในตาราง)
    <div className="max-w-5xl">
      {/* Smoke Test R5 (2026-08-25) — Owner: ออกไปเช็คข้อมูลหน้าอื่นระหว่างเลือกใบ แล้วกด
          เมนูกลับมา ต้องเจอหน้าเดิม (ลูกค้า/ช่วงวันที่/ใบที่ติ๊ก/ติ๊กส่วนลด ครบ) — Pattern
          เดียวกับ Draft Return ของ Order/Quotation แต่หน้านี้ไม่มี Draft ใน DB จึงจำ State
          ทั้งหมดใน sessionStorage แทน (per-tab, หายเองเมื่อปิดแท็บ):
          Script ตัวนี้ทำหน้าที่ "เด้งกลับ" — เข้าหน้าเปล่า (ไม่มี customerId) แล้วมี State
          ค้างอยู่ → พากลับ URL เดิม / ?fresh=1 = ล้างทิ้งเริ่มใหม่ */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              try {
                var KEY = 'cp-bn-new-state';
                var params = new URLSearchParams(location.search);
                if (params.get('fresh')) { sessionStorage.removeItem(KEY); return; }
                if (params.get('customerId')) return; // มาถึงหน้าที่เจาะจงลูกค้าแล้ว ไม่ต้องเด้ง
                var raw = sessionStorage.getItem(KEY);
                if (!raw) return;
                var saved = JSON.parse(raw);
                if (saved && saved.url && saved.url !== location.pathname + location.search) {
                  location.replace(saved.url);
                }
              } catch (e) {}
            })();
          `,
        }}
      />
      <a href="/billing-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบวางบิล
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบวางบิล</h1>
      <p className="text-sm text-gray-500 mb-4">
        เลือกลูกค้าและช่วงวันที่เพื่อดู Invoice ที่พิมพ์แล้ว (9×11) และยังไม่เคยถูกวางบิล แล้วติ๊กใบที่ต้องการรวมเป็นใบวางบิลเดียว
      </p>

      <form method="get" className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div className="col-span-1 sm:col-span-2">
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
        <div className="col-span-1 sm:col-span-4">
          <button className="text-sm text-blue-600 hover:underline">ดู Invoice ทั้งหมด</button>
        </div>
      </form>

      {/* Owner UAT — สลับดู 2 สถานะของ Invoice ที่ PRINTED ในช่วง Customer+วันที่เดียวกันนี้
          ได้เลย: "ยังไม่วางบิล" (เลือกสร้างใบวางบิลได้ — Default) กับ "วางบิลแล้ว" (View-only
          เชื่อมไปดู Billing Note ที่ผูกอยู่ได้ ห้ามเลือกสร้างซ้ำตาม Business Rule เดิม) */}
      {selectedCustomerId && (
        <div className="flex gap-1 mb-3 border-b overflow-x-auto">
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
        <BillingNoteBilledTable
          invoices={billedInvoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDateLabel: inv.invoiceDate.toLocaleDateString("th-TH"),
            amount: Number(inv.grandTotal),
            groupLabel: liveGroupNames.get(inv.productTypeCode) ?? "ไม่ระบุกลุ่มส่วนลด",
            billingNoteId: inv.billingNote!.id,
            billingNoteNumber: inv.billingNote!.billingNoteNumber,
            billingNoteStatus: inv.billingNote!.status,
            billingNoteApplyDiscount: inv.billingNote!.applyDiscount,
            printBackHref: `/billing-notes/${inv.billingNote!.id}/print?back=${encodeURIComponent("/billing-notes/new?" + viewLinkParams("billed"))}`,
          }))}
          backHref={`/billing-notes/new?${viewLinkParams("billed")}`}
        />
      )}

      {selectedCustomerId && billingView === "unbilled" && (
        // Smoke Test R8 (2026-08-25) — เขียนใหม่เป็น React Client Component (ดูเหตุผลเต็มใน
        // src/components/billing-note-unbilled-selector.tsx) แทน Vanilla Script เดิมที่เจอ
        // บั๊ก "เลือกทั้งหมด" ไม่ Sync กับปุ่มสร้าง — State ทั้งหมดอยู่ใน React ตรงๆ
        <BillingNoteUnbilledSelector
          invoices={eligibleInvoices.map((inv) => {
            const preview = previewByInvoiceId.get(inv.id);
            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              invoiceDateLabel: inv.invoiceDate.toLocaleDateString("th-TH"),
              amount: Number(inv.grandTotal),
              groupLabel: liveGroupNames.get(inv.productTypeCode) ?? "ไม่ระบุกลุ่มส่วนลด",
              discountPct: preview?.pct ?? 0,
              discountAmount: preview?.amount ?? 0,
              alreadyDiscounted: preview?.alreadyDiscounted ?? false,
              // R10 — ใบที่ค้างอยู่ในใบวางบิลที่ยังไม่ยืนยันพิมพ์: โชว์แต่ติ๊กซ้ำไม่ได้
              pendingNoteId: inv.billingNote?.id ?? null,
              pendingNoteNumber: inv.billingNote?.billingNoteNumber ?? null,
            };
          })}
          customerId={selectedCustomerId}
          billingNoteDate={today}
        />
      )}

      {/* Server Guard แจ้งสุภาพ (กรณี JS ถูกปิดแล้วกด Submit โดยไม่เลือกใบไหนเลย) */}
      {searchParams.err === "noneSelected" && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          ยังไม่ได้เลือก Invoice — กรุณาติ๊กเลือกอย่างน้อย 1 ใบก่อนสร้างใบวางบิล
        </div>
      )}

    </div>
  );
}
