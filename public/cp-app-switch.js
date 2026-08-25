// Owner UAT — App-Switch Transition (Portal ↔ Billing) ให้เหมือนกันทั้ง 2 ทิศทาง
//
// ความไม่สมมาตรเดิม: Portal มี Entrance Fade ของตัวเอง (cpf-page-in ใน portal/layout.tsx
// เล่นได้ทุก Browser) แต่ฝั่ง Billing ไม่มี — ขากลับ Portal จึงนุ่มเสมอ ส่วนขาเข้า Billing
// โผล่ทันทีเป็นการกะพริบ โดยเฉพาะ Browser ที่ไม่รองรับ Cross-document View Transitions
// (iOS Safari/มือถือ) ซึ่ง Fade ผ่าน VT ไม่เล่นเลย
//
// Script นี้ทำ 2 ชั้น (Progressive Enhancement):
//
// ชั้นที่ 1 — Entrance Fade ข้ามแอป (ทุก Browser รวมมือถือ): จับ Click บน <a> ที่พา "ข้าม
// โซนแอป" (Portal/Login ↔ Billing) → ตั้งธงใน sessionStorage → Script นี้รันที่ต้น <body>
// ของหน้าใหม่ก่อน Content ถูก Parse: เจอธง → ติด Class `cp-app-enter` ที่ <html> →
// globals.css เล่น Fade-in ทั้ง Body หนึ่งครั้ง — การนำทาง "ภายใน" Billing ไม่ตั้งธง จึงยัง
// สลับทันที + Indicator ไหลตามเดิมเป๊ะ (ธงถูกลบทันทีที่อ่าน กันติดค้างข้าม Session)
//
// ชั้นที่ 2 — View Transition Cross-fade (Chrome/Edge Desktop): ติด Type `cp-app-switch`
// เฉพาะการนำทางข้ามโซนผ่าน pageswap/pagereveal → globals.css เปิด Cross-fade ทั้งหน้า
// (เห็นหน้าเก่า Fade-out พร้อมหน้าใหม่ Fade-in — เหนือกว่าชั้นที่ 1 ซึ่งเห็นแต่ขาเข้า) —
// เมื่อ VT ทำงานจริง เอา Class `cp-app-enter` ของชั้นที่ 1 ออกก่อนเฟรมแรก กันซ้อนกัน 2 Fade
//
// ระหว่าง VT App-Switch ต้อง "ถอน" view-transition-name ของ Sidebar Active Tab ชั่วคราว
// ทั้งสองฝั่ง: ถ้าปล่อยไว้ Tab จะถูกยกออกจากภาพ Root เป็น Layer แยก — ภาพ Root ฝั่ง Billing
// จะโหว่เป็นช่อง Navy ตรง Tab ระหว่าง Fade / Tab ฝั่งใหม่จะโผล่ทันทีก่อนหน้า Fade เสร็จ —
// ใช้ Class ที่ <html> + กฎ !important ใน globals.css (ทนกว่าแก้ Style รายตัว: ครอบคลุม
// แม้ Tab ยังไม่ถูก Parse ณ เวลานั้น) แล้วถอด Class เมื่อ Transition จบ ให้การนำทางภายใน
// Billing ครั้งถัดไป Indicator ไหลตามปกติ (bfcache Restore มี Reload ทั้งหน้าอยู่แล้วใน
// inactivity-logout.tsx จึงไม่มีทางติดค้าง)
(function () {
  "use strict";

  var ENTER_FLAG = "cpAppEnter";

  // โซนของ URL: หน้า Portal/Login = "portal", ที่เหลือ (แอป Billing ทั้งหมด) = "app"
  function zoneOf(url) {
    try {
      var p = new URL(url, location.href).pathname;
      return p === "/login" || p === "/portal" || p.indexOf("/portal/") === 0 ? "portal" : "app";
    } catch (e) {
      return "app";
    }
  }

  // ---- ชั้นที่ 1: Entrance Fade (ทุก Browser) ----
  // ธงเก็บเป็น Timestamp และยอมรับเฉพาะภายใน 10 วินาที — กันธงค้าง (เช่น การนำทางถูก
  // ยกเลิกกลางคัน) ไปทำให้การคลิกเมนูภายในครั้งถัดไปได้ Fade ที่ไม่ควรมี
  try {
    var flagTs = Number(sessionStorage.getItem(ENTER_FLAG) || 0);
    if (flagTs > 0) {
      sessionStorage.removeItem(ENTER_FLAG);
      if (Date.now() - flagTs < 10000) document.documentElement.classList.add("cp-app-enter");
    }
  } catch (e) {
    // sessionStorage ถูกปิด — ข้ามชั้นนี้ไป (หน้าแค่โผล่ทันทีแบบเดิม ไม่พังอะไร)
  }

  document.addEventListener(
    "click",
    function (e) {
      // เฉพาะคลิกซ้ายเปล่าๆ ที่จะนำทางในแท็บนี้จริงเท่านั้น — Cmd/Ctrl/Shift/กลาง
      // (เปิดแท็บใหม่/หน้าต่างใหม่) ต้องไม่ตั้งธง ไม่งั้นธงค้างในแท็บเดิมแล้วไปทำให้
      // การคลิกเมนูภายในครั้งถัดไปได้ Fade ที่ไม่ควรมี (อาการ "บางทีแปลกๆ")
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || e.defaultPrevented) return;
      var href = a.getAttribute("href");
      if (!href || href.indexOf("#") === 0) return;
      try {
        var to = new URL(a.href, location.href);
        if (to.origin !== location.origin) return;
        if (zoneOf(location.href) !== zoneOf(to.href)) sessionStorage.setItem(ENTER_FLAG, String(Date.now()));
      } catch (err) {
        /* URL เพี้ยน — ไม่ตั้งธง */
      }
    },
    true
  );

  // ---- ชั้นที่ 2: View Transition Types (Chrome/Edge) ----
  function markAppSwitch(viewTransition) {
    viewTransition.types.add("cp-app-switch");
    var root = document.documentElement;
    root.classList.add("cp-vt-appswitch");
    viewTransition.finished.finally(function () {
      root.classList.remove("cp-vt-appswitch");
    });
  }

  // หน้าเก่า (กำลังออก): ตัดสินจากปลายทางใน NavigationActivation
  window.addEventListener("pageswap", function (e) {
    if (!e.viewTransition || !e.activation) return;
    var to = e.activation.entry && e.activation.entry.url;
    if (to && zoneOf(location.href) !== zoneOf(to)) markAppSwitch(e.viewTransition);
  });

  // หน้าใหม่ (กำลังเข้า): ตัดสินจากต้นทางใน navigation.activation
  window.addEventListener("pagereveal", function (e) {
    if (!e.viewTransition) return;
    var act = typeof navigation !== "undefined" && navigation.activation;
    var from = act && act.from && act.from.url;
    if (from && zoneOf(from) !== zoneOf(location.href)) {
      markAppSwitch(e.viewTransition);
      // VT Cross-fade ทำงานแล้ว — ปิด Entrance Fade ของชั้นที่ 1 กันซ้อน 2 Fade
      document.documentElement.classList.remove("cp-app-enter");
    }
  });
})();
