"use client";

import { useFieldErrorsContext } from "./field-errors-context";

// Phase R2.0 — Shared Field Error Pattern: input/select/textarea ที่ผูกกับ
// FieldErrorsContext อัตโนมัติ ทุกหน้าที่ใช้ 3 ตัวนี้แทน <input>/<select>/<textarea>
// ธรรมดา จะได้ Border แดง + background แดงอ่อน + ข้อความ error ใต้ Field +
// aria-invalid/aria-describedby แบบเดียวกันหมดโดยไม่ต้องเขียนซ้ำทุกหน้า
//
// Accessibility: ไม่พึ่งสีแดงอย่างเดียว — มีข้อความ error เสมอ + aria-invalid +
// aria-describedby ชี้ไปยัง <p> ข้อความ error
//
// Clear-on-edit: พอ user เริ่มพิมพ์/เปลี่ยนค่า Field ที่ error อยู่ จะ clear เฉพาะ
// error ของ Field นั้น Field อื่นที่ยัง error อยู่ไม่ถูกแตะ (ตาม Requirement)
const baseInputClass = "w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2";
const normalClass = "border-gray-300 focus:ring-blue-500";
const errorClass = "border-red-400 bg-red-50 focus:ring-red-400";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  autoFocus = false,
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  step?: string;
  min?: string | number;
  max?: string | number;
}) {
  const { fieldErrors, clearFieldError, isPending } = useFieldErrorsContext();
  const error = fieldErrors[name];
  const errorId = `${name}-error`;

  return (
    <div>
      {label && (
        <label htmlFor={name} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <input
        id={name}
        name={name}
        type={type}
        step={step ?? (type === "number" ? "0.01" : undefined)}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        disabled={isPending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={() => error && clearFieldError(name)}
        className={`${baseInputClass} ${error ? errorClass : normalClass} disabled:opacity-60`}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  required = false,
  autoFocus = false,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  const { fieldErrors, clearFieldError, isPending } = useFieldErrorsContext();
  const error = fieldErrors[name];
  const errorId = `${name}-error`;

  return (
    <div>
      {label && (
        <label htmlFor={name} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        disabled={isPending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={() => error && clearFieldError(name)}
        className={`${baseInputClass} ${error ? errorClass : normalClass} disabled:opacity-60`}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  rows = 2,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  const { fieldErrors, clearFieldError, isPending } = useFieldErrorsContext();
  const error = fieldErrors[name];
  const errorId = `${name}-error`;

  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        disabled={isPending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={() => error && clearFieldError(name)}
        className={`${baseInputClass} ${error ? errorClass : normalClass} disabled:opacity-60`}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
