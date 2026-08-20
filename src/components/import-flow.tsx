"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

export type ValidationRow = { row: number; valid: boolean; error?: string; data?: any };

export function ImportFlow({
  templateUrl,
  validateAction,
  commitAction,
  previewColumns,
}: {
  templateUrl: string;
  validateAction: (rows: any[]) => Promise<ValidationRow[]>;
  commitAction: (rows: any[]) => Promise<{ imported: number }>;
  previewColumns: string[];
}) {
  const [results, setResults] = useState<ValidationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportedCount(null);
    setFileError("");
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rawRows.length === 0) {
        setFileError("ไม่พบข้อมูลในไฟล์ (ตรวจสอบว่ามีแถวข้อมูลใต้หัวตารางหรือไม่)");
        setLoading(false);
        return;
      }

      const validated = await validateAction(rawRows);
      setResults(validated);
    } catch (err) {
      setFileError("ไม่สามารถอ่านไฟล์นี้ได้ — ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!results) return;
    const validRows = results.filter((r) => r.valid).map((r) => r.data);
    if (validRows.length === 0) return;
    setLoading(true);
    try {
      const res = await commitAction(validRows);
      setImportedCount(res.imported);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const validCount = results?.filter((r) => r.valid).length ?? 0;
  const errorRows = results?.filter((r) => !r.valid) ?? [];

  return (
    <div>
      <div className="bg-white border rounded-lg p-4 mb-4 flex items-center gap-3">
        <a href={templateUrl} className="text-sm text-blue-600 hover:underline border rounded px-3 py-1.5">
          ดาวน์โหลด Template
        </a>
        <label className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5 cursor-pointer">
          เลือกไฟล์ Excel เพื่อนำเข้า
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
        {loading && <span className="text-sm text-gray-500">กำลังประมวลผล...</span>}
      </div>

      {fileError && <p className="text-sm text-red-600 mb-4">{fileError}</p>}

      {importedCount !== null && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4">
          นำเข้าสำเร็จ {importedCount} รายการ
        </p>
      )}

      {results && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Rows</div>
              <div className="text-lg font-medium">{results.length}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Valid</div>
              <div className="text-lg font-medium text-green-700">{validCount}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Error</div>
              <div className="text-lg font-medium text-red-700">{errorRows.length}</div>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2 bg-red-50 text-sm font-medium text-red-700">รายการที่มีปัญหา (จะไม่ถูก Import)</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">แถวที่</th>
                    <th className="px-4 py-2 font-medium">สาเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((r) => (
                    <tr key={r.row} className="border-t">
                      <td className="px-4 py-2">{r.row}</td>
                      <td className="px-4 py-2 text-red-600">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {validCount > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2 bg-green-50 text-sm font-medium text-green-700">
                ตัวอย่างข้อมูลที่จะ Import ({validCount} แถว)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    {previewColumns.map((col) => (
                      <th key={col} className="px-4 py-2 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results
                    .filter((r) => r.valid)
                    .slice(0, 10)
                    .map((r) => (
                      <tr key={r.row} className="border-t">
                        {previewColumns.map((col) => (
                          <td key={col} className="px-4 py-2">
                            {String(r.data?.[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
              {validCount > 10 && <div className="px-4 py-2 text-xs text-gray-400">...และอีก {validCount - 10} แถว</div>}
            </div>
          )}

          <button
            onClick={handleConfirmImport}
            disabled={validCount === 0 || loading}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
          >
            ✓ ยืนยัน Import {validCount} รายการ
          </button>
        </>
      )}
    </div>
  );
}
