import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { displayQuotationNumber } from "@/lib/running-number";
import { CancelButton } from "@/components/cancel-button";
import { mergeProspectsByIds } from "./actions";

// ==========================================================================
// R10 — "ใบเสนอราคาลูกค้าที่ไม่มีในระบบ": รายชื่อบริษัท/บุคคลที่เคยเสนอราคาแบบกรอกข้อมูล
// เอง (Guest QT) — 1 Guest QT = 1 ราย โดยอัตโนมัติ (ไม่ Auto-merge จากชื่อ) — รายชื่อซ้ำ
// กันเป๊ะจะมีปุ่ม "รวมราย" ให้ User กดยืนยันเอง — กดเข้าแต่ละรายเพื่อดูประวัติ/เชื่อมลูกค้า
// ==========================================================================

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function QuotationProspectsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "quotation.view")) redirect("/");

  const prospects = await db.quotationProspect.findMany({
    include: {
      linkedCustomer: { select: { companyName: true, code: true } },
      quotations: {
        select: { id: true, quotationNumber: true, revisionNo: true, quotationDate: true, grandTotal: true, status: true },
        orderBy: { quotationDate: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ชื่อซ้ำเป๊ะ (Trim แล้ว) = เสนอปุ่มรวมราย (User ยืนยันเองเท่านั้น)
  const byName = new Map<string, typeof prospects>();
  for (const pr of prospects) {
    const key = pr.name.trim();
    byName.set(key, [...(byName.get(key) ?? []), pr]);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">ใบเสนอราคาลูกค้าที่ไม่มีในระบบ</h1>
      <p className="text-sm text-gray-500 mb-4">
        ใบเสนอราคาที่สร้างจากการกรอกข้อมูลลูกค้าเอง และยังไม่ได้เชื่อมกับ Customer Master — กดชื่อรายเพื่อดูประวัติ
        เชื่อม/สร้างลูกค้า และนำสินค้าไปใช้ต่อ
      </p>

      <div className="space-y-3">
        {prospects.map((pr) => {
          const dupes = (byName.get(pr.name.trim()) ?? []).filter((x) => x.id !== pr.id);
          const isFirstOfName = (byName.get(pr.name.trim()) ?? [])[0]?.id === pr.id;
          const latest = pr.quotations[0];
          return (
            <div key={pr.id} className="bg-white border rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/quotations/prospects/${pr.id}`} className="font-medium hover:text-blue-700">
                  {pr.name}
                </a>
                <span className="text-xs text-gray-500">
                  {pr.quotations.length} QT{latest ? ` | ล่าสุด ${latest.quotationDate.toLocaleDateString("th-TH")}` : ""}
                </span>
                {pr.linkedCustomer ? (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                    เชื่อมแล้ว: {pr.linkedCustomer.companyName} ({pr.linkedCustomer.code})
                  </span>
                ) : (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                    ยังไม่เชื่อม Customer Master
                  </span>
                )}
                <a
                  href={`/quotations/prospects/${pr.id}`}
                  className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700 whitespace-nowrap"
                >
                  {pr.linkedCustomer ? "จัดการราย →" : "จัดการราย / สร้างลูกค้า →"}
                </a>
                {dupes.length > 0 && isFirstOfName && (
                  <CancelButton
                    action={mergeProspectsByIds.bind(null, pr.id, dupes.map((d) => d.id))}
                    confirmMessage={`พบราย "${pr.name}" ซ้ำกัน ${dupes.length + 1} ราย — ยืนยันรวมทุกรายเป็นรายเดียว? (ประวัติ QT ทุกใบย้ายมารวมกัน ไม่มีเอกสารถูกแก้/ลบ)`}
                    label={`รวมรายชื่อซ้ำ (${dupes.length + 1} ราย)`}
                    successMessage="รวมรายแล้ว"
                    className="text-xs text-blue-600 hover:underline border-0 p-0"
                  />
                )}
              </div>

              {pr.quotations.length > 0 && (
                <div className="mt-2 border-t pt-2 space-y-1">
                  {pr.quotations.map((q) => {
                    const st = STATUS_LABEL[q.status] ?? { label: q.status, className: "bg-gray-100 text-gray-500" };
                    return (
                      <div key={q.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <a href={`/quotations/${q.id}`} className="font-mono text-blue-600 hover:underline">
                          {displayQuotationNumber(q.quotationNumber, q.revisionNo)}
                        </a>
                        <span className="text-gray-500">{q.quotationDate.toLocaleDateString("th-TH")}</span>
                        <span className="text-gray-700">{money(q.grandTotal)} บาท</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${st.className}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {prospects.length === 0 && (
          <div className="bg-white border rounded-lg p-8 text-center text-sm text-gray-400">
            ยังไม่มีใบเสนอราคาแบบกรอกข้อมูลเอง — สร้างได้ที่{" "}
            <a href="/quotations/new" className="text-blue-600 hover:underline">
              สร้างเอกสาร → ใบเสนอราคา
            </a>{" "}
            (เลือก &quot;กรอกข้อมูลเอง&quot;)
          </div>
        )}
      </div>
    </div>
  );
}
