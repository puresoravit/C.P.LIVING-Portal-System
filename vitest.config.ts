import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Stabilization — Test Pollution: `.claude/worktrees/*` (Git Worktree ค้างของ Branch อื่น
    // ที่ยังไม่ Merge) มี src/ สำเนาเก่าทั้งชุด Vitest เดิมเก็บ Test จากในนั้นมารันซ้ำด้วย
    // (47 ไฟล์ = 24 จริง + 23 สำเนาเก่า) ทำให้ตัวเลข Test Suite ของโปรเจกต์เพี้ยน และถ้า
    // สำเนาเก่า Diverge/พังจะทำให้ CI แดงทั้งที่โค้ดจริงไม่มีปัญหา — Exclude ออกชัดๆ
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
