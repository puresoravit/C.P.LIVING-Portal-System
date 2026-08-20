import ExcelJS from "exceljs";

/**
 * สร้างไฟล์ Excel จาก array ของ object เป็น Buffer (.xlsx) — ใช้ร่วมกันทั้ง
 * Import Template และ Export Report ในระบบ
 * @param headers ถ้าระบุ จะบังคับลำดับ/ชื่อ column ตามนี้เป๊ะ (ใช้กับ Template
 *   ที่ต้อง fix ลำดับ column เสมอ) ถ้าไม่ระบุ จะดึงจาก key ของแถวแรกตามลำดับ
 *   ที่ประกาศไว้ (พฤติกรรมเดิมของ XLSX.utils.json_to_sheet ตอนไม่ส่ง header option)
 */
export async function rowsToXlsxBuffer(
  rows: Record<string, unknown>[],
  sheetName: string,
  headers?: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const columns = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  worksheet.columns = columns.map((key) => ({ header: key, key }));

  for (const row of rows) {
    worksheet.addRow(row);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** สร้างไฟล์ Excel Template: แถวหัวข้อ + 1 แถวตัวอย่างข้อมูลจริง (ข้อ 43) */
export async function buildTemplateBuffer(
  headers: string[],
  exampleRow: Record<string, unknown>
): Promise<Buffer> {
  return rowsToXlsxBuffer([exampleRow], "Template", headers);
}

export function excelFileResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
