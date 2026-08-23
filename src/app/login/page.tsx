import fs from "node:fs";
import path from "node:path";
import { LoginClient } from "./login-client";

// R6 Phase F — Server Wrapper ของหน้า Login: เช็คว่ามีไฟล์ภาพพื้นหลังโรงงาน
// (public/login-bg.jpg) จริงหรือยัง แล้วส่งเป็น Flag ให้ Client — ไม่มีไฟล์ = ไม่ยิง
// Request ภาพเลย (ไม่มี 404 ใน Console) ใช้พื้น Navy Premium เป็น Fallback — Owner
// วางไฟล์ภาพเองได้ทุกเมื่อโดยไม่ต้องแก้โค้ด (Restart Server แล้วภาพขึ้นทันที)
export default function LoginPage() {
  const hasBgImage = fs.existsSync(path.join(process.cwd(), "public", "login-bg.jpg"));
  return <LoginClient hasBgImage={hasBgImage} />;
}
