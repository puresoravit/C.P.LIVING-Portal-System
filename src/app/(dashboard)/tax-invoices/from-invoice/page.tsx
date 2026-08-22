import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { createTaxInvoiceFromInvoice } from "../actions";
import { displayProductTypeCode } from "@/lib/order-preview";
import { SearchInputWithClear } from "@/components/search-input-with-clear";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Owner UAT Fix Batch — ข้อ 3: Row Renderer ใช้ร่วมกันทั้งตาราง "ค้นด้วย Invoice ตรงๆ"
// และตาราง "Child Invoice ของ Order ที่ค้นเจอ" — Logic บล็อกปุ่ม (CANCELLED/มีใบกำกับภาษี
// อ้างอิงอยู่แล้ว) เหมือนกันทุกประการ ไม่ซ้ำโค้ด
type InvoiceSourceRowData = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerNameSnapshot: string;
  productTypeCode: string;
  grandTotal: unknown;
  status: string;
  taxInvoices: unknown[];
};

function InvoiceSourceRow({
  inv,
  showCustomer,
  showDate,
}: {
  inv: InvoiceSourceRowData;
  showCustomer: boolean;
  showDate: boolean;
}) {
  const status = STATUS_LABEL[inv.status];
  const alreadyReferenced = inv.taxInvoices.length > 0;
  const blocked = inv.status === "CANCELLED" || alreadyReferenced;
  return (
    <tr className="border-t align-top">
      <td className="px-4 py-2">
        <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
          {inv.invoiceNumber}
        </a>
      </td>
      {showDate && <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>}
      {showCustomer && <td className="px-4 py-2">{inv.customerNameSnapshot}</td>}
      <td className="px-4 py-2">{displayProductTypeCode(inv.productTypeCode)}</td>
      <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>{status.label}</span>
      </td>
      <td className="px-4 py-2 text-right">
        {blocked ? (
          <span className="text-xs text-gray-400">
            {inv.status === "CANCELLED" ? "Invoice นี้ถูกยกเลิกแล้ว — อ้างอิงไม่ได้" : "มีใบกำกับภาษีจากใบนี้อยู่แล้ว"}
          </span>
        ) : (
          <form action={createTaxInvoiceFromInvoice.bind(null, inv.id)}>
            <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium rounded px-3 py-1.5 whitespace-nowrap">
              สร้างใบกำกับภาษีจากใบนี้
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

// Owner UAT Fix Batch 1 — ข้อ 4: "ดึงยอดจากใบส่งของชั่วคราว" — หน้า Search เดียวที่ยิง
// ตรงไปหา createTaxInvoiceFromInvoice (โหมด AUTO) เดิมของ R4/R5 ทุกประการ — ไม่มี
// Pricing/Calculation Engine ใหม่เกิดขึ้นเลย หน้านี้แค่ช่วยหา Invoice ที่ต้องการอ้างอิง
// แล้วแสดงให้ตรวจสอบก่อนกดสร้างจริง (Invoice ที่ CANCELLED แล้วยังโชว์ได้ แต่ปุ่มสร้าง
// จะถูกปิดพร้อมคำอธิบายเหตุผล แทนที่จะซ่อนไปเฉยๆ)
//
// Owner UAT Fix Batch — ข้อ 3: ค้นด้วยเลขที่ ORDER ได้ด้วย นอกจาก INV ตรงๆ — ORDER หนึ่งใบ
// แตกเป็น Invoice ลูกได้หลายใบ (ตามกลุ่มส่วนลด) จึงต้องแสดง Child Invoice ทั้งหมดให้เลือก
// ไม่ใช่แค่ใบเดียว — Reuse createTaxInvoiceFromInvoice เดิมทุกประการ (เรียกทีละ Invoice ที่
// เลือก เหมือน Flow ค้นหาด้วย Invoice ตรงๆ) ไม่มี Calculation Path ใหม่เกิดขึ้นเลย
export default async function TaxInvoiceFromInvoicePage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "taxInvoice.create")) redirect("/");

  const q = searchParams.q?.trim();
  const invoiceInclude = { taxInvoices: { where: { status: { not: "CANCELLED" as const } } } };

  const [invoices, matchedOrders] = q
    ? await Promise.all([
        db.invoice.findMany({
          where: {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" as const } },
              { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
              { customer: { code: { contains: q, mode: "insensitive" as const } } },
            ],
          },
          include: invoiceInclude,
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        db.order.findMany({
          where: { orderNumber: { contains: q, mode: "insensitive" as const } },
          include: {
            customer: true,
            invoices: { include: invoiceInclude, orderBy: { createdAt: "asc" as const } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ])
    : [[], []];

  return (
    <div className="max-w-3xl">
      <a href="/tax-invoices" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบกำกับภาษี
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">ดึงยอดจากใบส่งของชั่วคราว</h1>
      <p className="text-sm text-gray-500 mb-4">
        ค้นหา Invoice (ใบส่งของชั่วคราว) ที่ต้องการอ้างอิง แล้วสร้างใบกำกับภาษี VAT เต็ม 100% ของยอด Invoice ใบนั้นทันที
        (ยอด/รายการเหมือน Invoice ต้นทางทุกบาททุกสตางค์ — ถอด VAT ออกมาแสดงเท่านั้น ไม่มีการคำนวณใหม่)
      </p>

      <form className="bg-white border rounded-lg p-4 flex gap-2 mb-4">
        <div className="flex-1">
          <SearchInputWithClear
            defaultValue={q}
            placeholder="เช่น INV-A-202608-0001, ORDER-202608-00001 หรือ ชื่อ/รหัสลูกค้า..."
            autoFocus
            basePath="/tax-invoices/from-invoice"
            preserveParams={{}}
          />
        </div>
        <button className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
      </form>

      {q && matchedOrders.length > 0 && (
        <div className="mb-4 space-y-3">
          {matchedOrders.map((order) => (
            <div key={order.id} className="bg-white border rounded-lg overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between">
                <div className="text-sm">
                  <a href={`/orders/${order.id}`} className="font-mono text-blue-600 hover:underline font-medium">
                    {order.orderNumber}
                  </a>
                  <span className="text-gray-500 ml-2">
                    {order.orderDate.toLocaleDateString("th-TH")} · {order.customer.companyName}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{order.invoices.length} Invoice ลูก</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                    <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
                    <th className="px-4 py-2 font-medium text-right">ยอดสุทธิ</th>
                    <th className="px-4 py-2 font-medium">สถานะ</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {order.invoices.map((inv) => (
                    <InvoiceSourceRow key={inv.id} inv={inv} showCustomer={false} showDate={false} />
                  ))}
                  {order.invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-gray-400 text-xs">
                        Order นี้ยังไม่มี Invoice (ยังไม่ Confirm)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {q && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">ลูกค้า</th>
                <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
                <th className="px-4 py-2 font-medium text-right">ยอดสุทธิ</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <InvoiceSourceRow key={inv.id} inv={inv} showCustomer showDate />
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {matchedOrders.length > 0
                      ? "ไม่พบ Invoice ที่ค้นตรงตัว — แต่พบ Order ด้านบน เลือก Invoice ลูกของ Order นั้นได้เลย"
                      : `ไม่พบ Invoice หรือ Order ที่ตรงกับ "${q}"`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
