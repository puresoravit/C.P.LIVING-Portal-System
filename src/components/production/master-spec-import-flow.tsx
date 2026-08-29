"use client";

import { useState } from "react";
import ExcelJS from "exceljs";
import { worksheetToRows } from "@/lib/excel-import";
import type { MasterSpecImportPreview, MasterSpecImportSheets } from "@/lib/master-spec-import-db";

// Master Spec import (2026-08-29) — โครงตาม ImportFlow เดิม (upload → validate → preview →
// confirm) แต่แยก component เพราะสัญญาต่างกันจริง: 3 ชีทเชื่อมด้วย specKey (ImportFlow เดิม
// อ่าน worksheets[0] ชีทเดียว), commit เป็น transaction all-or-nothing (เดิม import เฉพาะ
// แถว valid ทีละแถว), และ preview เป็นระดับ spec + สถานะผูกสินค้า ไม่ใช่ตารางแถวดิบ —
// ไม่แก้ ImportFlow shared เพื่อไม่เสี่ยงกระทบหน้า import ของ Billing

export function MasterSpecImportFlow({
  validateAction,
  commitAction,
}: {
  validateAction: (sheets: MasterSpecImportSheets) => Promise<MasterSpecImportPreview>;
  commitAction: (sheets: MasterSpecImportSheets) => Promise<{ success: boolean; errors?: string[]; imported?: { specs: number; fabrics: number; layers: number } }>;
}) {
  const [sheets, setSheets] = useState<MasterSpecImportSheets | null>(null);
  const [preview, setPreview] = useState<MasterSpecImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState<{ specs: number; fabrics: number; layers: number } | null>(null);
  const [fileError, setFileError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImported(null);
    setFileError("");
    setPreview(null);
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const specsWs = workbook.getWorksheet("Specs");
      const fabricsWs = workbook.getWorksheet("Fabrics");
      const layersWs = workbook.getWorksheet("Layers");
      if (!specsWs || !fabricsWs || !layersWs) {
        setFileError('ไฟล์ต้องมีชีทชื่อ "Specs", "Fabrics", "Layers" ครบทั้ง 3 ชีท');
        return;
      }
      const loaded: MasterSpecImportSheets = {
        specs: worksheetToRows(specsWs),
        fabrics: worksheetToRows(fabricsWs),
        layers: worksheetToRows(layersWs),
      };
      if (loaded.specs.length === 0) {
        setFileError("ชีท Specs ไม่มีข้อมูล");
        return;
      }
      setSheets(loaded);
      setPreview(await validateAction(loaded));
    } catch {
      setFileError("ไม่สามารถอ่านไฟล์นี้ได้ — ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!sheets || !preview?.ok) return;
    setLoading(true);
    try {
      // ส่ง raw sheets กลับไปให้ server re-validate + commit เอง — ไม่ส่งผล validate ที่
      // client ถือไว้ (server ไม่เชื่อ client)
      const result = await commitAction(sheets);
      if (result.success && result.imported) {
        setImported(result.imported);
        setPreview(null);
        setSheets(null);
      } else if (result.errors) {
        setPreview({ ...preview, ok: false, errors: result.errors });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="bg-white border rounded-lg p-4 mb-4 flex items-center gap-3">
        <label className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5 cursor-pointer">
          เลือกไฟล์ Excel (3 ชีท: Specs / Fabrics / Layers)
          <input type="file" accept=".xlsx" onChange={handleFile} className="hidden" />
        </label>
        {loading && <span className="text-sm text-gray-500">กำลังประมวลผล...</span>}
      </div>

      {fileError && <p className="text-sm text-red-600 mb-4">{fileError}</p>}

      {imported && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4">
          นำเข้าสำเร็จ: {imported.specs} Master Specs ({imported.fabrics} ผ้า / {imported.layers} ชั้นโครงสร้าง)
        </p>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500">Master Specs</div>
              <div className="text-lg font-medium">{preview.specCount}</div>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500">ผ้า</div>
              <div className="text-lg font-medium">{preview.fabricCount}</div>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500">ชั้นโครงสร้าง</div>
              <div className="text-lg font-medium">{preview.layerCount}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">ผูกสินค้าแล้ว</div>
              <div className="text-lg font-medium text-green-700">{preview.linkedCount}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">ยังไม่ผูกสินค้า</div>
              <div className="text-lg font-medium text-amber-700">{preview.unlinkedCount}</div>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2 bg-red-50 text-sm font-medium text-red-700">
                พบปัญหา {preview.errors.length} จุด — ต้องแก้ให้หมดก่อน (import เป็นชุดเดียว all-or-nothing)
              </div>
              <ul className="p-4 text-sm text-red-600 space-y-1 list-disc list-inside">
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2 bg-amber-50 text-sm font-medium text-amber-700">ข้อสังเกต (ไม่บล็อกการ import)</div>
              <ul className="p-4 text-sm text-amber-700 space-y-1 list-disc list-inside">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">รายการที่จะถูกสร้าง ({preview.specSummaries.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Master Spec</th>
                    <th className="px-4 py-2 font-medium">ผ้า</th>
                    <th className="px-4 py-2 font-medium">ชั้น</th>
                    <th className="px-4 py-2 font-medium">ผูกกับสินค้า</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.specSummaries.map((s) => (
                    <tr key={s.specKey} className="border-t">
                      <td className="px-4 py-2">{s.displayName}</td>
                      <td className="px-4 py-2">{s.fabricCount}</td>
                      <td className="px-4 py-2">{s.layerCount}</td>
                      <td className="px-4 py-2">
                        {s.linkedTo ? (
                          <span className="text-green-700">{s.linkedTo}</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ยังไม่ผูกสินค้า</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={handleConfirmImport}
            disabled={!preview.ok || loading}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
          >
            ✓ ยืนยัน Import ทั้งชุด ({preview.specCount} Master Specs — all-or-nothing)
          </button>
        </>
      )}
    </div>
  );
}
