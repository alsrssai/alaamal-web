/* إضافات الجوال (أندرويد وآيفون) — النسخة التجريبية. تُحمَّل بعد app.js */
"use strict";
const IS_ANDROID_APP = typeof window.AndroidBridge !== "undefined";
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IS_IOS_APP = window.IOS_APP === true; // داخل تطبيق آيفون الأصلي (WKWebView)
const IS_STANDALONE = IS_IOS_APP || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const PLATFORM = IS_ANDROID_APP ? "أندرويد" : IS_IOS ? "آيفون" : "الجوال";
const APP_VERSION = IS_ANDROID_APP ? AndroidBridge.version() : window.IOS_APP_VERSION || "0.1 (تجريبي)";
document.documentElement.classList.add("mobile", IS_ANDROID_APP ? "android" : IS_IOS ? "ios" : "web");

// الروابط الخارجية (مثل الاستماع في يوتيوب) تُفتح في متصفح الهاتف
if (IS_ANDROID_APP) {
  window.open = (url) => { try { AndroidBridge.openExternal(String(url)); } catch (e) { location.href = url; } return null; };
}

// زر الرجوع (أندرويد): يغلق النافذة المفتوحة، ثم يرجع إلى «الآن»، ثم يخرج
window.androidBack = function () {
  const open = [...document.querySelectorAll("dialog[open]")];
  if (open.length) { open[open.length - 1].close(); return true; }
  if ($("#search").value) { $("#search").value = ""; onSearch(); return true; }
  if (state.tab !== "now") { setTab("now"); window.scrollTo(0, 0); return true; }
  return false;
};

// تنبيه «نسخة تجريبية»: شارة دائمة في الرأس، ونافذة تعريف عند أول تشغيل
const TRIAL_NOTE = `هذه نسخة تجريبية من تطبيق «الغياث» لـ${PLATFORM}. المحتوى كامل ويعمل دون إنترنت، لكن بعض الميزات لم تُفعَّل بعد (التنبيهات وصوت الأذان، وحفظ الصور وملف التقويم، والطباعة)، وقد تظهر فيها أخطاء. نرجو إرسال ملاحظاتك.`;
function addTrialBadge() {
  if (document.querySelector(".trial-badge")) return;
  const b = document.createElement("button");
  b.className = "trial-badge";
  b.textContent = "نسخة تجريبية";
  b.onclick = showTrial;
  (document.querySelector(".date-box") || document.querySelector(".date-nav")).appendChild(b);
}
function showTrial() {
  let d = document.querySelector("#trialDialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "trialDialog";
    d.innerHTML = `<form method="dialog" class="dlg"><div class="dlg-head"><h2>🧪 نسخة تجريبية</h2></div>
      <div class="report-body"><p style="color:var(--text);line-height:1.9">${TRIAL_NOTE}</p>
      <p>للإبلاغ عن خطأ في نص: افتح النص واضغط «⚑ خطأ؟»، وتُجمع ملاحظاتك في الإعدادات.</p>
      <button class="primary-btn">حسنًا</button></div></form>`;
    document.body.appendChild(d);
  }
  d.showModal();
}
// ملاحظة في أعلى «الآن» وفي الإعدادات
const _renderNow = renderNow;
renderNow = function () {
  _renderNow();
  const sec = $("#tab-now");
  if (!sec.querySelector(".trial-note")) sec.insertAdjacentHTML("afterbegin", `<div class="trial-note">🧪 <b>نسخة تجريبية لـ${PLATFORM}</b> — بعض الميزات غير مفعّلة بعد. <button class="link-btn" onclick="showTrial()">التفاصيل</button></div>`);
};
const _renderSettings = renderSettings;
renderSettings = function () {
  _renderSettings();
  $("#tab-settings").insertAdjacentHTML("afterbegin", `<div class="trial-note">🧪 <b>نسخة تجريبية لـ${PLATFORM}</b> (الإصدار ${esc(APP_VERSION)}). ${TRIAL_NOTE}</div>`);
};

// آيفون في المتصفح: إرشاد لإضافته إلى الشاشة الرئيسية ليعمل كتطبيق
function installHint() {
  if (!IS_IOS || IS_STANDALONE) return;
  try { if (localStorage.getItem("hintClosed") === "1") return; } catch (e) { /* تجاهل */ }
  const h = document.createElement("div");
  h.className = "install-hint";
  h.innerHTML = `<button aria-label="إغلاق">✕</button><b>ثبّته على الشاشة الرئيسية</b><br>
    اضغط زر المشاركة <span style="font-size:1.2em">⎋</span> في أسفل Safari، ثم «إضافة إلى الشاشة الرئيسية»، فيعمل كتطبيق ودون إنترنت.`;
  h.querySelector("button").onclick = () => { h.remove(); try { localStorage.setItem("hintClosed", "1"); } catch (e) { /* تجاهل */ } };
  document.body.appendChild(h);
}

// شريط التبويبات السفلي (على نسق «الأربعينية الحسينية»): أربعة أقسام رئيسية و«المزيد» لبقية الأقسام
const BNAV_MAIN = ["now", "today", "daily", "quran"];
const BNAV_SHORT = { today: "اليوم", daily: "اليومية" };
const tabParts = (b) => { const ic = b.querySelector("i")?.textContent || ""; return { ic, tx: b.textContent.replace(ic, "").trim() }; };
function goTab(t) { $("#search").value = ""; setTab(t); window.scrollTo(0, 0); }
function buildBottomNav() {
  if ($("#bnav")) return;
  const nav = document.createElement("nav");
  nav.id = "bnav"; nav.className = "bnav";
  nav.innerHTML = BNAV_MAIN.map((t) => {
    const p = tabParts(document.querySelector(`#tabs button[data-tab="${t}"]`));
    return `<button type="button" data-bt="${t}"><i>${p.ic}</i>${BNAV_SHORT[t] || p.tx}</button>`;
  }).join("") + `<button type="button" data-bt="more"><i>☰</i>المزيد</button>`;
  nav.onclick = (e) => {
    const b = e.target.closest("[data-bt]");
    if (!b) return;
    if (b.dataset.bt === "more") openMore(); else goTab(b.dataset.bt);
  };
  document.body.appendChild(nav);
  syncBnav();
}
function openMore() {
  let d = $("#moreSheet");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "moreSheet";
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest(".sheet-close")) { d.close(); return; }
      const b = e.target.closest("[data-mt]");
      if (b) { d.close(); goTab(b.dataset.mt); }
    });
    document.body.appendChild(d);
  }
  const items = [...document.querySelectorAll("#tabs button")].filter((b) => !BNAV_MAIN.includes(b.dataset.tab) && !b.hidden);
  d.innerHTML = `<div class="sheet-head"><b>المزيد</b><button type="button" class="icon-btn sheet-close" aria-label="إغلاق">✕</button></div>
    <div class="more-grid">${items.map((b) => { const p = tabParts(b); return `<button type="button" data-mt="${b.dataset.tab}" class="${state.tab === b.dataset.tab ? "on" : ""}"><i>${p.ic}</i><span>${esc(p.tx)}</span></button>`; }).join("")}</div>`;
  d.showModal();
}
function syncBnav() {
  const nav = $("#bnav");
  if (!nav) return;
  nav.querySelectorAll("[data-bt]").forEach((b) => b.classList.toggle("active", b.dataset.bt === state.tab || (b.dataset.bt === "more" && !BNAV_MAIN.includes(state.tab))));
}
const _setTabMobile = setTab;
setTab = function (t) { _setTabMobile(t); syncBnav(); };

function initMobile() {
  // العمل دون إنترنت (تطبيق الويب): عامل الخدمة يحفظ الملفات في ذاكرة الجهاز
  if (!IS_ANDROID_APP && !IS_IOS_APP && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* يعمل بدونه */ });
  }
  addTrialBadge();
  buildBottomNav();
  let seen = false;
  try { seen = localStorage.getItem("trialSeen") === "1"; localStorage.setItem("trialSeen", "1"); } catch (e) { /* تجاهل */ }
  if (!seen) setTimeout(showTrial, 600); else installHint();
  // قد يكتمل تحميل الصفحة قبل وصول المحتوى: ننتظره ثم نعيد رسم التبويب لإظهار ملاحظة «تجريبي»
  let tries = 0;
  const redraw = () => {
    if (!DATA) { if (++tries < 150) setTimeout(redraw, 100); return; }
    try { if (state.tab === "now" || state.tab === "settings") renderTab(); } catch (e) { /* تجاهل */ }
  };
  redraw();
}
if (document.readyState === "complete") initMobile(); else window.addEventListener("load", initMobile);
