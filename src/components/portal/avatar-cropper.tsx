"use client";

import { useEffect, useRef, useState } from "react";
import { MOTION_EASE, CP_GOLD } from "@/components/portal/cp-brand";

// R6 Phase F — Owner UAT: Avatar Cropper — Pan + Zoom แบบ Cover Fit (เหมือน
// Instagram/Slack) บนพื้นที่สี่เหลี่ยมจัตุรัสคงที่ แสดง Overlay วงกลมช่วยดูตำแหน่งจริง
// เวลาแสดงเป็น Avatar (พฤติกรรมแสดงผลจริงเป็นวงกลมผ่าน CSS border-radius ที่จุดแสดง —
// ไฟล์ที่เก็บจริงเป็นสี่เหลี่ยมจัตุรัสเสมอ มาตรฐานเดียวกับ Avatar ทั่วไป) — ลาก/Zoom
// ด้วย Pointer Events (setPointerCapture กันปัญหา Ghost Listener แบบเดียวกับที่เจอใน
// Document Designer Canvas มาก่อน) — ผล Crop คือ JPEG Data URI ขนาด OUTPUT_SIZE คงที่
// (Server ยัง Re-validate ชนิด/ขนาดซ้ำเสมอผ่าน validateAvatarDataUri ไม่เชื่อ Client)
const VIEW_SIZE = 240;
const OUTPUT_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function AvatarCropper({
  imageSrc,
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedDataUri: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  function baseScale(nat: { w: number; h: number }) {
    return Math.max(VIEW_SIZE / nat.w, VIEW_SIZE / nat.h);
  }

  function clampPan(nat: { w: number; h: number }, z: number, p: { x: number; y: number }) {
    const scale = baseScale(nat) * z;
    const imgW = nat.w * scale;
    const imgH = nat.h * scale;
    const maxX = Math.max(0, (imgW - VIEW_SIZE) / 2);
    const maxY = Math.max(0, (imgH - VIEW_SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    setNatural(nat);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!natural) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };

    function onMove(ev: PointerEvent) {
      if (!dragRef.current || !natural) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPan(clampPan(natural, zoom, { x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }));
    }
    function onUp() {
      dragRef.current = null;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    if (natural) setPan((p) => clampPan(natural, zoom, p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    const ratio = OUTPUT_SIZE / VIEW_SIZE;
    const scale = baseScale(natural) * zoom;
    const imgW = natural.w * scale;
    const imgH = natural.h * scale;
    const left = (VIEW_SIZE - imgW) / 2 + pan.x;
    const top = (VIEW_SIZE - imgH) / 2 + pan.y;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, 0, 0, natural.w, natural.h, left * ratio, top * ratio, imgW * ratio, imgH * ratio);
    onConfirm(canvas.toDataURL("image/jpeg", 0.87));
  }

  const scale = natural ? baseScale(natural) * zoom : 1;

  return (
    <div className="space-y-4">
      <div
        onPointerDown={onPointerDown}
        className="relative mx-auto rounded-xl overflow-hidden bg-gray-900 cursor-move select-none touch-none"
        style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Object URL ของไฟล์ที่ยังไม่ Upload ไม่ต้องผ่าน Optimizer */}
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          draggable={false}
          onLoad={handleImgLoad}
          className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
          style={{
            width: natural ? natural.w * scale : "auto",
            height: natural ? natural.h * scale : "auto",
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        />
        {/* Overlay วงกลมช่วยดูตำแหน่งจริงตอนแสดงเป็น Avatar — ตกแต่งอย่างเดียว ไม่กระทบ
            พื้นที่ Crop จริง (Crop จริงคือสี่เหลี่ยมเต็ม VIEW_SIZE เสมอ) */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: `0 0 0 999px rgba(7,18,40,0.55) inset`, borderRadius: "50%", margin: 4 }}
        />
        <div aria-hidden className="absolute inset-0 pointer-events-none rounded-full" style={{ margin: 4, border: `1.5px solid ${CP_GOLD}` }} />
      </div>

      <div className="flex items-center gap-3 max-w-[240px] mx-auto">
        <span className="text-xs text-gray-500">ซูม</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1"
          style={{ accentColor: CP_GOLD }}
        />
      </div>
      <p className="text-center text-xs text-gray-400">ลากรูปเพื่อจัดตำแหน่ง — เลื่อนแถบเพื่อซูม</p>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 transition-colors"
          style={{ transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!natural}
          className="text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-50 transition-colors"
          style={{ background: "#0B1B3A", transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
        >
          ใช้รูปนี้
        </button>
      </div>
    </div>
  );
}
