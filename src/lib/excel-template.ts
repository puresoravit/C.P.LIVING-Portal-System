import * as XLSX from "xlsx";

/** สร้างไฟล์ Excel Template: แถวหัวข้อ + 1 แถวตัวอย่างข้อมูลจริง (ข้อ 43) */
export function buildTemplateBuffer(headers: string[], exampleRow: Record<string, unknown>): Buffer {
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function excelFileResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
