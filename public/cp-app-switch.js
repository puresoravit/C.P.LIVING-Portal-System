// Owner UAT — App-Switch Transition (Portal ↔ Billing) ให้เหมือนกันทั้ง 2 ทิศทาง
//
// การนำทางข้าม "โซนแอป" (Portal/Login ↔ Billing) เป็น Full Page Load — Cross-document
// View Transition จะเล่นตาม @view-transition ใน globals.css ซึ่งตั้ง Root เป็น "สลับทันที"
// (เพื่อให้การนำทางภายใน Billing มีแค่ Sidebar Indicator ที่ไหล) — แต่ตอนสลับแอปทั้งที
// การสลับทันทีอ่านเป็น "ตัดฉับ" — Script นี้ติด View Transition Type `cp-app-switch`
// เฉพาะการนำทางที่ "ข้ามโซน" เพื่อให้ CSS (globals.css) เปิด Cross-fade นุ่มๆ ทั้งหน้าแทน
// เฉพาะกรณีนั้น — การนำทางภายใน Billing ไม่ถูกแตะเลย (ไม่มี Type → Instant Root เดิม)
//
// ต้องโหลดแบบ Blocking ต้นๆ ของหน้า: `pagereveal` ยิงก่อนเฟรมแรกของหน้าใหม่ — Listener
// ต้องลงทะเบียนให้ทันก่อนหน้านั้น (ดู <script> ใน src/app/layout.tsx)
//
// ระหว่าง App-Switch เรา "ถอน" view-transition-name ของ Sidebar Active Tab ชั่วคราว
// ทั้งสองฝั่ง: ถ้าปล่อยไว้ Tab จะถูกยกออกจากภาพ Root ไปเป็น Layer แยก — ภาพ Root ของฝั่ง
// Billing จะโหว่เป็นช่อง Navy ตรงตำแหน่ง Tab ระหว่าง Cross-fade — ถอนชื่อก่อน Capture
// ให้ Tab เป็นส่วนหนึ่งของภาพเต็มหน้า แล้วคืนชื่อหลัง Transition จบ (ฝั่งหน้าใหม่) เพื่อให้
// การนำทางภายใน Billing ครั้งถัดไป Indicator ไหลตามปกติ — ฝั่งหน้าเก่ากำลังถูกทิ้งอยู่แล้ว
// ไม่ต้องคืน (กรณี bfcache Restore มี Reload ทั้งหน้าอยู่แล้วใน inactivity-logout.tsx)
(function () {
  "use strict";

  // โซนของ URL: หน้า Portal/Login = "portal", ที่เหลือ (แอป Billing ทั้งหมด) = "app"
  function zoneOf(url) {
    try {
      var p = new URL(url, location.href).pathname;
      return p === "/login" || p === "/portal" || p.indexOf("/portal/") === 0 ? "portal" : "app";
    } catch (e) {
      return "app";
    }
  }

  function activeTab() {
    // Active Tab ใน sidebar-nav.tsx ติด Tailwind Arbitrary Class ที่มีสตริงนี้อยู่
    return document.querySelector('[class*="cp-nav-active"]');
  }

  function markAppSwitch(viewTransition, restoreTabAfter) {
    viewTransition.types.add("cp-app-switch");
    var tab = activeTab();
    if (tab) {
      tab.style.viewTransitionName = "none";
      if (restoreTabAfter) {
        viewTransition.finished.finally(function () {
          tab.style.viewTransitionName = "";
        });
      }
    }
  }

  // หน้าเก่า (กำลังออก): ตัดสินจากปลายทางใน NavigationActivation
  window.addEventListener("pageswap", function (e) {
    if (!e.viewTransition || !e.activation) return;
    var to = e.activation.entry && e.activation.entry.url;
    if (to && zoneOf(location.href) !== zoneOf(to)) markAppSwitch(e.viewTransition, false);
  });

  // หน้าใหม่ (กำลังเข้า): ตัดสินจากต้นทางใน navigation.activation
  window.addEventListener("pagereveal", function (e) {
    if (!e.viewTransition) return;
    var act = typeof navigation !== "undefined" && navigation.activation;
    var from = act && act.from && act.from.url;
    if (from && zoneOf(from) !== zoneOf(location.href)) markAppSwitch(e.viewTransition, true);
  });
})();
