// heic-convert ไม่มี @types อย่างเป็นทางการ — Declare เฉพาะรูปแบบที่ใช้จริงเท่านั้น
// (Buffer in/out) ดู src/lib/server-image-convert.ts จุดเดียวที่เรียกใช้
declare module "heic-convert" {
  function convert(options: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }): Promise<ArrayBuffer>;
  export default convert;
}
