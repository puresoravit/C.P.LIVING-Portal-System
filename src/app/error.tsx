"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/log-client-error";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError(error.message, error.digest).catch(() => {});
  }, [error]);

  return (
    <html lang="th">
      <body>
        <div style={{ maxWidth: 400, margin: "80px auto", textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>เกิดข้อผิดพลาดบางอย่าง</h1>
          <p style={{ color: "#666", fontSize: 14 }}>กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ</p>
          <button onClick={() => reset()} style={{ padding: "8px 16px", marginTop: 12 }}>
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
