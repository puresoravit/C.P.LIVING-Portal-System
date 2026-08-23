import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { manrope, lineSeedSansTH } from "@/fonts";

export const metadata: Metadata = {
  title: "C.P. LIVING Billing",
  description: "ระบบจัดการลูกค้า สินค้า ราคา ส่วนลด และออกบิล",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Owner UAT — Global Typography: ประกาศ CSS Variable ของทั้ง 2 Font ที่ <html> จุดเดียว
    // ทั้งแอพสืบทอด (globals.css body ใช้ var(--font-latin)/var(--font-thai) ประกอบ Stack)
    <html lang="th" className={`${manrope.variable} ${lineSeedSansTH.variable}`}>
      <body className="bg-gray-50 text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
