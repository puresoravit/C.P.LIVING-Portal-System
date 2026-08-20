import type ExcelJS from "exceljs";

/**
 * แปลง worksheet แถวแรก (header) + แถวข้อมูล ให้เป็น array ของ object แบบ
 * เดียวกับที่ XLSX.utils.sheet_to_json(sheet, { defval: "" }) เคยให้ตอนใช้
 * xlsx (SheetJS) — เก็บ key ตามชื่อ header เป๊ะ, ช่องว่าง/ไม่มีค่า -> ""
 * (ไม่ใช่ undefined) วันที่: exceljs แปลง cell ที่เป็น date format เป็น JS
 * Date object ให้เองโดยไม่ต้องตั้งค่าเพิ่ม (พฤติกรรมเดียวกับ cellDates: true
 * ของ xlsx เดิม — ป้องกันบั๊กเดิมที่เคยเจอ: อ่านวันที่ออกมาเป็นเลข serial
 * แทนวันที่จริง)
 */
export function worksheetToRows(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // ข้ามแถว header

    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      let value: unknown = row.getCell(colNumber).value;
      // เผื่อกรณี cell เป็นสูตร ({ formula, result }) — ใช้ผลลัพธ์แทนตัวสูตร
      if (value && typeof value === "object" && !(value instanceof Date) && "result" in (value as any)) {
        value = (value as any).result;
      }
      rowObj[header] = value === null || value === undefined ? "" : value;
    });
    rows.push(rowObj);
  });

  return rows;
}
