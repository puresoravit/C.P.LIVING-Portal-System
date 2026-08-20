"use client";

export function PrintButton({ markPrintedAction }: { markPrintedAction?: (formData: FormData) => void }) {
  return (
    <div className="print:hidden flex gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
      <button
        onClick={() => window.print()}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
      >
        พิมพ์ / บันทึกเป็น PDF
      </button>
      {markPrintedAction && (
        <form action={markPrintedAction}>
          <button className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2">
            มาร์คว่าพิมพ์แล้ว
          </button>
        </form>
      )}
      <button
        onClick={() => window.history.back()}
        className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2"
      >
        ← กลับ
      </button>
    </div>
  );
}
