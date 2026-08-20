import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { worksheetToRows } from "./excel-import";
import { rowsToXlsxBuffer, buildTemplateBuffer } from "./excel-template";

async function bufferToFirstWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled .d.ts declares its own Buffer type that predates
  // @types/node's newer generic Buffer<ArrayBufferLike> shape — the two
  // Buffer type declarations disagree structurally even though the runtime
  // value is a real, correct Node Buffer. Same class of mismatch already
  // worked around in excel-template.ts's Response() call.
  await workbook.xlsx.load(buffer as any);
  return workbook.worksheets[0];
}

describe("worksheetToRows (แทนที่ XLSX.utils.sheet_to_json หลังย้ายไป exceljs)", () => {
  it("อ่าน header + แถวข้อมูลกลับมาเป็น array ของ object ตาม key ชื่อ column", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Sheet1");
    ws.columns = [
      { header: "sku", key: "sku" },
      { header: "name", key: "name" },
      { header: "price", key: "price" },
    ];
    ws.addRow({ sku: "M001", name: "ที่นอน A", price: 3900 });
    ws.addRow({ sku: "M002", name: "ที่นอน B", price: 4200 });

    const rows = worksheetToRows(ws);
    expect(rows).toEqual([
      { sku: "M001", name: "ที่นอน A", price: 3900 },
      { sku: "M002", name: "ที่นอน B", price: 4200 },
    ]);
  });

  it("ช่องว่าง/ไม่มีค่า -> string ว่าง (defval: \"\" แบบเดิม) ไม่ใช่ undefined/null", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Sheet1");
    ws.columns = [
      { header: "code", key: "code" },
      { header: "note", key: "note" },
    ];
    ws.addRow({ code: "C001" }); // note ไม่ใส่ค่าเลย

    const rows = worksheetToRows(ws);
    expect(rows[0]).toEqual({ code: "C001", note: "" });
  });

  it("cell ที่เป็นวันที่ -> JS Date object เสมอ (ไม่ใช่เลข serial) — กันบั๊กเดิมที่เคยเจอ", async () => {
    const buffer = await rowsToXlsxBuffer(
      [{ effectiveFrom: new Date("2026-03-15T00:00:00.000Z") }],
      "Sheet1"
    );
    const ws = await bufferToFirstWorksheet(buffer);
    const rows = worksheetToRows(ws);

    expect(rows[0].effectiveFrom).toBeInstanceOf(Date);
    expect((rows[0].effectiveFrom as Date).toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("round-trip เต็ม: buildTemplateBuffer (เขียน) -> worksheetToRows (อ่าน) ต้องได้ข้อมูลตัวอย่างกลับมาเป๊ะ", async () => {
    const headers = ["sku", "name", "productTypeCode", "size", "unit", "standardPrice", "description"];
    const exampleRow = {
      sku: "M001",
      name: "ที่นอนสปริง GT-David ขนาด 5 ฟุต",
      productTypeCode: "A",
      size: "5 ฟุต",
      unit: "หลัง",
      standardPrice: 3900,
      description: "",
    };
    const buffer = await buildTemplateBuffer(headers, exampleRow);
    const ws = await bufferToFirstWorksheet(buffer);
    const rows = worksheetToRows(ws);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(exampleRow);
  });

  it("Export (ไม่ระบุ headers) — ลำดับ column ต้องตรงกับลำดับ key ของแถวแรกเป๊ะ เหมือนพฤติกรรมเดิมของ json_to_sheet", async () => {
    const rows = [
      { Date: "2026-08-20", "Order Number": "ORDER-1", SKU: "M001", Quantity: 2 },
      { Date: "2026-08-21", "Order Number": "ORDER-2", SKU: "M002", Quantity: 5 },
    ];
    const buffer = await rowsToXlsxBuffer(rows, "Raw Data");
    const ws = await bufferToFirstWorksheet(buffer);

    const headerRow = ws.getRow(1);
    const actualHeaders: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => actualHeaders.push(String(cell.value)));
    expect(actualHeaders).toEqual(["Date", "Order Number", "SKU", "Quantity"]);

    const parsedRows = worksheetToRows(ws);
    expect(parsedRows).toEqual(rows);
  });

  it("ลำดับ column ของ Template ต้องตรงกับ headers ที่ส่งเข้าไปเป๊ะ (ไม่สลับ)", async () => {
    const headers = ["z_last", "a_first", "m_middle"];
    const buffer = await buildTemplateBuffer(headers, { z_last: "1", a_first: "2", m_middle: "3" });
    const ws = await bufferToFirstWorksheet(buffer);

    const headerRow = ws.getRow(1);
    const actualHeaders: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => actualHeaders.push(String(cell.value)));
    expect(actualHeaders).toEqual(headers);
  });
});
