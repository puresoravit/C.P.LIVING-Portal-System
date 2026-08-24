"use client";

import { useEffect, useState, useTransition } from "react";
import { startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import type { RegistrationResponseJSON, PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { CP_GOLD, MOTION_EASE } from "@/components/portal/cp-brand";

// ==========================================================================
// Phase G — My Profile → Security / Passkeys — UI ทำหน้าที่แค่ "เรียก OS Prompt จริงผ่าน
// WebAuthn API" (navigator.credentials.create ผ่าน @simplewebauthn/browser) แล้วส่งผลไปให้
// Server Verify — ไม่มี UI ปลอมเลียนแบบ Face ID/ลายนิ้วมือ, ไม่เคยเห็น/เก็บ Biometric หรือ
// Private Key (Authenticator ไม่ส่งมาให้ตาม Spec) — Visual Language เดียวกับ Profile Form
// ==========================================================================

export type PasskeyRow = { id: string; label: string; deviceType: string; backedUp: boolean; createdAtLabel: string; lastUsedAtLabel: string | null };

export function PasskeySection({
  passkeys,
  beginAction,
  finishAction,
  renameAction,
  removeAction,
}: {
  passkeys: PasskeyRow[];
  beginAction: () => Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>;
  finishAction: (input: { challengeId: string; response: RegistrationResponseJSON; label: string }) => Promise<ActionResult>;
  renameAction: (credentialId: string, formData: FormData) => Promise<ActionResult>;
  removeAction: (credentialId: string) => Promise<ActionResult>;
}) {
  const { showSuccess, showError } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState<boolean>(false);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // ตรวจความสามารถของ Browser/Device หลัง Mount (เป็น Client API) — ไม่รองรับ = โชว์ข้อความ
    // แทนปุ่ม ไม่ปล่อยให้กดแล้ว Error งงๆ (Graceful Degrade)
    const ok = browserSupportsWebAuthn();
    setSupported(ok);
    if (ok) platformAuthenticatorIsAvailable().then(setPlatformAvailable).catch(() => setPlatformAvailable(false));
  }, []);

  async function handleAdd() {
    if (adding) return;
    setAdding(true);
    try {
      const { options, challengeId } = await beginAction();
      let response: RegistrationResponseJSON;
      try {
        // ณ จุดนี้ OS แสดง Prompt จริง (Face ID / Touch ID / Fingerprint / PIN) — ถ้าผู้ใช้กดยกเลิก
        // Browser โยน NotAllowedError → จับแยกให้ข้อความสุภาพ ไม่ใช่ Error สีแดง
        response = await startRegistration({ optionsJSON: options });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        // Owner UAT (มือถือผ่าน LAN) — สาเหตุที่พบจริงบ่อยสุดของ SecurityError/ล้มเหลว
        // ทั่วไปคือ "เข้าผ่าน IP/โดเมนที่ไม่ตรงกับระบบ": มาตรฐาน WebAuthn บังคับให้ RP ID
        // เป็นชื่อโดเมนจริงที่ตรงกับที่เปิดอยู่เท่านั้น (IP Address ใช้เป็น RP ID ไม่ได้เลย
        // ตามสเปค) — ข้อความเดิม "อุปกรณ์อาจไม่รองรับ" ชวนไล่เปลี่ยนเครื่องผิดทาง จึงตรวจ
        // Hostname ปัจจุบันแล้วบอกสาเหตุจริงตรงๆ แทน
        const isIpHost = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);
        if (name === "NotAllowedError") showError("ยกเลิกการเพิ่ม Passkey แล้ว");
        else if (name === "InvalidStateError") showError("อุปกรณ์นี้มี Passkey ของบัญชีนี้อยู่แล้ว");
        else if (isIpHost)
          showError("Passkey ใช้ผ่าน IP Address ไม่ได้ (ข้อจำกัดของมาตรฐานความปลอดภัย) — ต้องเข้าผ่านโดเมนจริงแบบ HTTPS เช่นหลังระบบขึ้น Production");
        else showError("เพิ่ม Passkey ไม่สำเร็จ — อุปกรณ์/เบราว์เซอร์นี้อาจไม่รองรับ");
        return;
      }
      const result = await finishAction({ challengeId, response, label });
      if (result.success) {
        showSuccess(result.message ?? "เพิ่ม Passkey สำเร็จ");
        setLabel("");
      } else {
        showError(result.error);
      }
    } catch {
      showError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setAdding(false);
    }
  }

  function handleRename(id: string) {
    const fd = new FormData();
    fd.set("label", editLabel);
    startTransition(async () => {
      const result = await renameAction(id, fd);
      if (result.success) {
        showSuccess(result.message ?? "บันทึกแล้ว");
        setEditingId(null);
      } else showError(result.error);
    });
  }

  function handleRemove(id: string, name: string) {
    if (!window.confirm(`ลบ Passkey "${name}" ? อุปกรณ์นี้จะเข้าสู่ระบบด้วย Passkey ไม่ได้อีก (ยังใช้รหัสผ่านได้ตามปกติ)`)) return;
    startTransition(async () => {
      const result = await removeAction(id);
      if (result.success) showSuccess(result.message ?? "ลบแล้ว");
      else showError(result.error);
    });
  }

  const inputClass = "w-full rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 focus:outline-none focus:ring-2";

  return (
    <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-6">
      <h2 className="text-sm font-medium text-slate-200 mb-1">Passkey / Face ID / ลายนิ้วมือ — Security</h2>
      <p className="text-xs text-slate-500 mb-5">
        เข้าสู่ระบบด้วย Face ID, Touch ID หรือลายนิ้วมือของอุปกรณ์ — ข้อมูลชีวมิติอยู่ในเครื่องของคุณเท่านั้น ระบบเก็บแค่กุญแจสาธารณะ
        · รหัสผ่านยังใช้ได้เสมอ
      </p>

      {passkeys.length > 0 ? (
        <ul className="divide-y divide-white/10 mb-5">
          {passkeys.map((pk) => (
            <li key={pk.id} className="py-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex w-9 h-9 rounded-full border items-center justify-center shrink-0" style={{ borderColor: CP_GOLD, color: CP_GOLD }} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="12" r="4" />
                  <path d="M12 12h9M18 12v3M21 12v2" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                {editingId === pk.id ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={60} className={`${inputClass} max-w-xs`} style={{ ["--tw-ring-color" as string]: CP_GOLD }} />
                    <button type="button" onClick={() => handleRename(pk.id)} disabled={isPending} className="text-xs font-medium rounded-lg px-3 py-2" style={{ background: CP_GOLD, color: "#071228" }}>
                      บันทึก
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-300 border border-white/15 rounded-lg px-3 py-2">
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-white truncate">{pk.label}</div>
                    <div className="text-[11px] text-slate-500">
                      เพิ่มเมื่อ {pk.createdAtLabel}
                      {pk.lastUsedAtLabel ? ` · ใช้ล่าสุด ${pk.lastUsedAtLabel}` : " · ยังไม่เคยใช้"}
                      {pk.deviceType === "multiDevice" ? " · Synced Passkey" : " · เฉพาะอุปกรณ์นี้"}
                    </div>
                  </>
                )}
              </div>
              {editingId !== pk.id && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditingId(pk.id); setEditLabel(pk.label); }} className="text-xs text-slate-300 hover:text-white border border-white/15 rounded-lg px-3 py-2">
                    เปลี่ยนชื่อ
                  </button>
                  <button type="button" onClick={() => handleRemove(pk.id, pk.label)} disabled={isPending} className="text-xs text-slate-300 hover:text-red-300 border border-white/15 rounded-lg px-3 py-2">
                    ลบ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 mb-5">ยังไม่มี Passkey — เพิ่มจากอุปกรณ์ที่คุณใช้ประจำ (iPhone / Android / Mac) ได้มากกว่าหนึ่งเครื่อง</p>
      )}

      {supported === false && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
          เบราว์เซอร์/อุปกรณ์นี้ไม่รองรับ Passkey — ยังเข้าสู่ระบบด้วยรหัสผ่านได้ตามปกติ
        </p>
      )}
      {supported && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <label className="block text-xs text-slate-400 mb-1.5">ชื่ออุปกรณ์ (เช่น iPhone ของฉัน)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Passkey" className={inputClass} style={{ ["--tw-ring-color" as string]: CP_GOLD }} />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="text-sm font-medium rounded-lg px-5 py-2.5 disabled:opacity-50 transition-colors"
            style={{ background: CP_GOLD, color: "#071228", transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
          >
            {adding ? "รอการยืนยันจากอุปกรณ์..." : "เพิ่ม Passkey / Add Passkey"}
          </button>
          {!platformAvailable && (
            <span className="text-[11px] text-slate-500 basis-full">อุปกรณ์นี้อาจไม่มี Face ID/ลายนิ้วมือในตัว — ระบบจะให้เลือก Passkey จากโทรศัพท์/Security Key แทน</span>
          )}
        </div>
      )}
    </section>
  );
}
