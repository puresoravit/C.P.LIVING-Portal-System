"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import type { StatusBadgeConfig } from "@/components/status-badge";
import { useToast } from "@/components/toast/toast-provider";
import { pullForwardShipDate } from "@/app/production/orders/actions";
import { PullForwardButton } from "@/components/production/pull-forward-button";

// CP7 round 7 (2026-08-30, Owner UAT — สั่งซ้ำเป็นครั้งที่ 2) — ลากการ์ดไปทับกันได้จริง ไม่ใช่
// แค่ปุ่ม "ส่งวันนี้แทน" (ยังคงไว้เป็นทางเลือกที่กดง่ายกว่าบนมือถือ) ลากการ์ด A ไปวางทับ B =
// ถามยืนยันแล้วดึงวันที่ของ A มาให้ตรงกับ B (ปกติ B คือใบที่จะส่งวันนี้/เร็วกว่า)
//
// ใช้ Pointer Events (ตัวเดียวรองรับทั้งเมาส์+ทัช) ไม่ใช้ HTML5 Drag-and-Drop API เพราะ API
// นั้นทำงานเฉพาะเมาส์ ทัชหน้าจอไม่ยิง event เลย (จะพังบนมือถือทันที ขัดกับ mobile-first) —
// เมาส์: เริ่มลากได้ทันทีเมื่อขยับเกิน threshold เล็กน้อย · ทัช: ต้องกดค้าง (long-press) ก่อน
// ถึงเริ่มลาก กันชนกับการปัดสกอลปกติ (ปัดเร็วไม่ทริกเกอร์ลาก สกอลได้ตามปกติเป๊ะ)
const LONG_PRESS_MS = 350;
const MOVE_THRESHOLD_PX = 8;

export type DraggableQueueItem = {
  id: string; // productionOrder id — key
  customerPoId: string;
  version: number;
  href: string;
  urgencyLabel: string;
  urgencyClassName: string;
  statusKey: string;
  customerName: string;
  branchName: string | null;
  isUrgent: boolean;
  mergedCount?: number;
  itemCount: number;
  pieceCount: number;
  prodNo: string;
  requestedDateLabel: string; // สำหรับโชว์ในกล่องยืนยัน
  requestedDateIso: string | null; // ส่งกลับเป็น targetDate ตอนยืนยัน (YYYY-MM-DD) — null = ยังไม่กำหนด ลากไปทับไม่ได้
  showPullForward: boolean;
};

export function DraggableQueueList({ items, badgeConfig }: { items: DraggableQueueItem[]; badgeConfig: StatusBadgeConfig }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmPair, setConfirmPair] = useState<{ source: DraggableQueueItem; target: DraggableQueueItem } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean; // true = drag actually engaged (past threshold/long-press)
    longPressTimer: ReturnType<typeof setTimeout> | null;
    item: DraggableQueueItem;
  } | null>(null);

  function clearDrag() {
    if (dragState.current?.longPressTimer) clearTimeout(dragState.current.longPressTimer);
    dragState.current = null;
    setDraggingId(null);
    setOverId(null);
    setGhostPos(null);
  }

  function engageDrag(x: number, y: number) {
    if (!dragState.current) return;
    dragState.current.active = true;
    setDraggingId(dragState.current.item.id);
    setGhostPos({ x, y });
  }

  function handlePointerDown(e: React.PointerEvent, item: DraggableQueueItem) {
    if (!item.requestedDateIso) return; // ยังไม่กำหนดวันส่ง — ไม่มีวันที่ให้ลากอ้างอิง
    (e.target as Element).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    dragState.current = { pointerId: e.pointerId, startX, startY, active: false, longPressTimer: null, item };
    if (e.pointerType === "touch") {
      dragState.current.longPressTimer = setTimeout(() => {
        if (dragState.current) engageDrag(startX, startY);
      }, LONG_PRESS_MS);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const st = dragState.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.active) {
      if (e.pointerType === "mouse" && Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        engageDrag(e.clientX, e.clientY);
      } else if (e.pointerType === "touch" && Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        // ขยับเร็วก่อนครบ long-press = ตั้งใจปัดสกอล ไม่ใช่ลาก — ยกเลิกไปเลย ปล่อยให้สกอลตามปกติ
        if (st.longPressTimer) clearTimeout(st.longPressTimer);
        dragState.current = null;
      }
      return;
    }
    e.preventDefault();
    setGhostPos({ x: e.clientX, y: e.clientY });
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cardEl = el?.closest("[data-queue-card-id]");
    const id = cardEl?.getAttribute("data-queue-card-id") ?? null;
    setOverId(id && id !== st.item.id ? id : null);
  }

  function handlePointerUp(e: React.PointerEvent, item: DraggableQueueItem) {
    const st = dragState.current;
    if (!st || st.pointerId !== e.pointerId) {
      clearDrag();
      return;
    }
    if (!st.active) {
      clearDrag();
      router.push(item.href); // แตะเฉยๆ ไม่ได้ลาก = นำทางตามปกติ
      return;
    }
    const targetId = overId;
    clearDrag();
    if (targetId) {
      const target = items.find((i) => i.id === targetId);
      if (target && target.requestedDateIso) setConfirmPair({ source: item, target });
    }
  }

  function handleConfirm() {
    if (!confirmPair) return;
    const { source, target } = confirmPair;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("version", String(source.version));
        formData.set("targetDate", target.requestedDateIso!);
        const result = await pullForwardShipDate(source.customerPoId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        setConfirmPair(null);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง");
      }
    });
  }

  const draggingItem = draggingId ? items.find((i) => i.id === draggingId) : null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          data-queue-card-id={item.id}
          onPointerDown={(e) => handlePointerDown(e, item)}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => handlePointerUp(e, item)}
          onPointerCancel={clearDrag}
          style={{ touchAction: draggingId === item.id ? "none" : "pan-y" }}
          className={`block bg-white border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none transition ${
            draggingId === item.id ? "opacity-30" : ""
          } ${overId === item.id ? "border-cp-navy border-2 bg-cp-navy/5" : "hover:border-cp-navy"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.urgencyClassName}`}>{item.urgencyLabel}</span>
            <div className="flex items-center gap-1.5">
              {item.showPullForward && <PullForwardButton customerPoId={item.customerPoId} version={item.version} dateLabel={item.urgencyLabel} />}
              <StatusBadge status={item.statusKey} config={badgeConfig} />
            </div>
          </div>
          <div className="text-sm text-gray-700 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium">{item.customerName}</span>
            {item.branchName && <span className="text-gray-500">— {item.branchName}</span>}
            {item.isUrgent && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">ด่วน</span>}
            {item.mergedCount != null && item.mergedCount > 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">รวม {item.mergedCount} ใบผลิต</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {item.itemCount} รายการ · {item.pieceCount} ชิ้น
            <span className="text-gray-400 font-mono ml-2">{item.prodNo}</span>
          </div>
        </div>
      ))}

      {/* การ์ดผีลอยตามนิ้ว/เมาส์ตอนลาก */}
      {draggingItem && ghostPos && (
        <div
          className="fixed z-50 pointer-events-none bg-white border-2 border-cp-navy rounded-lg p-3 shadow-xl opacity-90"
          style={{ left: ghostPos.x + 12, top: ghostPos.y + 12, width: "260px" }}
        >
          <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${draggingItem.urgencyClassName}`}>{draggingItem.urgencyLabel}</div>
          <div className="text-sm font-medium mt-1">{draggingItem.customerName}</div>
        </div>
      )}

      {confirmPair && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmPair(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-base mb-2">ต้องการส่งพร้อมกันใช่ไหม?</h2>
            <p className="text-sm text-gray-500 mb-4">
              ย้ายกำหนดส่งของ <span className="font-medium text-gray-700">{confirmPair.source.customerName}</span> ({confirmPair.source.requestedDateLabel})
              ไปเป็นวันเดียวกับ <span className="font-medium text-gray-700">{confirmPair.target.customerName}</span> ({confirmPair.target.requestedDateLabel})
              — บันทึกเป็นประวัติแก้ไขออเดอร์
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmPair(null)}
                disabled={isPending}
                className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
