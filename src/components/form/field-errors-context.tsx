"use client";

import { createContext, useContext } from "react";

// Phase R2.0 — Shared Field Error Pattern: Context กลางที่ ActionForm เป็นคนเซ็ต
// ให้ Field/SelectField/TextareaField ทุกตัวใน Form อ่าน error ของตัวเองได้จาก name
// โดยไม่ต้องส่ง props ผ่านหลายชั้น — ค่า default (ไม่มี Provider ครอบ) ปลอดภัย คือ
// "ไม่มี error เลย" เผื่อกรณีใช้ Field เหล่านี้นอก ActionForm โดยไม่ได้ตั้งใจ
export type FieldErrorsContextValue = {
  fieldErrors: Record<string, string>;
  clearFieldError: (name: string) => void;
  isPending: boolean;
};

const noop = () => {};

export const FieldErrorsContext = createContext<FieldErrorsContextValue>({
  fieldErrors: {},
  clearFieldError: noop,
  isPending: false,
});

export function useFieldErrorsContext(): FieldErrorsContextValue {
  return useContext(FieldErrorsContext);
}
