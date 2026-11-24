/* «الغياث» — الإضافات: التبويبات، القرآن الكريم، الأدوات (المسبحة والقبلة الحية ومحوّل التاريخ)،
   التذكير بالمناسبات، وضع كبار السن، وجدولة تنبيهات الجوال. يُحمَّل بعد app.js */
"use strict";

/** العدد مع تمييزه بالعربية: ٣–١٠ جمع، وما فوقها مفرد منصوب */
function nCount(n, one, few, many) { return n === 1 ? one : n === 2 ? `${few.split("|")[1] || one}` : `${ar(n)} ${n >= 3 && n <= 10 ? few.split("|")[0] : many}`; }
const minutesAr = (n) => nCount(n, "دقيقة", "دقائق|دقيقتان", "دقيقة");

/* ====================== التبويبات: التنبيه إلى وجود المزيد ====================== */
// في الشاشات الضيقة تُسحب التبويبات أفقيًا: يظهر سهم وتظليل على الجهة التي فيها تبويبات مخفية،
// ويتحرك الشريط حركة خفيفة أول مرة ليلفت النظر، ويبقى التبويب المختار ظاهرًا دائمًا.
function initTabsNav() {
  const nav = $("#tabs"), wrap = $("#tabsWrap");
  if (!nav || !wrap) return;
  const update = () => {
    const max = nav.scrollWidth - nav.clientWidth;
    const over = max > 4;
    const pos = Math.abs(nav.scrollLeft); // في RTL يبدأ من الصفر يمينًا ويزيد سالبًا نحو اليسار
    wrap.classList.toggle("over", over);
    wrap.classList.toggle("more-start", over && pos > 4);
    wrap.classList.toggle("more-end", over && pos < max - 4);
  };
  nav.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  $("#tabsStart").onclick = () => nav.scrollBy({ left: nav.clientWidth * 0.7, behavior: "smooth" });
  $("#tabsEnd").onclick = () => nav.scrollBy({ left: -nav.clientWidth * 0.7, behavior: "smooth" });
  update();
  setTimeout(() => {
    update();
    let seen = false;
    try { seen = localStorage.getItem("tabsHint") === "1"; } catch (e) { /* تجاهل */ }
    if (wrap.classList.contains("over") && !seen) {
      nav.scrollBy({ left: -90, behavior: "smooth" });
      setTimeout(() => nav.scrollBy({ left: 90, behavior: "smooth" }), 900);
      try { localStorage.setItem("tabsHint", "1"); } catch (e) { /* تجاهل */ }
    }
  }, 1200);
}
const _setTab = setTab;
setTab = function (t) {
  _setTab(t);
  const b = document.querySelector(`#tabs button[data-tab="${t}"]`);
  if (b) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
};

/* ====================== القرآن الكريم ====================== */
let QURAN = null, QINDEX = null;
async function loadQuran() {
  if (QURAN) return QURAN;
  QURAN = await (await fetch("quran.json")).json();
  // فهرس: أول آية في كل صفحة وكل جزء
  const page = {}, juz = {};
  QURAN.s.forEach((s, si) => s.a.forEach((_, ai) => {
    const p = s.p[ai], j = s.j[ai];
    if (!page[p]) page[p] = { s: si + 1, a: ai + 1 };
    if (!juz[j]) juz[j] = { s: si + 1, a: ai + 1 };
  }));
  QINDEX = { page, juz };
  return QURAN;
}
/** يُكمل الحقول الناقصة في الكائن نفسه (لا يُنشئ نسخة جديدة كي لا تضيع التعديلات) */
function withDefaults(obj, defs) {
  for (const [k, v] of Object.entries(defs)) if (obj[k] === undefined) obj[k] = typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
  return obj;
}
const qs = () => {
  const s = store.settings;
  s.quran = withDefaults(s.quran || {}, { last: null, wird: { pages: 2, next: 1, rounds: 0, doneOn: "" }, khatma: null, gifts: [] });
  return s.quran;
};
const surahName = (n) => (QURAN ? QURAN.s[n - 1].n : "");
const pageStart = (p) => QINDEX.page[Math.min(604, Math.max(1, p))];

function renderQuran() {
  const sec = $("#tab-quran");
  if (!QURAN) {
    sec.innerHTML = `<p class="search-info">جارٍ تحميل المصحف…</p>`;
    loadQuran().then(renderQuran).catch(() => (sec.innerHTML = `<p class="empty-note">تعذّر تحميل المصحف.</p>`));
    return;
  }
  const q = qs(), d = today(), dk = dateKey(d);
  let html = "";
  // متابعة القراءة
  if (q.last) {
    html += `<button class="guide-card q-continue" data-qopen="${q.last.s}:${q.last.a}"><span>📖</span><div><b>تابع القراءة</b>
      <small>سورة ${esc(surahName(q.last.s))} — الآية ${ar(q.last.a)} · الصفحة ${ar(QURAN.s[q.last.s - 1].p[q.last.a - 1])}</small></div><span>←</span></button>`;
  }
  // الورد اليومي
  const w = q.wird, from = w.next, to = Math.min(604, from + w.pages - 1), doneToday = w.doneOn === dk;
  html += `<div class="group"><div class="group-head"><span class="ico">📗</span><h3>وردي من القرآن</h3>
      <span class="count">${w.rounds ? `ختمت ${ar(w.rounds)} مرة · ` : ""}الصفحة ${ar(w.next)} من ٦٠٤</span></div>
    <div class="q-row"><span>صفحات كل يوم:</span>${seg("qWird", [[1, "١"], [2, "٢"], [4, "٤"], [5, "٥"], [10, "١٠"], [20, "٢٠ (جزء)"]], w.pages)}</div>
    <div class="q-row"><b>${doneToday ? "✓ قرأت ورد اليوم" : `ورد اليوم: الصفحات ${ar(from)}–${ar(to)}`}</b>
      <span class="sp"></span><button class="read-btn" data-qpage="${doneToday ? Math.max(1, from - w.pages) : from}">اقرأ</button>
      ${doneToday ? "" : `<button class="primary-btn" id="qWirdDone">✓ قرأته</button>`}</div>
    <div class="progress-in"><div class="bar"><i style="width:${Math.round(((w.next - 1) / 604) * 100)}%"></i></div></div></div>`;
  // الختمة
  html += khatmaHTML(q, d);
  // سجل الإهداء
  html += giftsHTML(q);
  // الفهرس
  html += `<div class="section-title">السور</div><input id="qFind" class="q-find" type="search" placeholder="ابحث عن سورة بالاسم أو الرقم…">
    <div class="q-grid" id="qGrid">${QURAN.s.map((s, i) => `<button class="q-surah" data-qopen="${i + 1}:1" data-qname="${esc(stripDiac(s.n))} ${i + 1}">
      <span class="q-num">${ar(i + 1)}</span><b>${esc(s.n)}</b><small>${s.t} · ${ar(s.a.length)} آية</small></button>`).join("")}</div>
    <div class="section-title">الأجزاء</div><div class="q-juz">${Array.from({ length: 30 }, (_, i) => `<button class="fchip" data-qjuz="${i + 1}">${ar(i + 1)}</button>`).join("")}</div>
    <p class="note">${esc(QURAN.src)}</p>`;
  sec.innerHTML = html;

  sec.querySelectorAll('[data-seg="qWird"] button').forEach((b) => (b.onclick = () => { qs().wird.pages = +b.dataset.v; saveSettings(); renderQuran(); }));
  const wd = $("#qWirdDone", sec);
  if (wd) wd.onclick = () => {
    const w2 = qs().wird;
    w2.next = to + 1; w2.doneOn = dk;
    if (w2.next > 604) { w2.next = 1; w2.rounds = (w2.rounds || 0) + 1; toast("بارك الله لك، أتممت ختمة القرآن"); offerGift("ختمة القرآن الكريم"); }
    else toast("تقبّل الله");
    if (!store.isDone(d, "q_wird")) store.toggle(d, "q_wird");
    saveSettings(); renderQuran();
  };
  bindKhatma(sec, d);
  bindGifts(sec);
  $("#qFind", sec).oninput = (e) => {
    const v = unify(stripDiac(e.target.value.trim()));
    sec.querySelectorAll(".q-surah").forEach((b) => (b.hidden = !!v && !unify(b.dataset.qname).includes(v)));
  };
}

/* ---------- الختمة (حصة يومية مقسومة على الصفحات) ---------- */
function khatmaHTML(q, d) {
  const k = q.khatma;
  if (!k) {
    return `<div class="group"><div class="group-head"><span class="ico">🕋</span><h3>ختمة القرآن</h3></div>
      <p class="empty-note" style="padding-bottom:6px">اختر مدة الختمة، ويقسّم البرنامج الصفحات على الأيام ويذكّرك بحصة كل يوم.</p>
      <div class="q-row"><button class="read-btn" data-kstart="30">٣٠ يومًا (جزء يوميًا)</button><button class="read-btn" data-kstart="ramadan">ختمة شهر رمضان</button>
      <button class="read-btn" data-kstart="15">١٥ يومًا</button><button class="read-btn" data-kstart="7">٧ أيام</button><button class="read-btn" data-kstart="custom">مدة أخرى</button></div></div>`;
  }
  const day = Math.min(k.days, Math.max(1, daysBetween(d, new Date(k.start + "T12:00")) + 1));
  const a = Math.floor(((day - 1) * 604) / k.days) + 1, b = Math.floor((day * 604) / k.days);
  const done = (k.done || []).length, todayDone = (k.done || []).includes(day);
  return `<div class="group"><div class="group-head"><span class="ico">🕋</span><h3>${esc(k.title || "ختمة القرآن")}</h3><span class="count">${ar(done)}/${ar(k.days)} يومًا</span></div>
    <div class="q-row"><b>${todayDone ? "✓ أتممت حصة اليوم" : `حصة اليوم (${ar(day)} من ${ar(k.days)}): الصفحات ${ar(a)}–${ar(b)}`}</b><span class="sp"></span>
      <button class="read-btn" data-qpage="${a}">اقرأ</button>${todayDone ? "" : `<button class="primary-btn" id="kDone" data-day="${day}">✓ أتممتها</button>`}</div>
    <div class="progress-in"><div class="bar"><i style="width:${Math.round((done / k.days) * 100)}%"></i></div></div>
    <div class="q-row"><small class="muted">بدأت في ${gregText(new Date(k.start + "T12:00"))}${k.forWhom ? ` · مهداة إلى روح ${esc(k.forWhom)}` : ""}</small><span class="sp"></span>
      <button class="link-btn" id="kFor">إهداؤها إلى…</button><button class="link-btn" id="kEnd">إنهاء الختمة</button></div></div>`;
}
function bindKhatma(sec, d) {
  const q = qs();
  sec.querySelectorAll("[data-kstart]").forEach((b) => (b.onclick = () => {
    let days = +b.dataset.kstart, start = dateKey(d), title = "ختمة القرآن";
    if (b.dataset.kstart === "ramadan") {
      // من أول شهر رمضان القادم (أو الحالي)، جزء كل ليلة
      const h = hijri(d);
      const y = h.m <= 9 ? h.y : h.y + 1;
      const s = hijriToGreg(y, 9, 1) || d;
      start = dateKey(h.m === 9 ? addDays(d, -(h.d - 1)) : s); days = 30; title = `ختمة شهر رمضان ${ar(y)}هـ`;
    } else if (b.dataset.kstart === "custom") {
      days = parseInt(prompt("عدد أيام الختمة:", "40"), 10);
      if (!(days >= 1 && days <= 365)) return;
    }
    q.khatma = { start, days, title, done: [] };
    saveSettings(); renderQuran(); toast("بدأت الختمة، وفقك الله");
  }));
  const kd = $("#kDone", sec);
  if (kd) kd.onclick = () => {
    const k = q.khatma; k.done = [...new Set([...(k.done || []), +kd.dataset.day])];
    if (k.done.length >= k.days) {
      toast("تقبّل الله، أتممت الختمة");
      offerGift(k.title || "ختمة القرآن الكريم", k.forWhom || "");
      q.khatma = null;
    } else toast("تقبّل الله");
    saveSettings(); renderQuran();
  };
  const kf = $("#kFor", sec);
  if (kf) kf.onclick = () => { const n = prompt("اسم من تُهدى إليه الختمة (روح فلان):", q.khatma.forWhom || ""); if (n !== null) { q.khatma.forWhom = n.trim(); saveSettings(); renderQuran(); } };
  const ke = $("#kEnd", sec);
  if (ke) ke.onclick = () => { if (confirm("إنهاء الختمة الحالية؟")) { q.khatma = null; saveSettings(); renderQuran(); } };
}

/* ---------- سجل الإهداء مع المشاركة ---------- */
function giftsHTML(q) {
  const list = (q.gifts || []).slice().reverse();
  return `<details class="group fold" data-key="grp:gifts" ${openSet.has("grp:gifts") ? "open" : ""}><summary class="group-head"><span class="ico">🕯️</span><h3>سجل الإهداء</h3>
      <span class="count">${ar(list.length)}</span><span class="chev">▾</span></summary>
    <p class="empty-note" style="padding-bottom:4px">سجّل ما قرأته وأهديت ثوابه لروح أحبتك، وشارك الإهداء ليقرؤوا معك الفاتحة.</p>
    <div class="q-row gift-form"><input id="gWhat" class="upd-url" placeholder="ما قرأته: سورة يس، الفاتحة، جزء…"><input id="gTo" class="upd-url" placeholder="إلى روح: اسم المتوفى"><button class="primary-btn" id="gAdd">＋ أضف</button></div>
    ${list.map((g) => `<div class="item"><div class="item-main"><div class="item-title">${esc(g.what)} — إلى روح ${esc(g.to)}</div>
      <div class="item-src">${gregText(new Date(g.date + "T12:00"))}</div></div>
      <button class="read-btn" data-gshare="${g.id}">مشاركة</button><button class="read-btn" data-gdel="${g.id}">حذف</button></div>`).join("")}</details>`;
}
function bindGifts(sec) {
  const q = qs();
  $("#gAdd", sec).onclick = () => {
    const what = $("#gWhat", sec).value.trim(), to = $("#gTo", sec).value.trim();
    if (!what || !to) return toast("اكتب ما قرأته واسم المتوفى");
    addGift(what, to, true);
  };
  sec.querySelectorAll("[data-gshare]").forEach((b) => (b.onclick = () => { const g = q.gifts.find((x) => x.id === b.dataset.gshare); if (g) shareText(giftText(g)); }));
  sec.querySelectorAll("[data-gdel]").forEach((b) => (b.onclick = () => { q.gifts = q.gifts.filter((x) => x.id !== b.dataset.gdel); saveSettings(); renderQuran(); }));
  bindDetails(sec);
}
function addGift(what, to, share) {
  const q = qs();
  const g = { id: "g" + Date.now().toString(36), what: what.slice(0, 120), to: to.slice(0, 80), date: dateKey(today()) };
  q.gifts = [...(q.gifts || []), g];
  openSet.add("grp:gifts");
  saveSettings();
  if (state.tab === "quran") renderQuran();
  toast("سُجّل الإهداء، تقبّل الله");
  if (share) shareText(giftText(g));
}
function offerGift(what, to = "") {
  const name = prompt(`أهدِ ثواب «${what}» إلى روح (اكتب الاسم، أو اترك الخانة فارغة):`, to);
  if (name && name.trim()) addGift(what, name.trim(), true);
}
const giftText = (g) => `قرأتُ ${g.what} وأهديتُ ثوابها إلى روح ${g.to}، رحمه الله.\nنرجو قراءة سورة الفاتحة لروحه، مع الصلاة على محمد وآل محمد.\n— من تطبيق «الغياث»`;
/** المشاركة: في تطبيق أندرويد/آيفون عبر نافذة المشاركة في الهاتف، وإلا Web Share، وإلا النسخ */
async function shareText(text) {
  try {
    if (window.AndroidBridge && AndroidBridge.share) { AndroidBridge.share(text); return; }
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share) { window.webkit.messageHandlers.share.postMessage(text); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); toast("نُسخ نص الإهداء، الصقه في واتساب أو غيره"); }
  catch (e) { prompt("انسخ النص:", text); }
}

/* ---------- قارئ المصحف (في نافذة النص نفسها بأدوات القراءة) ---------- */
async function openQuran(s, a = 1) {
  await loadQuran();
  s = Math.min(114, Math.max(1, s));
  const su = QURAN.s[s - 1];
  $("#dlgTitle").textContent = `سورة ${su.n}`;
  for (const id of ["#dlgStar", "#dlgCounter", "#tasbih", "#dlgToc", "#dlgReport"]) $(id).hidden = true;
  $("#dlgListen").hidden = $("#dlgCopy").hidden = $("#dlgImage").hidden = $("#dlgPrint").hidden = false;
  const body = $("#dlgBody");
  body.className = "dlg-body quran";
  const head = s !== 1 && s !== 9 ? `<div class="q-basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>` : "";
  body.innerHTML = `<div class="q-head">${su.t} · ${ar(su.a.length)} آية · الجزء ${ar(su.j[0])} · الصفحة ${ar(su.p[0])}</div>${head}
    <div class="q-text">${su.a.map((t, i) => `<span class="qa" data-a="${i + 1}">${esc(t)}${su.sj.includes(i + 1) ? " ۩" : ""} <span class="qn">﴿${ar(i + 1)}﴾</span></span> `).join("")}</div>
    <div class="q-nav"><button type="button" class="read-btn" data-qnav="${s - 1}" ${s === 1 ? "disabled" : ""}>→ السورة السابقة</button>
      <button type="button" class="primary-btn ghost" id="qGift">🕯️ أهدِ ثواب قراءتها</button>
      <button type="button" class="read-btn" data-qnav="${s + 1}" ${s === 114 ? "disabled" : ""}>السورة التالية ←</button></div>`;
  dlgState = { title: `سورة ${su.n}`, text: su.a.map((t, i) => `${t} ﴿${ar(i + 1)}﴾`).join(" "), src: QURAN.src, itemId: null };
  $("#dlgSrc").textContent = QURAN.src;
  if (!$("#textDialog").open) $("#textDialog").showModal();
  body.querySelectorAll("[data-qnav]").forEach((b) => (b.onclick = () => openQuran(+b.dataset.qnav, 1)));
  $("#qGift", body).onclick = () => offerGift(`سورة ${su.n}`);
  const target = body.querySelector(`.qa[data-a="${a}"]`);
  body.scrollTop = 0;
  if (target && a > 1) { body.scrollTop = target.offsetTop - body.offsetTop - 40; target.classList.add("hl"); setTimeout(() => target.classList.remove("hl"), 2500); }
  // حفظ موضع القراءة: أول آية ظاهرة
  let tmr;
  const save = () => {
    const top = body.scrollTop + 60;
    let cur = 1;
    for (const el of body.querySelectorAll(".qa")) { if (el.offsetTop - body.offsetTop > top) break; cur = +el.dataset.a; }
    qs().last = { s, a: cur }; saveSettings();
  };
  body.onscroll = () => { clearTimeout(tmr); tmr = setTimeout(save, 700); };
  save();
}
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-qopen]");
  if (o) { const [s, a] = o.dataset.qopen.split(":").map(Number); openQuran(s, a); return; }
  const p = e.target.closest("[data-qpage]");
  if (p) { loadQuran().then(() => { const st = pageStart(+p.dataset.qpage); openQuran(st.s, st.a); }); return; }
  const j = e.target.closest("[data-qjuz]");
  if (j) { loadQuran().then(() => { const st = QINDEX.juz[+j.dataset.qjuz]; openQuran(st.s, st.a); }); }
});

/* ====================== الأدوات ====================== */
function renderTools() {
  const sec = $("#tab-tools");
  const fold = (key, icon, title, inner) => `<details class="group fold" data-key="${key}" ${openSet.has(key) || (key === "grp:tasbih" && !openSet.size) ? "open" : ""}>
    <summary class="group-head"><span class="ico">${icon}</span><h3>${title}</h3><span class="chev">▾</span></summary>${inner}</details>`;
  sec.innerHTML = fold("grp:tasbih", "📿", "المسبحة", tasbihHTML()) + fold("grp:qibla", "🕋", "القبلة بالبوصلة", qiblaLiveHTML())
    + fold("grp:conv", "📅", "محوّل التاريخ وحاسبة المدة", convHTML());
  bindDetails(sec);
  bindTasbih(sec); bindQiblaLive(sec); bindConv(sec);
}

/* ---------- المسبحة ---------- */
const DEFAULT_AWRAD = [
  { id: "z", name: "تسبيح الزهراء عليها السلام", target: 100 },
  { id: "istighfar", name: "أستغفر الله ربي وأتوب إليه", target: 100 },
  { id: "salawat", name: "اللهم صلّ على محمد وآل محمد", target: 100 },
  { id: "tahlil", name: "لا إله إلا الله", target: 100 },
  { id: "hawqala", name: "لا حول ولا قوة إلا بالله العلي العظيم", target: 100 },
  { id: "subhan", name: "سبحان الله وبحمده", target: 100 },
];
const ts = () => {
  const s = store.settings;
  s.tasbih = withDefaults(s.tasbih || {}, { awrad: DEFAULT_AWRAD, cur: "z", count: 0, log: {} });
  return s.tasbih;
};
function zahraLabel(n) { return n < 34 ? "الله أكبر" : n < 67 ? "الحمد لله" : "سبحان الله"; }
function tasbihHTML() {
  const t = ts(), w = t.awrad.find((x) => x.id === t.cur) || t.awrad[0];
  const todayLog = t.log[dateKey(today())] || {};
  const week = Array.from({ length: 7 }, (_, i) => { const dk = dateKey(addDays(today(), i - 6)); return Object.values(t.log[dk] || {}).reduce((a, b) => a + b, 0); });
  const mx = Math.max(1, ...week);
  return `<div class="tb-tool">
    <div class="search-filters">${t.awrad.map((x) => `<button class="fchip ${x.id === w.id ? "on" : ""}" data-wsel="${x.id}">${esc(x.name.slice(0, 26))}</button>`).join("")}
      <button class="fchip" id="wAdd">＋ ورد</button></div>
    <div class="tb-big"><button type="button" class="tb-btn big" id="tbTap2"><b>${ar(t.count)}</b><small>من ${ar(w.target)}</small></button>
      <div class="tb-side"><div class="tb-label">${w.id === "z" ? zahraLabel(t.count % 100) : esc(w.name)}</div>
        <small class="muted">اليوم: ${ar(todayLog[w.id] || 0)} مرة</small>
        <div style="display:flex;gap:6px"><button class="read-btn" id="tbZero">↺ من جديد</button>${DEFAULT_AWRAD.some((d) => d.id === w.id) ? "" : `<button class="read-btn" id="wDel">حذف الورد</button>`}</div></div></div>
    <div class="tb-week">${week.map((v, i) => `<div class="col" title="${ar(v)}"><i style="height:${Math.max(3, (v / mx) * 100)}%"></i><span>${WEEKDAYS[addDays(today(), i - 6).getDay()].slice(0, 2)}</span></div>`).join("")}</div>
    <p class="note" style="padding:0 18px 10px">اضغط الدائرة أو مفتاح المسافة للعدّ. مجموع الأسبوع: ${ar(week.reduce((a, b) => a + b, 0))}.</p></div>`;
}
function bindTasbih(sec) {
  const t = ts();
  sec.querySelectorAll("[data-wsel]").forEach((b) => (b.onclick = () => { t.cur = b.dataset.wsel; t.count = 0; saveSettings(); renderTools(); }));
  $("#wAdd", sec).onclick = () => {
    const name = prompt("نص الذكر:"); if (!name || !name.trim()) return;
    const target = parseInt(prompt("العدد المطلوب:", "100"), 10) || 100;
    const id = "w" + Date.now().toString(36);
    t.awrad = [...t.awrad, { id, name: name.trim().slice(0, 80), target }]; t.cur = id; t.count = 0; saveSettings(); renderTools();
  };
  const del = $("#wDel", sec);
  if (del) del.onclick = () => { t.awrad = t.awrad.filter((x) => x.id !== t.cur); t.cur = "z"; t.count = 0; saveSettings(); renderTools(); };
  $("#tbZero", sec).onclick = () => { t.count = 0; saveSettings(); renderTools(); };
  const tap = () => {
    const w = t.awrad.find((x) => x.id === t.cur) || t.awrad[0];
    t.count++;
    const dk = dateKey(today());
    t.log[dk] = { ...(t.log[dk] || {}), [w.id]: ((t.log[dk] || {})[w.id] || 0) + 1 };
    // الاحتفاظ بسجل ٦٠ يومًا فقط
    const keys = Object.keys(t.log).sort(); if (keys.length > 60) delete t.log[keys[0]];
    if (w.id === "z" && (t.count === 34 || t.count === 67)) { beep(660); navigator.vibrate?.(120); }
    if (t.count % w.target === 0) { beep(880); setTimeout(() => beep(1175), 160); navigator.vibrate?.(250); toast(`أتممت ${ar(w.target)} — تقبّل الله`); }
    saveSettings();
    const b = $("#tbTap2"); if (b) { b.querySelector("b").textContent = ar(t.count); b.classList.toggle("full", t.count >= w.target); }
    const lb = sec.querySelector(".tb-label"); if (lb && w.id === "z") lb.textContent = zahraLabel(t.count % 100);
  };
  $("#tbTap2", sec).onclick = tap;
  sec.onkeydown = (e) => { if (e.key === " " && !e.target.matches("input,textarea,select")) { e.preventDefault(); tap(); } };
}
document.addEventListener("keydown", (e) => {
  if (state.tab === "tools" && e.key === " " && !e.target.matches("input,textarea,select,button") && !document.querySelector("dialog[open]")) { e.preventDefault(); $("#tbTap2")?.click(); }
});

/* ---------- القبلة الحية (بوصلة الهاتف) ---------- */
function qiblaLiveHTML() {
  const c = store.settings.city;
  if (!c) return `<p class="empty-note">اختر مدينتك أولًا من الإعدادات.</p>`;
  const { bearing } = qiblaOf(c);
  return `<div class="ql">
    <div class="ql-dial" id="qlDial"><div class="ql-rose" id="qlRose"><span class="n">ش</span><span class="e">ق</span><span class="s">ج</span><span class="w">غ</span></div>
      <div class="ql-arrow" id="qlArrow" style="transform:rotate(${bearing}deg)">🕋<i></i></div></div>
    <div class="ql-info"><b id="qlMsg">القبلة: ${ar(Math.round(bearing))}° من الشمال</b>
      <small id="qlSub">على الهاتف: اضغط «تشغيل البوصلة» وأمسك الهاتف أفقيًا، فيتجه السهم إلى القبلة.</small>
      <button class="primary-btn" id="qlStart">🧭 تشغيل البوصلة</button></div></div>`;
}
let qlHandler = null;
function bindQiblaLive(sec) {
  const btn = $("#qlStart", sec);
  if (!btn) return;
  const { bearing } = qiblaOf(store.settings.city);
  let gotData = false, aligned = false;
  const onOri = (e) => {
    let heading = null;
    if (typeof e.webkitCompassHeading === "number") heading = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === "number") heading = (360 - e.alpha) % 360;
    if (heading === null) return;
    gotData = true;
    const rose = $("#qlRose"), arrow = $("#qlArrow"); if (!rose) return;
    rose.style.transform = `rotate(${-heading}deg)`;
    const rel = ((bearing - heading) % 360 + 360) % 360;
    arrow.style.transform = `rotate(${rel}deg)`;
    const off = Math.min(rel, 360 - rel);
    const ok = off < 5;
    $("#qlDial").classList.toggle("ok", ok);
    $("#qlMsg").textContent = ok ? "✓ أنت متجه إلى القبلة" : `أدِر الهاتف ${rel < 180 ? "يمينًا" : "يسارًا"} ${ar(Math.round(off))}°`;
    if (ok && !aligned) navigator.vibrate?.(150);
    aligned = ok;
  };
  btn.onclick = async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== "granted") return toast("لم يُسمح باستعمال البوصلة");
      }
    } catch (e) { /* تجاهل */ }
    if (qlHandler) { window.removeEventListener("deviceorientationabsolute", qlHandler); window.removeEventListener("deviceorientation", qlHandler); }
    qlHandler = onOri;
    window.addEventListener("deviceorientationabsolute", onOri);
    window.addEventListener("deviceorientation", onOri);
    btn.textContent = "البوصلة تعمل…";
    setTimeout(() => { if (!gotData && $("#qlSub")) $("#qlSub").textContent = "لا توجد بوصلة في هذا الجهاز (الحاسوب عادةً). استعمل الزاوية المكتوبة مع بوصلة أو خريطة الهاتف."; }, 3000);
  };
}

/* ---------- محوّل التاريخ وحاسبة المدة ---------- */
function convHTML() {
  const t = dateKey(today()), h = hijri(today());
  const months = Object.entries(DATA.months).map(([k, v]) => `<option value="${k}" ${+k === h.m ? "selected" : ""}>${esc(v.name)}</option>`).join("");
  return `<div class="conv">
    <div class="conv-row"><b>من الميلادي إلى الهجري</b><input type="date" id="cvG" value="${t}"><div class="conv-out" id="cvGOut"></div></div>
    <div class="conv-row"><b>من الهجري إلى الميلادي</b><div class="conv-in"><input type="number" id="cvHd" min="1" max="30" value="${h.d}"><select id="cvHm">${months}</select><input type="number" id="cvHy" min="1" max="1600" value="${h.y}"></div><div class="conv-out" id="cvHOut"></div></div>
    <div class="conv-row"><b>المدة بين تاريخين (أو العمر)</b><div class="conv-in"><input type="date" id="cvA"><span>إلى</span><input type="date" id="cvB" value="${t}"></div><div class="conv-out" id="cvDOut"></div></div>
    <p class="note" style="padding:0 18px 10px">التحويل بتقويم أم القرى مع تعديلات ثبوت الهلال التي حددتها.</p></div>`;
}
/** يحوّل تاريخًا هجريًا إلى ميلادي (يراعي تعديلات الهلال) */
function hijriToGreg(y, m, d) {
  const approx = new Date(Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + d) * 864e5);
  const start = monthStart(y, m, atNoon(approx));
  const g = addDays(start, d - 1);
  const back = hijri(g);
  return back.y === y && back.m === m && back.d === d ? g : null;
}
function diffYMD(a, b) {
  if (a > b) [a, b] = [b, a];
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d, total: Math.abs(daysBetween(b, a)) };
}
function bindConv(sec) {
  const g = $("#cvG", sec);
  if (!g) return;
  const showG = () => { const v = g.value; if (!v) return; const dt = new Date(v + "T12:00"); $("#cvGOut", sec).textContent = `${WEEKDAYS[dt.getDay()]} ${hijriText(hijri(dt))}`; };
  const showH = () => {
    const r = hijriToGreg(+$("#cvHy", sec).value, +$("#cvHm", sec).value, +$("#cvHd", sec).value);
    $("#cvHOut", sec).textContent = r ? `${WEEKDAYS[r.getDay()]} ${gregText(r)}` : "تاريخ غير صحيح (قد يكون الشهر ٢٩ يومًا)";
  };
  const showD = () => {
    const a = $("#cvA", sec).value, b = $("#cvB", sec).value;
    if (!a || !b) { $("#cvDOut", sec).textContent = "اختر التاريخين (للعمر: تاريخ الميلاد ثم اليوم)"; return; }
    const A = new Date(a + "T12:00"), B = new Date(b + "T12:00"), r = diffYMD(A, B);
    const ha = hijri(A), hb = hijri(B);
    let hy = hb.y - ha.y; if (hb.m < ha.m || (hb.m === ha.m && hb.d < ha.d)) hy--;
    $("#cvDOut", sec).textContent = `${nCount(r.y, "سنة", "سنوات|سنتان", "سنة")} و${nCount(r.m, "شهر", "أشهر|شهران", "شهرًا")} و${nCount(r.d, "يوم", "أيام|يومان", "يومًا")} (${ar(r.total)} يومًا) · بالهجري: ${nCount(Math.max(0, hy), "سنة", "سنوات|سنتان", "سنة")}`;
  };
  g.oninput = showG; ["#cvHd", "#cvHm", "#cvHy"].forEach((id) => ($(id, sec).oninput = showH)); ["#cvA", "#cvB"].forEach((id) => ($(id, sec).oninput = showD));
  showG(); showH(); showD();
}

/* ====================== التذكير بالمناسبات قبلها بيوم ====================== */
function tomorrowEvents() {
  return eventsFor(addDays(today(), 1)).filter((e) => e.kind !== "plain");
}
const _renderNowX = renderNow;
renderNow = function () {
  _renderNowX();
  if (store.settings.remindDayBefore === false) return;
  const evs = tomorrowEvents();
  if (!evs.length) return;
  const hero = $("#tab-now .now-hero");
  const html = `<div class="banner tomorrow"><span class="kdot ${evs[0].kind}"></span><div><small>تذكير — غدًا</small><b>${esc(evs.map((e) => e.title).join(" · "))}</b></div></div>`;
  if (hero) hero.insertAdjacentHTML("afterend", html); else $("#tab-now").insertAdjacentHTML("afterbegin", html);
};

/* ====================== تقويم الزهراء عليها السلام (بجانب التقويم الحالي) ====================== */
// المناسبات الكبرى التي ليست في تقويمنا تُضاف إلى مناسبات اليوم (مع ذكر المصدر)،
// وبقية الأحداث تظهر في بطاقة «في مثل هذا اليوم».
let ZCAL = null;
fetch("zahra.json").then((r) => r.json()).then((z) => { ZCAL = z; if (DATA) { renderTab(); } }).catch(() => { /* اختياري */ });
const zahraOn = () => ZCAL && store.settings.showZahra !== false;
const zahraDay = (d) => { if (!zahraOn()) return []; const h = hijri(d); return ZCAL.days[`${h.m}-${h.d}`] || []; };
const ZSTOP = new Set(["الامام", "الإمام", "السيدة", "السيد", "النبي", "نبي", "الله", "الرسول", "عليه", "عليها", "السلام", "بن", "بنت", "ابن", "في", "من", "الى", "إلى", "مولد", "ميلاد", "ولادة", "وفاة", "شهادة", "استشهاد", "الأعظم", "سيدنا", "مولانا"]);
const zTokens = (t) => unify(stripDiac(t)).replace(/\([^)]*\)|[0-9٠-٩]+|هـ/g, " ").split(/[\s،,./-]+/).filter((w) => w.length >= 3 && !ZSTOP.has(w));
/** هل الحدث مذكور أصلًا في مناسبات اليوم؟ (اسم مشترك مثل «الحسين» أو «الزهراء») */
function zCovered(t, list) {
  const real = list.filter((e) => e.kind !== "plain" && !e.zahra);
  let ours = unify(stripDiac(real.map((e) => e.title).join(" "))).replace(/\s+/g, "");
  // أسماء مترادفة للمعصومين عليهم السلام
  for (const [a, b] of [["المنتظر", "المهدي"], ["الحجه", "المهدي"], ["القايم", "المهدي"], ["السجاد", "العابدين"], ["اميرالمومنين", "علي"], ["المجتبي", "الحسن"], ["الجواد", "التقي"], ["الهادي", "النقي"], ["العسكري", "الحسنبنعلي"], ["الرسول", "النبي"]]) {
    if (ours.includes(b)) ours += a;
    if (ours.includes(a)) ours += b;
  }
  const toks = zTokens(t).map((w) => w.replace(/\s+/g, ""));
  // بلا اسم مميز (مثل «مولد الرسول (ص)»): يكفي أن في اليوم مناسبة من النوع نفسه
  if (!toks.length) {
    const birth = /^(مولد|ميلاد|ولادة)/.test(t);
    return real.some((e) => (birth ? /مولد|ميلاد|ولادة/ : /وفاة|شهادة|استشهاد/).test(e.title));
  }
  return toks.some((w) => ours.includes(w));
}
const _eventsFor = eventsFor;
eventsFor = function (d) {
  const list = _eventsFor(d);
  const zs = zahraDay(d).filter((z) => z.m);
  if (!zs.length) return list;
  // تقويم الزهراء قد يختلف عنا بيوم: نعدّ الحدث مذكورًا إن ورد في اليوم نفسه أو قبله أو بعده
  const near = [...list, ..._eventsFor(addDays(d, -1)), ..._eventsFor(addDays(d, 1))];
  for (const z of zs) {
    if (zCovered(z.t, near)) continue;
    const kind = /^(مولد|ميلاد|ولادة)/.test(z.t) ? "mawlid" : "wafat";
    list.push({ title: z.t, kind, items: [], night: [], zahra: true, note: "من تقويم الزهراء عليها السلام" });
  }
  return list;
};
function zahraCardHTML(d) {
  const all = zahraDay(d);
  if (!all.length) return "";
  return `<details class="group fold zahra-card" data-key="grp:zahra" ${openSet.has("grp:zahra") ? "open" : ""}><summary class="group-head"><span class="ico">📜</span>
    <h3>في مثل هذا اليوم <small>(من تقويم الزهراء عليها السلام)</small></h3><span class="count">${ar(all.length)}</span><span class="chev">▾</span></summary>
    <ul class="zahra-list">${all.map((z) => `<li class="${z.m ? "major" : ""}">${esc(z.t)}</li>`).join("")}</ul></details>`;
}
const _renderToday = renderToday;
renderToday = function () {
  _renderToday();
  const html = zahraCardHTML(state.date);
  if (!html) return;
  const sec = $("#tab-today"), pw = sec.querySelector(".progress-wrap");
  if (pw) pw.insertAdjacentHTML("afterend", html); else sec.insertAdjacentHTML("afterbegin", html);
  bindDetails(sec);
};
const _renderNowZ = renderNow;
renderNow = function () {
  _renderNowZ();
  const minor = zahraDay(today()).filter((z) => !z.m).slice(0, 2);
  if (!minor.length) return;
  const sec = $("#tab-now"), anchor = sec.querySelector(".now-hero") || sec.firstElementChild;
  const line = `<button class="zahra-line" data-goto="today" data-open="grp:zahra">📜 في مثل هذا اليوم: ${minor.map((z) => esc(z.t)).join(" · ")} <span>←</span></button>`;
  if (anchor) anchor.insertAdjacentHTML("afterend", line); else sec.insertAdjacentHTML("afterbegin", line);
};
const _renderMonth = renderMonth;
renderMonth = function () {
  _renderMonth();
  if (!zahraOn()) return;
  // تلميح على كل يوم بأحداثه في تقويم الزهراء
  $("#tab-month").querySelectorAll(".cell[data-date]").forEach((c) => {
    const z = zahraDay(new Date(c.dataset.date + "T12:00"));
    if (z.length) { c.title = "من تقويم الزهراء:\n" + z.map((x) => "• " + x.t).join("\n"); c.classList.add("has-zahra"); }
  });
};

/* ====================== وضع كبار السن ====================== */
const _applyLook = applyLook;
applyLook = function () {
  _applyLook();
  const sr = !!store.settings.senior;
  document.documentElement.classList.toggle("senior", sr);
  if (sr) document.documentElement.style.setProperty("--fs", Math.max(1.3, Number(store.settings.fontScale) || 1));
  // في وضع كبار السن تُخفى التبويبات الأقل استعمالًا
  document.querySelectorAll("#tabs button").forEach((b) => (b.hidden = sr && ["library", "stats", "month"].includes(b.dataset.tab)));
};

/* ====================== الإعدادات الإضافية ====================== */
const MOBILE_NOTIFY = () => !!((window.AndroidBridge && AndroidBridge.schedule) || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.notify));
const _renderSettingsX = renderSettings;
renderSettings = function () {
  _renderSettingsX();
  const s = store.settings, t = $("#tab-settings");
  const sw = (name, on) => `<label class="switch"><input type="checkbox" data-sw2="${name}" ${on ? "checked" : ""}><span></span></label>`;
  let html = `<div class="group"><div class="group-head"><span class="ico">🤝</span><h3>تسهيلات</h3></div>
    <div class="set-row"><div class="lbl"><b>وضع كبار السن</b><small>خط كبير، وأزرار أكبر، وإخفاء الإضافات والتبويبات الأقل استعمالًا</small></div>${sw("senior", s.senior)}</div>
    <div class="set-row"><div class="lbl"><b>التذكير بالمناسبات قبلها بيوم</b><small>في «الآن»، وفي تنبيه المساء</small></div>${sw("remindDayBefore", s.remindDayBefore !== false)}</div>
    <div class="set-row"><div class="lbl"><b>أحداث تقويم الزهراء عليها السلام</b><small>المناسبات الكبرى غير الموجودة في تقويمنا، وبطاقة «في مثل هذا اليوم»${ZCAL ? ` (${esc(ZCAL.years)})` : ""}</small></div>${sw("showZahra", s.showZahra !== false)}</div></div>`;
  if (MOBILE_NOTIFY()) {
    html += `<div class="group"><div class="group-head"><span class="ico">🔔</span><h3>تنبيهات الهاتف</h3></div>
      <div class="set-row"><div class="lbl"><b>تنبيه قبل الأذان</b><small>الفجر والظهر والمغرب مع أعمال الوقت (المدة من «أوقات الصلاة»)</small></div>${sw("prayerNotify", s.prayerNotify !== false)}</div>
      <div class="set-row"><div class="lbl"><b>تنبيه عند الأذان</b><small>بصوت تنبيه الهاتف</small></div>${sw("adhanSound", !!s.adhanSound)}</div>
      ${s.city ? "" : `<p class="note" style="padding:0 18px 12px">اختر مدينتك أولًا لتعمل التنبيهات.</p>`}
      <div class="set-row"><div class="lbl"><b>جدولة التنبيهات الآن</b><small>تُجدول لسبعة أيام، وتتجدد كلما فتحت التطبيق</small></div><button class="read-btn" id="mnNow">جدولة</button></div></div>`;
  } else if (document.documentElement.classList.contains("mobile")) {
    html += `<p class="note">تنبيهات الأذان على الآيفون تحتاج تطبيق الآيفون المثبّت (لا تعمل من الموقع)، وعلى أندرويد تعمل من تطبيق أندرويد.</p>`;
  }
  const first = t.querySelector(".group");
  if (first) first.insertAdjacentHTML("afterend", html); else t.insertAdjacentHTML("afterbegin", html);
  t.querySelectorAll("[data-sw2]").forEach((c) => (c.onchange = () => {
    s[c.dataset.sw2] = c.checked; saveSettings(); applyLook();
    if (c.dataset.sw2 === "prayerNotify" || c.dataset.sw2 === "adhanSound") scheduleMobile(true);
    renderSettings();
  }));
  const mn = $("#mnNow", t);
  if (mn) mn.onclick = () => scheduleMobile(true);
};

/* ====================== جدولة تنبيهات الجوال ====================== */
// تُحسب الأوقات هنا (نفس حساب الواجهة)، ويجدولها الهاتف تنبيهات محلية تعمل والتطبيق مغلق.
function buildSchedule(days = 7) {
  const s = store.settings, list = [];
  if (!s.city || !DATA) return list;
  const now = Date.now(), before = Number(s.prayerBefore ?? 10);
  const P = [["fajr", "الفجر", "fajr"], ["dhuhr", "الظهر", "zuhr"], ["maghrib", "المغرب", "evening"]];
  const acts = (gid) => { const g = DATA.daily.find((x) => x.id === gid); return g ? g.items.filter((it) => !isExtraId(it.id)).slice(0, 3).map((it) => "• " + stripDiac(it.title)).join("\n") : ""; };
  const [eh, em] = String(s.eveningTime || "18:30").split(":").map(Number);
  for (let i = 0; i < days; i++) {
    const d = addDays(today(), i), T = prayerTimes(d);
    if (!T) continue;
    for (const [k, name, gid] of P) {
      if (s.prayerNotify !== false && before > 0) list.push({ at: T[k].getTime() - before * 60e3, title: `بقي ${minutesAr(before)} على أذان ${name}`, body: `أذان ${name} ${hm(T[k])} — من أعمال هذا الوقت:\n${acts(gid)}`, ch: "prayer" });
      if (s.adhanSound || (s.prayerNotify !== false && before === 0)) list.push({ at: T[k].getTime(), title: `حان وقت صلاة ${name}`, body: `أذان ${name} ${hm(T[k])}`, ch: "adhan" });
    }
    if (s.remindDayBefore !== false) {
      const evs = eventsFor(addDays(d, 1)).filter((e) => e.kind !== "plain");
      const night = nightFor(d).titles;
      const lines = [...evs.map((e) => "غدًا: " + e.title), ...night.filter((t) => !evs.some((e) => e.title === t)).map((t) => "الليلة: " + t)];
      if (lines.length) { const at = new Date(d); at.setHours(eh || 18, em || 0, 0, 0); list.push({ at: at.getTime(), title: "تذكير بالمناسبة", body: lines.join("\n"), ch: "remind" }); }
    }
  }
  return list.filter((x) => x.at > now + 30e3).sort((a, b) => a.at - b.at).slice(0, 60);
}
let schedTimer;
function scheduleMobile(announce = false) {
  if (!MOBILE_NOTIFY()) return;
  clearTimeout(schedTimer);
  schedTimer = setTimeout(() => {
    const list = buildSchedule();
    const json = JSON.stringify(list);
    try {
      if (window.AndroidBridge && AndroidBridge.schedule) AndroidBridge.schedule(json);
      else window.webkit.messageHandlers.notify.postMessage(json);
      if (announce) toast(list.length ? `جُدول ${ar(list.length)} تنبيهًا للأيام السبعة القادمة` : "لا تنبيهات للجدولة (اختر المدينة وفعّل التنبيهات)");
    } catch (e) { if (announce) toast("تعذّرت جدولة التنبيهات"); }
  }, announce ? 50 : 1500);
}

/* ====================== التشغيل ====================== */
function initExtra() {
  initTabsNav();
  // بعد إغلاق قارئ المصحف تعود أزرار نافذة النص كما كانت للنصوص الأخرى
  $("#textDialog").addEventListener("close", () => { $("#dlgReport").hidden = false; $("#dlgCounter").hidden = false; });
  applyLook();
  let tries = 0;
  const wait = () => {
    if (!DATA) { if (++tries < 150) setTimeout(wait, 100); return; }
    scheduleMobile(false);
    if (state.tab === "now") renderNow();
  };
  wait();
}
if (document.readyState === "complete") initExtra(); else window.addEventListener("load", initExtra);
