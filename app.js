"use strict";

/* ====================== أدوات عامة ====================== */
const $ = (s, el = document) => el.querySelector(s);
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (v) => String(v).replace(/[0-9]/g, (d) => AR_DIGITS[d]);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const GREG_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function atNoon(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return atNoon(x); }
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a, b) { return dateKey(a) === dateKey(b); }
function gregText(d) { return `${ar(d.getDate())} ${GREG_MONTHS[d.getMonth()]} ${ar(d.getFullYear())}م`; }

/* ====================== التخزين ====================== */
const DEFAULT_SETTINGS = {
  theme: "auto", fontScale: 1, hijriOffset: 0,
  notify: true, morningTime: "07:00", eveningTime: "18:30", autostart: false,
  // أوقات الصلاة: المدينة {name, lat, lng}، والتنبيه قبل الأذان بعدد دقائق
  city: null, prayerNotify: true, prayerBefore: 10,
  // أدعيتي: المفضلة، والورد اليومي، وآخر ما قُرئ
  favs: [], wird: [], lastRead: [],
  // ثبوت الهلال لكل شهر {"1448-9": "2027-02-08"}، ومناسباتي، وقضاء الفوائت، وموضع القراءة
  monthStarts: {}, personal: [], qada: {}, readPos: {}, imsakMinutes: 10, clockFormat: 12,
  // أفراد العائلة: لكل فرد إنجازه ووِرده ومفضلته
  profiles: [{ id: "main", name: "أنا" }], activeProfile: "main", pdata: {},
  adhanSound: false, updateUrl: "",
};
const PER_PROFILE = ["favs", "wird", "lastRead", "qada", "readPos"];
const progressFile = () => (store.settings.activeProfile && store.settings.activeProfile !== "main" ? `progress-${store.settings.activeProfile}` : "progress");
const store = {
  server: false,
  settings: { ...DEFAULT_SETTINGS },
  progress: {},
  timers: {},
  async init() {
    try {
      const r = await fetch("/api/store/settings", { cache: "no-store" });
      if (r.ok) {
        this.server = true;
        this.settings = { ...DEFAULT_SETTINGS, ...(await r.json()) };
        const p = await fetch(`/api/store/${progressFile()}`, { cache: "no-store" });
        if (p.ok) this.progress = await p.json();
        return;
      }
    } catch (e) { /* لا يوجد خادم: نستخدم تخزين المتصفح */ }
    try {
      this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("settings") || "{}") };
      this.progress = JSON.parse(localStorage.getItem(progressFile()) || "{}");
    } catch (e) { /* تجاهل */ }
  },
  /** حفظ فوري (قبل تبديل الفرد مثلًا) */
  async flush(name) {
    clearTimeout(this.timers[name]);
    const file = name === "progress" ? progressFile() : name;
    const body = JSON.stringify(this[name]);
    if (this.server) { try { await fetch(`/api/store/${file}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body }); } catch (e) { /* تجاهل */ } }
    else { try { localStorage.setItem(file, body); } catch (e) { /* تجاهل */ } }
  },
  save(name) {
    clearTimeout(this.timers[name]);
    const file = name === "progress" ? progressFile() : name;
    this.timers[name] = setTimeout(async () => {
      const body = JSON.stringify(this[name]);
      if (this.server) {
        try {
          const r = await fetch(`/api/store/${file}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
          if (!r.ok) throw new Error(r.status);
        } catch (e) { toast("تعذّر الحفظ — هل البرنامج يعمل؟"); }
      } else {
        try { localStorage.setItem(file, body); } catch (e) { /* تجاهل */ }
      }
    }, 300);
  },
  isDone(d, id) { return (this.progress[dateKey(d)] || []).includes(id); },
  toggle(d, id) {
    const k = dateKey(d);
    const list = this.progress[k] || [];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    if (list.length) this.progress[k] = list; else delete this.progress[k];
    this.save("progress");
  },
};

/* ====================== التقويم الهجري ====================== */
const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" });
const hijriCache = new Map();
const uqCache = new Map();
/** تاريخ أم القرى مع التعديل العام (±) */
function uq(d) {
  const shifted = addDays(d, Number(store.settings.hijriOffset) || 0);
  const k = dateKey(shifted);
  if (uqCache.has(k)) return uqCache.get(k);
  const parts = {};
  for (const p of hijriFmt.formatToParts(shifted)) if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
  const h = { y: parts.year, m: parts.month, d: parts.day };
  uqCache.set(k, h);
  return h;
}
const ymKey = (y, m) => `${y}-${m}`;
const nextYM = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const prevYM = (y, m) => (m === 1 ? [y - 1, 12] : [y, m - 1]);
const daysBetween = (a, b) => Math.round((atNoon(a) - atNoon(b)) / 864e5);
/** أول الشهر (y,m) حسب أم القرى، بالانطلاق من تاريخ قريب منه */
function uqStart(y, m, near) {
  let d = atNoon(near), h = uq(d);
  for (let i = 0; i < 5 && h.y * 12 + h.m !== y * 12 + m; i++) {
    d = addDays(d, h.y * 12 + h.m < y * 12 + m ? 31 - h.d : -h.d);
    h = uq(d);
  }
  return addDays(d, -(h.d - 1));
}
/** أول الشهر: من ثبوت الهلال الذي حدده المستخدم إن وُجد، وإلا من أم القرى */
function monthStart(y, m, near) {
  const o = (store.settings.monthStarts || {})[ymKey(y, m)];
  return o ? atNoon(new Date(o + "T12:00")) : uqStart(y, m, near);
}
function hijri(d) {
  const k = dateKey(d);
  if (hijriCache.has(k)) return hijriCache.get(k);
  const h0 = uq(d);
  let res = h0;
  if (Object.keys(store.settings.monthStarts || {}).length) {
    for (const [y, m] of [prevYM(h0.y, h0.m), [h0.y, h0.m], nextYM(h0.y, h0.m)]) {
      const s = monthStart(y, m, d);
      const e = monthStart(...nextYM(y, m), addDays(s, 30));
      if (d >= s && d < e) { res = { y, m, d: daysBetween(d, s) + 1 }; break; }
    }
  }
  hijriCache.set(k, res);
  return res;
}
const clearHijri = () => { hijriCache.clear(); uqCache.clear(); };
/** بداية الشهر الهجري الذي يقع فيه التاريخ d، وطوله */
function hijriMonth(d) {
  const h = hijri(d);
  const start = addDays(d, -(h.d - 1));
  let len = 29;
  if (hijri(addDays(start, 29)).m === h.m) len = 30;
  return { start, len, y: h.y, m: h.m };
}
/* ====================== أوقات الصلاة (الطريقة الجعفرية) ====================== */
// الفجر بزاوية ١٦°، والمغرب بزاوية ٤° (ذهاب الحمرة المشرقية)، ومنتصف الليل بين الغروب والفجر
// مدن العالم: [الدولة، المنطقة الزمنية، [[المدينة، العرض، الطول]…]]
const WORLD = [
  ["السعودية", "Asia/Riyadh", [["القطيف", 26.5196, 50.0115], ["سيهات", 26.4834, 50.042], ["صفوى", 26.6497, 49.9552], ["الدمام", 26.4207, 50.0888], ["الخبر", 26.2172, 50.1971], ["الجبيل", 27.0174, 49.6225], ["الأحساء (الهفوف)", 25.3833, 49.5864], ["المبرز", 25.4077, 49.5903], ["الرياض", 24.7136, 46.6753], ["مكة المكرمة", 21.4225, 39.8262], ["المدينة المنورة", 24.4672, 39.6112], ["جدة", 21.5433, 39.1728], ["الطائف", 21.2703, 40.4158], ["نجران", 17.4924, 44.1277], ["جازان", 16.8892, 42.5511], ["أبها", 18.2164, 42.5053], ["تبوك", 28.3835, 36.5662], ["حائل", 27.5114, 41.7208], ["بريدة", 26.326, 43.975]]],
  ["البحرين", "Asia/Bahrain", [["المنامة", 26.2235, 50.5876], ["المحرق", 26.2572, 50.6119], ["سترة", 26.1547, 50.6206]]],
  ["الكويت", "Asia/Kuwait", [["مدينة الكويت", 29.3759, 47.9774], ["الجهراء", 29.3375, 47.6581]]],
  ["قطر", "Asia/Qatar", [["الدوحة", 25.2854, 51.531]]],
  ["الإمارات", "Asia/Dubai", [["دبي", 25.2048, 55.2708], ["أبوظبي", 24.4539, 54.3773], ["الشارقة", 25.3463, 55.4209], ["العين", 24.2075, 55.7447]]],
  ["عُمان", "Asia/Muscat", [["مسقط", 23.588, 58.3829], ["صحار", 24.347, 56.709], ["صلالة", 17.0151, 54.0924]]],
  ["العراق", "Asia/Baghdad", [["النجف الأشرف", 32.0259, 44.3462], ["كربلاء المقدسة", 32.616, 44.0249], ["الكوفة", 32.03, 44.4], ["الكاظمية", 33.3797, 44.3383], ["بغداد", 33.3152, 44.3661], ["سامراء", 34.1959, 43.8857], ["البصرة", 30.5085, 47.7804], ["الحلة", 32.4637, 44.4196], ["الناصرية", 31.0439, 46.2575], ["العمارة", 31.8356, 47.144], ["الديوانية", 31.9929, 44.9255], ["الكوت", 32.5128, 45.8182], ["السماوة", 31.3199, 45.2803], ["بعقوبة", 33.7466, 44.6436], ["كركوك", 35.4681, 44.3922], ["الموصل", 36.335, 43.1189], ["أربيل", 36.1911, 44.0092]]],
  ["إيران", "Asia/Tehran", [["قم المقدسة", 34.6399, 50.8759], ["مشهد المقدسة", 36.2605, 59.6168], ["طهران", 35.6892, 51.389], ["أصفهان", 32.6546, 51.668], ["شيراز", 29.5918, 52.5837], ["تبريز", 38.08, 46.2919], ["الأهواز", 31.3183, 48.6706], ["عبادان", 30.3473, 48.2934], ["المحمرة (خرمشهر)", 30.4397, 48.1664], ["يزد", 31.8974, 54.3569], ["كرمان", 30.2839, 57.0834], ["زاهدان", 29.4963, 60.8629]]],
  ["لبنان", "Asia/Beirut", [["بيروت", 33.8938, 35.5018], ["صور", 33.2705, 35.2038], ["صيدا", 33.5571, 35.3729], ["النبطية", 33.3772, 35.4836], ["بعلبك", 34.0047, 36.211]]],
  ["سوريا", "Asia/Damascus", [["دمشق", 33.5138, 36.2765], ["حلب", 36.2021, 37.1343], ["حمص", 34.7324, 36.7137]]],
  ["الأردن", "Asia/Amman", [["عمّان", 31.9454, 35.9284]]],
  ["فلسطين", "Asia/Hebron", [["القدس", 31.7683, 35.2137], ["غزة", 31.5017, 34.4668]]],
  ["اليمن", "Asia/Aden", [["صنعاء", 15.3694, 44.191], ["صعدة", 16.9402, 43.7639], ["عدن", 12.7855, 45.0187]]],
  ["مصر", "Africa/Cairo", [["القاهرة", 30.0444, 31.2357], ["الإسكندرية", 31.2001, 29.9187]]],
  ["السودان", "Africa/Khartoum", [["الخرطوم", 15.5007, 32.5599]]],
  ["ليبيا", "Africa/Tripoli", [["طرابلس", 32.8872, 13.1913]]],
  ["تونس", "Africa/Tunis", [["تونس", 36.8065, 10.1815]]],
  ["الجزائر", "Africa/Algiers", [["الجزائر", 36.7538, 3.0588]]],
  ["المغرب", "Africa/Casablanca", [["الرباط", 34.0209, -6.8416], ["الدار البيضاء", 33.5731, -7.5898]]],
  ["تركيا", "Europe/Istanbul", [["إسطنبول", 41.0082, 28.9784], ["أنقرة", 39.9334, 32.8597]]],
  ["أذربيجان", "Asia/Baku", [["باكو", 40.4093, 49.8671]]],
  ["جورجيا", "Asia/Tbilisi", [["تبليسي", 41.7151, 44.8271]]],
  ["أفغانستان", "Asia/Kabul", [["كابل", 34.5553, 69.2075], ["هرات", 34.3529, 62.204], ["مزار شريف", 36.709, 67.1109]]],
  ["باكستان", "Asia/Karachi", [["كراتشي", 24.8607, 67.0011], ["لاهور", 31.5204, 74.3587], ["إسلام آباد", 33.6844, 73.0479], ["كويتا", 30.1798, 66.975]]],
  ["الهند", "Asia/Kolkata", [["لكناو", 26.8467, 80.9462], ["حيدر آباد", 17.385, 78.4867], ["مومباي", 19.076, 72.8777], ["دلهي", 28.6139, 77.209], ["سريناغار (كشمير)", 34.0837, 74.7973]]],
  ["بنغلاديش", "Asia/Dhaka", [["دكا", 23.8103, 90.4125]]],
  ["أوزبكستان", "Asia/Tashkent", [["طشقند", 41.2995, 69.2401]]],
  ["ماليزيا", "Asia/Kuala_Lumpur", [["كوالالمبور", 3.139, 101.6869]]],
  ["إندونيسيا", "Asia/Jakarta", [["جاكرتا", -6.2088, 106.8456]]],
  ["سنغافورة", "Asia/Singapore", [["سنغافورة", 1.3521, 103.8198]]],
  ["الصين", "Asia/Shanghai", [["بكين", 39.9042, 116.4074]]],
  ["اليابان", "Asia/Tokyo", [["طوكيو", 35.6762, 139.6503]]],
  ["نيجيريا", "Africa/Lagos", [["لاغوس", 6.5244, 3.3792], ["كانو", 12.0022, 8.592]]],
  ["السنغال", "Africa/Dakar", [["داكار", 14.7167, -17.4677]]],
  ["كينيا", "Africa/Nairobi", [["نيروبي", -1.2921, 36.8219]]],
  ["تنزانيا", "Africa/Dar_es_Salaam", [["دار السلام", -6.7924, 39.2083]]],
  ["جنوب أفريقيا", "Africa/Johannesburg", [["جوهانسبرغ", -26.2041, 28.0473]]],
  ["بريطانيا", "Europe/London", [["لندن", 51.5074, -0.1278], ["مانشستر", 53.4808, -2.2426], ["برمنغهام", 52.4862, -1.8904]]],
  ["أيرلندا", "Europe/Dublin", [["دبلن", 53.3498, -6.2603]]],
  ["فرنسا", "Europe/Paris", [["باريس", 48.8566, 2.3522]]],
  ["ألمانيا", "Europe/Berlin", [["برلين", 52.52, 13.405], ["هامبورغ", 53.5511, 9.9937], ["ميونخ", 48.1351, 11.582]]],
  ["هولندا", "Europe/Amsterdam", [["أمستردام", 52.3676, 4.9041]]],
  ["بلجيكا", "Europe/Brussels", [["بروكسل", 50.8503, 4.3517]]],
  ["سويسرا", "Europe/Zurich", [["زيورخ", 47.3769, 8.5417]]],
  ["النمسا", "Europe/Vienna", [["فيينا", 48.2082, 16.3738]]],
  ["إيطاليا", "Europe/Rome", [["روما", 41.9028, 12.4964]]],
  ["إسبانيا", "Europe/Madrid", [["مدريد", 40.4168, -3.7038]]],
  ["اليونان", "Europe/Athens", [["أثينا", 37.9838, 23.7275]]],
  ["الدنمارك", "Europe/Copenhagen", [["كوبنهاغن", 55.6761, 12.5683]]],
  ["السويد", "Europe/Stockholm", [["مالمو", 55.605, 13.0038], ["ستوكهولم", 59.3293, 18.0686]]],
  ["النرويج", "Europe/Oslo", [["أوسلو", 59.9139, 10.7522]]],
  ["روسيا", "Europe/Moscow", [["موسكو", 55.7558, 37.6173]]],
  ["الولايات المتحدة (الشرق)", "America/New_York", [["نيويورك", 40.7128, -74.006], ["واشنطن", 38.9072, -77.0369], ["فيلادلفيا", 39.9526, -75.1652]]],
  ["الولايات المتحدة (ميشيغان)", "America/Detroit", [["ديربورن / ديترويت", 42.3223, -83.1763]]],
  ["الولايات المتحدة (الوسط)", "America/Chicago", [["شيكاغو", 41.8781, -87.6298], ["هيوستن", 29.7604, -95.3698], ["دالاس", 32.7767, -96.797]]],
  ["الولايات المتحدة (الغرب)", "America/Los_Angeles", [["لوس أنجلوس", 34.0522, -118.2437], ["سان فرانسيسكو", 37.7749, -122.4194], ["سياتل", 47.6062, -122.3321]]],
  ["كندا (الشرق)", "America/Toronto", [["تورنتو", 43.6532, -79.3832], ["أوتاوا", 45.4215, -75.6972], ["مونتريال", 45.5017, -73.5673]]],
  ["كندا (ألبرتا)", "America/Edmonton", [["إدمنتون", 53.5461, -113.4938], ["كالغاري", 51.0447, -114.0719]]],
  ["كندا (الغرب)", "America/Vancouver", [["فانكوفر", 49.2827, -123.1207]]],
  ["البرازيل", "America/Sao_Paulo", [["ساو باولو", -23.5505, -46.6333]]],
  ["الأرجنتين", "America/Argentina/Buenos_Aires", [["بوينس آيرس", -34.6037, -58.3816]]],
  ["فنزويلا", "America/Caracas", [["كاراكاس", 10.4806, -66.9036]]],
  ["أستراليا (سيدني)", "Australia/Sydney", [["سيدني", -33.8688, 151.2093]]],
  ["أستراليا (ملبورن)", "Australia/Melbourne", [["ملبورن", -37.8136, 144.9631]]],
  ["نيوزيلندا", "Pacific/Auckland", [["أوكلاند", -36.8485, 174.7633]]],
];
const CITIES = WORLD.flatMap(([country, tz, list]) => list.map(([n, lat, lng]) => [n, lat, lng, tz, country]));
const findCity = (name) => CITIES.find(([n]) => n === name);
/** المنطقة الزمنية للمدينة المختارة (أو منطقة الجهاز إن كانت إحداثيات يدوية) */
const cityTZ = () => store.settings.city?.tz || findCity(store.settings.city?.name)?.[3] || undefined;
const tzFmt = new Map();
function tzParts(dt, tz = cityTZ()) {
  const k = tz || "local";
  if (!tzFmt.has(k)) tzFmt.set(k, new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23" }));
  const o = {};
  for (const p of tzFmt.get(k).formatToParts(dt)) if (p.type !== "literal") o[p.type] = +p.value;
  return o;
}
const rad = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
const fixA = (a) => ((a % 360) + 360) % 360, fixH = (h) => ((h % 24) + 24) % 24;
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fixA(357.529 + 0.98560028 * D), q = fixA(280.459 + 0.98564736 * D);
  const L = fixA(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)));
  const e = 23.439 - 0.00000036 * D;
  const RA = fixH(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - RA };
}
function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
/** أوقات يوم d بالساعات المحلية (كسور)، مع كائنات Date */
function prayerTimes(d, city = store.settings.city) {
  if (!city) return null;
  const jd0 = julian(d.getFullYear(), d.getMonth() + 1, d.getDate()) - city.lng / (15 * 24);
  const mid = (t) => fixH(12 - sunPos(jd0 + t).eqt);
  const angleT = (ang, t, ccw) => {
    const { decl } = sunPos(jd0 + t);
    const c = (-Math.sin(rad(ang)) - Math.sin(rad(decl)) * Math.sin(rad(city.lat))) / (Math.cos(rad(decl)) * Math.cos(rad(city.lat)));
    const T = deg(Math.acos(Math.max(-1, Math.min(1, c)))) / 15;
    return mid(t) + (ccw ? -T : T);
  };
  // تكراران لتحسين الدقة
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, sunset: 18, maghrib: 18 };
  for (let i = 0; i < 2; i++) {
    t = {
      fajr: angleT(16, t.fajr / 24, true), sunrise: angleT(0.833, t.sunrise / 24, true), dhuhr: mid(t.dhuhr / 24),
      sunset: angleT(0.833, t.sunset / 24, false), maghrib: angleT(4, t.maghrib / 24, false),
    };
  }
  // بتوقيت غرينتش، ثم لحظات مطلقة (Date) تُعرض بتوقيت المدينة
  for (const k in t) t[k] -= city.lng / 15;
  t.midnight = t.sunset + (t.fajr + 24 - t.sunset) / 2;
  const day0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const at = (h) => new Date(day0 + Math.round(h * 3600) * 1000);
  const out = {};
  for (const k in t) out[k] = at(t[k]);
  return out;
}
const PRAYER_NAMES = { fajr: "أذان الفجر", sunrise: "الشروق", dhuhr: "أذان الظهر", maghrib: "أذان المغرب", midnight: "منتصف الليل" };
/** الوقت حسب اختيار المستخدم: ١٢ ساعة (ص/م) أو ٢٤ ساعة */
function fmtHM(h, m) {
  const mm = String(m).padStart(2, "0");
  if (Number(store.settings.clockFormat) === 24) return ar(`${h}:${mm}`);
  return ar(`${h % 12 || 12}:${mm}`) + (h < 12 ? " ص" : " م");
}
const hm = (dt) => { const p = tzParts(dt); return fmtHM(p.hour, p.minute); };
function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return ar(`${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
}
/** وقت اليوم الحالي: أي قسم من الأعمال اليومية يناسبه، وما الوقت القادم */
function currentPeriod(now = new Date()) {
  // تاريخ اليوم في المدينة المختارة (قد يختلف عن تاريخ الجهاز)
  const cp = tzParts(now);
  const base = new Date(cp.year, cp.month - 1, cp.day, 12);
  const T = prayerTimes(base), Y = prayerTimes(addDays(base, -1)), N = prayerTimes(addDays(base, 1));
  if (!T) return null;
  const sleepStart = (x) => new Date(x.midnight.getTime() - 2 * 3600e3);
  // سلسلة الحدود من منتصف ليل أمس إلى فجر الغد
  const marks = [
    [Y.midnight, "night"], [T.fajr, "fajr"], [T.sunrise, "morning"], [T.dhuhr, "zuhr"], [T.maghrib, "evening"],
    [sleepStart(T), "sleep"], [T.midnight, "night"], [N.fajr, "fajr"],
  ];
  let key = "evening";
  if (now < Y.midnight) key = now < sleepStart(Y) ? "evening" : "sleep";
  for (const [t, k] of marks) if (now >= t) key = k;
  const upcoming = [["fajr", T.fajr], ["sunrise", T.sunrise], ["dhuhr", T.dhuhr], ["maghrib", T.maghrib], ["midnight", T.midnight], ["fajr", N.fajr]];
  if (now < Y.midnight) upcoming.unshift(["midnight", Y.midnight]);
  const next = upcoming.find(([, t]) => t > now);
  return { key, times: T, next: { key: next[0], name: PRAYER_NAMES[next[0]], at: next[1] } };
}

function monthName(m) { return DATA.months[m]?.name || ""; }
function hijriText(h) { return `${ar(h.d)} ${monthName(h.m)} ${ar(h.y)}هـ`; }

/* ====================== جمع أعمال يوم ====================== */
let DATA = null;

/** مناسبات يوم هجري معيّن (مع القواعد مثل ليلة الرغائب) */
function eventsFor(d) {
  const h = hijri(d);
  const { len } = hijriMonth(d);
  const mo = DATA.months[h.m];
  const list = [];
  for (const pe of store.settings.personal || []) {
    if (+pe.m === h.m && +pe.d === h.d) list.push({ title: pe.title, kind: "personal", items: [], note: pe.note || "" });
  }
  if (!mo) return list;
  if (mo.days[h.d]) list.push(mo.days[h.d]);
  if (h.d === len && mo.days.last) list.push(mo.days.last);
  for (const r of mo.rules || []) {
    if (r.rule === "firstFridayNight" && d.getDay() === 5 && h.d <= 7) {
      list.push({ title: r.title, kind: r.kind, items: [], night: r.items });
    }
  }
  return list;
}

/** أعمال الشهر المتكررة في هذا اليوم (أول الشهر، الأيام البيض، صيام الأيام الثلاثة) */
function monthlyFor(d) {
  const h = hijri(d);
  const { len } = hijriMonth(d);
  const w = d.getDay();
  const m = DATA.monthly;
  const items = [...(m.days[h.d]?.items || [])];
  for (const r of m.rules) {
    if (r.rule === "firstThursday" && w === 4 && h.d <= 7) items.push(r.item);
    if (r.rule === "midWednesday" && w === 3 && h.d >= 11 && h.d <= 17) items.push(r.item);
    if (r.rule === "lastThursday" && w === 4 && h.d + 7 > len) items.push(r.item);
  }
  return items;
}

/** أعمال الليلة القادمة (ليلة اليوم التالي) */
function nightFor(d) {
  const next = addDays(d, 1);
  const h = hijri(next);
  const w = next.getDay();
  const items = [...(DATA.weekdays[w].night || [])];
  const titles = [];
  for (const ev of eventsFor(next)) {
    if (ev.night?.length) { items.push(...ev.night); if (ev.kind !== "plain") titles.push(ev.title); }
  }
  items.push(...(DATA.monthly.days[h.d]?.night || []));
  const name = `ليلة ${WEEKDAYS[w]} — ليلة ${ar(h.d)} ${monthName(h.m)}`;
  return { name, items, titles };
}

function collectDay(d) {
  const h = hijri(d);
  const w = d.getDay();
  const groups = [];
  const events = eventsFor(d);
  // الأعمال المشتركة لكل يوم (تبويب «الأعمال اليومية»)
  for (const g of DATA.daily) groups.push({ key: g.id, title: g.title, icon: g.icon, items: g.items, common: true });
  const special = [...monthlyFor(d)];
  for (const ev of events) special.push(...ev.items);
  if (special.length) groups.unshift({ key: "special", title: "أعمال خاصة بهذا اليوم", icon: "⭐", items: special, cls: "occasion" });
  const wd = DATA.weekdays[w];
  if (wd.day.length) groups.splice(special.length ? 1 : 0, 0, { key: "weekday", title: `أعمال يوم ${wd.name}`, icon: "📅", items: wd.day });
  const mo = DATA.months[h.m];
  if (mo?.general?.length) groups.push({ key: "month", title: `أعمال ${mo.name}`, icon: "🌙", items: mo.general });
  const night = nightFor(d);
  if (night.items.length) groups.push({ key: "night", title: night.name, icon: "🌌", items: night.items, cls: "night", sub: night.titles.join(" · ") });
  return { h, events, groups };
}

const isExtraId = (id) => /^[mvky]\d|^w\d+$|^(fs|tq|jm|kf)\d|^iq\d_\d/.test(id);

/** نسبة الإنجاز: أعمال اليوم الخاصة كلها، والأعمال المشتركة الأساسية دون الإضافات المطوية.
 *  which: "all" | "day" | "common" */
/** الورد اليومي (إن اختاره المستخدم) يحلّ محلّ الأعمال المشتركة في حساب الإنجاز */
const wirdSet = () => new Set(store.settings.wird || []);
function dayStats(d, which = "all") {
  const { groups } = collectDay(d);
  const ids = new Set();
  const wird = wirdSet();
  for (const g of groups) {
    if (which === "day" && g.common) continue;
    if (which === "common" && !g.common) continue;
    for (const it of g.items) {
      if (g.common && wird.size) { if (wird.has(it.id)) ids.add(it.id); }
      else if (!isExtraId(it.id)) ids.add(it.id);
    }
  }
  const done = (store.progress[dateKey(d)] || []).filter((id) => ids.has(id)).length;
  return { total: ids.size, done, pct: ids.size ? Math.round((done / ids.size) * 100) : 0 };
}

/* ====================== الحالة والتنقل ====================== */
const state = { date: atNoon(new Date()), tab: "now", wirdEdit: false };
const today = () => atNoon(new Date());

function setDate(d) {
  state.date = atNoon(d);
  renderHeader();
  renderTab();
}
function setTab(t) {
  state.tab = t;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === `tab-${t}`));
  renderTab();
}
function renderTab() {
  ({ now: renderNow, today: renderToday, daily: renderDaily, mine: renderMine, library: renderLibrary, month: renderMonth, events: renderEvents, stats: renderStats, settings: renderSettings })[state.tab]();
}
const saveSettings = () => store.save("settings");
const isFav = (id) => (store.settings.favs || []).includes(id);
function toggleList(name, id) {
  const l = store.settings[name] = [...(store.settings[name] || [])];
  const i = l.indexOf(id);
  if (i >= 0) l.splice(i, 1); else l.push(id);
  saveSettings();
  return i < 0;
}
/** فهرس كل العناصر بالمعرّف (لأدعيتي والورد) */
let itemMap = null;
function itemById(id) {
  if (!itemMap) {
    searchIndex ||= buildSearchIndex();
    itemMap = new Map();
    for (const e of searchIndex) if (!itemMap.has(e.it.id)) itemMap.set(e.it.id, e);
  }
  return itemMap.get(id);
}
function renderHeader() {
  const d = state.date;
  const s = store.settings;
  const ps = $("#profileSel");
  if (s.profiles.length > 1) {
    ps.hidden = false;
    ps.innerHTML = s.profiles.map((pf) => `<option value="${pf.id}" ${pf.id === s.activeProfile ? "selected" : ""}>👤 ${esc(pf.name)}</option>`).join("");
  } else ps.hidden = true;
  $("#hijriDate").textContent = hijriText(hijri(d));
  $("#gregDate").textContent = `${WEEKDAYS[d.getDay()]} · ${gregText(d)}`;
  $("#goToday").hidden = sameDay(d, today());
}

/* ====================== تبويب: أعمال اليوم ====================== */
function itemHTML(it, d, checkable = true, opts = {}) {
  const done = checkable && store.isDone(d, it.id);
  const t = it.text ? DATA.texts[it.text] : null;
  const badge = it.count ? `<span class="badge">${esc(it.count)}</span>` : "";
  const alt = it.alt ? ` data-alt="${esc(it.alt)}"` : "";
  const id = esc(it.id);
  const read = t ? `<button class="read-btn ${t.text ? "" : "empty"}" data-text="${esc(it.text)}" data-item="${id}" data-date="${dateKey(d)}"${alt}>${t.text ? "النص" : "المصدر"}</button>` : "";
  const chk = checkable ? `<button class="check" data-id="${id}" data-date="${dateKey(d)}" title="تمّ">${done ? "✓" : ""}</button>` : "";
  const guide = it.id === "d_layl" ? `<button class="read-btn guide-btn" data-guide="layl">🌌 خطوة بخطوة</button>` : "";
  const fav = isFav(it.id);
  const star = `<button class="star ${fav ? "on" : ""}" data-fav="${id}" title="${fav ? "إزالة من أدعيتي" : "إضافة إلى أدعيتي"}">${fav ? "★" : "☆"}</button>`;
  const inWird = opts.wirdEdit && (store.settings.wird || []).includes(it.id);
  const wird = opts.wirdEdit ? `<button class="wird-btn ${inWird ? "on" : ""}" data-wird="${id}">${inWird ? "✓ في وردي" : "＋ إلى وردي"}</button>` : "";
  return `<div class="item ${done ? "done" : ""}${inWird ? " in-wird" : ""}">${chk}
    <div class="item-main"><div class="item-title">${esc(it.title)}${badge}</div>
    ${it.desc ? `<div class="item-desc">${esc(it.desc)}</div>` : ""}
    ${howHTML(it)}${srcHTML(it.src)}</div>${wird}${guide}${read}${star}</div>`;
}
/** خلاصة طريقة الأداء تحت العمل: الخطوة الأولى ظاهرة، والبقية عند الفتح */
let HOWTO = {};
let LONG_READY = null;
function howHTML(it) {
  const h = HOWTO[it.id];
  if (!h) return "";
  if (h.length === 1) return `<div class="how-line">🧭 ${esc(h[0])}</div>`;
  return `<details class="how"><summary>🧭 ${esc(h[0])} <span class="how-more">· الطريقة (${ar(h.length)})</span></summary>
    <ol>${h.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>`;
}
/** المصادر شارات مختصرة باسم الكتاب، والتفصيل عند الضغط */
const BOOKS = [
  [/مفتاح الفلاح/, "مفتاح الفلاح"], [/مصباح المتهجد/, "مصباح المتهجد"], [/مفاتيح الجنان/, "مفاتيح الجنان"],
  [/مفتاح الجنات/, "مفتاح الجنات"], [/وسائل الشيعة/, "وسائل الشيعة"], [/ضياء الصالحين/, "ضياء الصالحين"],
  [/زاد المعاد/, "زاد المعاد"], [/فلاح السائل/, "فلاح السائل"], [/تعقيب الصلوات/, "أدعية التعقيب"],
  [/جمال الأسبوع/, "جمال الأسبوع"], [/كفعمي/, "مصباح الكفعمي"], [/إقبال الأعمال/, "إقبال الأعمال"],
];
const booksOf = (src) => BOOKS.filter(([re]) => re.test(src || "")).map(([, n]) => n);
function srcHTML(src) {
  if (!src) return "";
  const b = booksOf(src);
  if (!b.length) return `<div class="item-src">📖 ${esc(src)}</div>`;
  return `<div class="item-src chips">${b.map((n) => `<span class="src-chip">${n}</span>`).join("")}<button class="src-more" title="${esc(src)}">التفاصيل</button><span class="src-full" hidden>${esc(src)}</span></div>`;
}

function progressHTML(st, label) {
  return `<div class="progress-wrap"><div class="progress-head"><b>${label}</b><span>${ar(st.done)} من ${ar(st.total)} · ${ar(st.pct)}٪</span></div>
    <div class="bar"><i style="width:${st.pct}%"></i></div></div>`;
}
function bindDetails(sec) {
  sec.querySelectorAll("details.more, details.fold").forEach((el) => el.addEventListener("toggle", () => {
    if (el.open) openSet.add(el.dataset.key); else openSet.delete(el.dataset.key);
  }));
}

// تصنيف عمل اليوم: صلاة / دعاء وذكر / زيارة / غير ذلك
const KINDS = [
  ["salat", "🕌 الصلوات", /صلاة (?!على)|صلوات (?!على)|ركع|نافلة|^الصلاة(?! على)/],
  ["ziyara", "🕋 الزيارات", /زيارة|يزور|الزيارة/],
  ["dua", "🤲 الأدعية والأذكار", /دعاء|يدعو|ادع|الدعاء|مناجاة|تعويذ|عوذة|حرز|تسبيح|التسبيح|يسبح|ذكر|يقول|تقول|قل|استغفار|يستغفر|الصلاة على|الصلوات على|تهليل|التهليل|قراءة|يقرأ|سورة/],
];
function kindOf(it) {
  const t = stripDiac(it.title);
  for (const [k, , re] of KINDS) if (re.test(t)) return k;
  return "other";
}

/** تبويب «أعمال اليوم»: كل ما يخص هذا اليوم بعينه (المناسبة، يوم الأسبوع، الشهر، الليلة القادمة) */
function renderToday() {
  const d = state.date;
  const { events, groups } = collectDay(d);
  const dayGroups = groups.filter((g) => !g.common);
  const st = dayStats(d, "day");
  let html = "";
  // الأيام التي لا مناسبة فيها (أُنشئت لحمل أعمالها فقط) لا تُعرض لها لافتة
  for (const ev of events.filter((e) => e.kind !== "plain")) {
    html += `<div class="banner ${ev.kind}"><span class="kdot ${ev.kind}"></span><div><b>${esc(ev.title)}</b>${ev.note ? `<small>${esc(ev.note)}</small>` : ""}${ev.kind === "personal" ? `<small>يُستحب له قراءة الفاتحة والتصدق وصلاة الهدية.</small>` : ""}</div></div>`;
  }
  const label = sameDay(d, today()) ? "إنجاز أعمال اليوم" : `إنجاز أعمال يوم ${WEEKDAYS[d.getDay()]}`;
  html += progressHTML(st, label);
  if (!dayGroups.length) html += `<p class="search-info">لا أعمال خاصة بهذا اليوم. انظر تبويب «الأعمال اليومية».</p>`;
  for (const g of dayGroups) {
    const dn = g.items.filter((it) => store.isDone(d, it.id)).length;
    const sections = [...KINDS.map(([k, label]) => [k, label]), ["other", "📌 أعمال أخرى"]];
    // يعرض قائمة مقسّمة إلى صلوات وزيارات وأدعية وأعمال أخرى
    const byKind = (list) => {
      const parts = { salat: [], ziyara: [], dua: [], other: [] };
      for (const it of list) parts[kindOf(it)].push(it);
      const nonEmpty = sections.filter(([k]) => parts[k].length);
      return nonEmpty.map(([k, label]) => (nonEmpty.length > 1 ? `<div class="kind-head">${label} <small>(${ar(parts[k].length)})</small></div>` : "")
        + parts[k].map((it) => itemHTML(it, d)).join("")).join("");
    };
    const mainItems = g.items.filter((it) => !isExtraId(it.id));
    const extraItems = g.items.filter((it) => isExtraId(it.id));
    let body = byKind(mainItems);
    if (extraItems.length) {
      // إضافات كتب الأدعية مطوية حتى لا تطول الصفحة
      const openKey = `open:today:${g.key}`;
      const exDone = extraItems.filter((it) => store.isDone(d, it.id)).length;
      body += `<details class="more" data-key="${esc(openKey)}" ${openSet.has(openKey) || !mainItems.length ? "open" : ""}>
        <summary>إضافات من كتب الأدعية (${ar(extraItems.length)})${exDone ? ` · أنجزت ${ar(exDone)}` : ""}</summary>${byKind(extraItems)}</details>`;
    }
    html += `<div class="group ${g.cls || ""}"><div class="group-head"><span class="ico">${g.icon || ""}</span>
      <h3>${esc(g.title)}${g.sub ? ` <small style="font-weight:400;opacity:.8">(${esc(g.sub)})</small>` : ""}</h3>
      <span class="count">${ar(dn)}/${ar(g.items.length)}</span></div>${body}</div>`;
  }
  $("#tab-today").innerHTML = html;
  bindDetails($("#tab-today"));
}

/** تبويب «الأعمال اليومية»: الأعمال المشتركة التي تتكرر كل يوم */
function renderDaily() {
  const d = state.date;
  const { groups } = collectDay(d);
  const st = dayStats(d, "common");
  const hasWird = (store.settings.wird || []).length > 0;
  const we = state.wirdEdit;
  const what = hasWird ? "وردي اليومي" : "الأعمال اليومية";
  let html = we
    ? `<div class="wird-bar editing"><div><b>تخصيص وردي اليومي</b><small>افتح الأقسام واضغط «＋ إلى وردي» على كل عمل تلتزم به. عدد المختار الآن: ${ar((store.settings.wird || []).length)}. نسبة الإنجاز ستُحسب على الورد وحده.</small></div>
      <button class="primary-btn" id="wirdDone">تمّ</button></div>`
    : `<div class="wird-bar"><div><b>${hasWird ? `وردي اليومي (${ar(store.settings.wird.length)})` : "اختر وردك اليومي"}</b><small>${hasWird ? "الإنجاز يُحسب على الأعمال التي اخترتها فقط." : "اختر الأعمال التي تلتزم بها كل يوم، ليُحسب الإنجاز عليها وحدها بدل مئات الأعمال."}</small></div>
      <button class="primary-btn ghost" id="wirdEdit">✎ ${hasWird ? "تعديل الورد" : "تخصيص وردي"}</button></div>`;
  html += progressHTML(st, sameDay(d, today()) ? `إنجاز ${what}` : `إنجاز ${what} ليوم ${WEEKDAYS[d.getDay()]}`);
  for (const g of groups.filter((g) => g.common)) {
    const dn = g.items.filter((it) => store.isDone(d, it.id)).length;
    // أدعية مصباح المتهجد الإضافية تُطوى تحت كل قسم حتى لا تطول الصفحة
    const EXTRA = [
      [/^m\d/, "أدعية وأعمال إضافية من مصباح المتهجد"],
      [/^v\d/, "أبواب المستحبات من وسائل الشيعة"],
      [/^k\d/, "من مفاتيح الجنان"],
      [/^y\d/, "من ضياء الصالحين"],
      [/^fs\d/, "من فلاح السائل لابن طاووس"],
      [/^tq\d/, "من أدعية التعقيب (أدعية أهل البيت في تعقيب الصلوات)"],
      [/^jm\d/, "من جمال الأسبوع لابن طاووس"],
      [/^kf\d/, "من المصباح للكفعمي"],
      [/^iq\d_\d/, "من إقبال الأعمال لابن طاووس"],
      [/^w\d+$/, "الصلوات المستحبة الواردة في الروايات (وسائل الشيعة)"],
    ];
    const isExtra = (it) => EXTRA.some(([re]) => re.test(it.id));
    const main = g.items.filter((it) => !isExtra(it));
    let extrasHTML = "";
    for (const [re, label] of EXTRA) {
      const extra = g.items.filter((it) => re.test(it.id));
      if (!extra.length) continue;
      const extraDone = extra.filter((it) => store.isDone(d, it.id)).length;
      const openKey = `open:${g.key}:${label}`;
      extrasHTML += `<details class="more" data-key="${esc(openKey)}" ${openSet.has(openKey) ? "open" : ""}><summary>${label} (${ar(extra.length)})${extraDone ? ` · أنجزت ${ar(extraDone)}` : ""}</summary>
        ${extra.map((it) => itemHTML(it, d, true, { wirdEdit: we })).join("")}</details>`;
    }
    // كل قسم مطويّ، ويُفتح بالضغط على عنوانه (وتُحفظ حالة الفتح أثناء التنقل)
    const gKey = `grp:${g.key}`;
    html += `<details class="group fold ${g.cls || ""}" data-key="${esc(gKey)}" ${openSet.has(gKey) ? "open" : ""}>
      <summary class="group-head"><span class="ico">${g.icon || ""}</span>
      <h3>${esc(g.title)}${g.sub ? ` <small style="font-weight:400;opacity:.8">(${esc(g.sub)})</small>` : ""}</h3>
      <span class="count">${ar(dn)}/${ar(g.items.length)}</span><span class="chev">▾</span></summary>
      ${main.map((it) => itemHTML(it, d, true, { wirdEdit: we })).join("")}${extrasHTML}</details>`;
  }
  const sec = $("#tab-daily");
  sec.innerHTML = html;
  bindDetails(sec);
  const b1 = $("#wirdEdit", sec), b2 = $("#wirdDone", sec);
  if (b1) b1.onclick = () => { state.wirdEdit = true; renderDaily(); };
  if (b2) b2.onclick = () => { state.wirdEdit = false; renderDaily(); toast("حُفظ وردك اليومي"); };
}

/* ====================== تبويب: الآن ====================== */
const PERIODS = {
  fajr: { name: "وقت الفجر", sub: "من طلوع الفجر إلى طلوع الشمس", icon: "🌅" },
  morning: { name: "وقت الضحى", sub: "من طلوع الشمس إلى الزوال", icon: "☀️" },
  zuhr: { name: "وقت الظهر والعصر", sub: "من الزوال إلى المغرب", icon: "🌤️" },
  evening: { name: "وقت المغرب والعشاء", sub: "من المغرب إلى وقت النوم", icon: "🌇" },
  sleep: { name: "وقت النوم", sub: "آداب النوم وأذكاره", icon: "🌙" },
  night: { name: "جوف الليل والسحر", sub: "من منتصف الليل إلى الفجر", icon: "✨" },
};
function cityPickerHTML(id = "nowCity") {
  const cur = store.settings.city?.name;
  return `<select id="${id}" class="city-select"><option value="">— اختر مدينتك —</option>
    ${WORLD.map(([country, , list]) => `<optgroup label="${country}">${list.map(([n]) => `<option ${cur === n ? "selected" : ""}>${n}</option>`).join("")}</optgroup>`).join("")}
    ${cur && !findCity(cur) ? `<option selected>${esc(cur)}</option>` : ""}</select>`;
}
function bindCityPicker(sel, after) {
  sel.onchange = () => {
    const c = findCity(sel.value);
    if (!c) return;
    store.settings.city = { name: c[0], lat: c[1], lng: c[2], tz: c[3], country: c[4] };
    tzFmt.clear(); saveSettings(); after();
  };
}
let nowTimer = null;
function renderNow() {
  const sec = $("#tab-now");
  const nowD = new Date();
  const d = today();
  const cp = currentPeriod(nowD);
  const { events, groups } = collectDay(d);
  let html = "";
  if (!cp) {
    html += `<div class="now-hero setup"><div class="now-period">🕌 مرحبًا بك</div>
      <p>اختر مدينتك لتظهر أوقات الصلاة، والعدّ التنازلي للأذان القادم، وأعمال الوقت الذي أنت فيه.</p>${cityPickerHTML()}</div>`;
  } else {
    const p = PERIODS[cp.key];
    const T = cp.times;
    const chips = [["fajr", "الفجر"], ["sunrise", "الشروق"], ["dhuhr", "الظهر"], ["maghrib", "المغرب"], ["midnight", "نصف الليل"]]
      .map(([k, n]) => `<div class="pt ${cp.next.key === k && sameDay(cp.next.at, T[k]) ? "next" : ""}"><small>${n}</small><b>${hm(T[k])}</b></div>`).join("");
    html += `<div class="now-hero p-${cp.key}">
      <div class="now-top"><div><div class="now-period">${p.icon} ${p.name}</div><div class="now-sub">${p.sub} · ${esc(store.settings.city.name)}</div></div>
      <div class="now-clock" id="nowClock">${hm(nowD)}</div></div>
      <div class="now-next">بقي على ${cp.next.name}: <b id="nowCountdown">${hms(cp.next.at - nowD)}</b></div>
      <div class="ptimes">${chips}</div>${ramadanHTML(cp, nowD)}${qiblaHTML()}</div>`;
  }
  // مناسبة اليوم والليلة
  for (const ev of events.filter((e) => e.kind !== "plain")) html += `<div class="banner ${ev.kind}"><span class="kdot ${ev.kind}"></span><div><b>${esc(ev.title)}</b></div></div>`;
  const night = nightFor(d);
  if (night.titles.length) html += `<div class="banner other"><span class="kdot other"></span><div><small>الليلة</small><b>${esc(night.titles.join(" · "))}</b></div></div>`;

  // أعمال هذا الوقت
  const wird = wirdSet();
  const pick = (items, n) => {
    const core = items.filter((it) => (wird.size ? wird.has(it.id) || !isExtraId(it.id) : !isExtraId(it.id)));
    core.sort((a, b) => (wird.has(b.id) - wird.has(a.id)) || (store.isDone(d, a.id) - store.isDone(d, b.id)));
    return core.slice(0, n);
  };
  if (cp) {
    const g = DATA.daily.find((x) => x.id === cp.key);
    if (g) {
      const items = pick(g.items, 6);
      html += `<div class="group"><div class="group-head"><span class="ico">${g.icon}</span><h3>أعمال هذا الوقت</h3>
        <button class="link-btn" data-goto="daily" data-open="grp:${g.id}">كل أعمال الوقت (${ar(g.items.length)}) ←</button></div>
        ${items.map((it) => itemHTML(it, d)).join("")}</div>`;
    }
    if (cp.key === "night" || cp.key === "sleep") {
      html += `<button class="guide-card" data-guide="layl"><span>🌌</span><div><b>صلاة الليل خطوة بخطوة</b><small>ثماني ركعات، ثم الشفع والوتر مع عدّاد الاستغفار والعفو في القنوت</small></div><span>←</span></button>`;
    }
    // قرب الفريضة: التعقيبات المشتركة
    const nearPrayer = ["fajr", "dhuhr", "maghrib"].some((k) => nowD - T_(cp, k) >= -20 * 60e3 && nowD - T_(cp, k) <= 90 * 60e3);
    if (nearPrayer) {
      const pg = DATA.daily.find((x) => x.id === "prayers");
      html += `<div class="group"><div class="group-head"><span class="ico">🕌</span><h3>مع الفريضة</h3>
        <button class="link-btn" data-goto="daily" data-open="grp:prayers">كل التعقيبات ←</button></div>${pick(pg.items, 4).map((it) => itemHTML(it, d)).join("")}</div>`;
    }
  }
  // أعمال اليوم الخاصة
  const special = [];
  for (const g of groups.filter((g) => !g.common && g.key !== "night")) for (const it of g.items) if (!isExtraId(it.id)) special.push(it);
  if (special.length) {
    const left = special.filter((it) => !store.isDone(d, it.id));
    html += `<div class="group occasion"><div class="group-head"><span class="ico">⭐</span><h3>من أعمال اليوم الخاصة</h3>
      <button class="link-btn" data-goto="today">عرضها كلها (${ar(special.length)}) ←</button></div>
      ${(left.length ? left : special).slice(0, 4).map((it) => itemHTML(it, d)).join("")}</div>`;
  }
  // الإنجاز
  const sd = dayStats(d, "day"), sc = dayStats(d, "common");
  html += `<div class="now-stats">
    <div class="ns"><small>أعمال اليوم الخاصة</small><b>${ar(sd.done)}/${ar(sd.total)}</b><div class="bar"><i style="width:${sd.pct}%"></i></div></div>
    <div class="ns"><small>${wird.size ? "وردي اليومي" : "الأعمال اليومية الأساسية"}</small><b>${ar(sc.done)}/${ar(sc.total)}</b><div class="bar"><i style="width:${sc.pct}%"></i></div></div>
    ${nextEventHTML(d)}</div>`;
  // متابعة القراءة
  const last = (store.settings.lastRead || []).map((r) => itemById(r.id)).filter(Boolean).slice(0, 3);
  if (last.length) html += `<div class="group"><div class="group-head"><span class="ico">📖</span><h3>تابع القراءة</h3>
    <button class="link-btn" data-goto="mine">أدعيتي ←</button></div>${last.map((e) => itemHTML(e.it, d, false)).join("")}</div>`;

  sec.innerHTML = html;
  const cs = $("#nowCity", sec);
  if (cs) bindCityPicker(cs, renderNow);
  clearInterval(nowTimer);
  if (cp) {
    nowTimer = setInterval(() => {
      if (state.tab !== "now" || !document.contains($("#nowCountdown"))) return clearInterval(nowTimer);
      const n = new Date();
      if (n >= cp.next.at) return renderNow();
      $("#nowCountdown").textContent = hms(cp.next.at - n);
      $("#nowClock").textContent = hm(n);
      const rc = $("#ramCountdown");
      if (rc && rc.dataset.at) { const left = +rc.dataset.at - n; if (left <= 0) return renderNow(); rc.textContent = hms(left); }
    }, 1000);
  }
}
const T_ = (cp, k) => cp.times[k].getTime();
function nextEventHTML(d) {
  for (let i = 1; i <= 120; i++) {
    const x = addDays(d, i);
    const ev = eventsFor(x).find((e) => e.kind !== "plain");
    if (ev) return `<div class="ns ev" data-date="${dateKey(x)}"><small>المناسبة القادمة</small><b>${esc(ev.title.split("—")[0])}</b><span>${i === 1 ? "غدًا" : `بعد ${ar(i)} يومًا`} · ${ar(hijri(x).d)} ${monthName(hijri(x).m)}</span></div>`;
  }
  return "";
}

/* ---------- صلاة الليل خطوة بخطوة ---------- */
const LAYL_STEPS = [
  { t: "التهيؤ", d: "إذا انتبهت: السجود والدعاء عند الانتباه، وقراءة آخر سورة آل عمران «إن في خلق السماوات والأرض…»، ثم الوضوء والتطيّب. وقتها بعد منتصف الليل، وأفضله السحر.", ids: ["f_intibah", "d_imran_end", "f_tib"] },
  { t: "الركعتان الأولى والثانية", d: "تنويهما من نافلة الليل. في كل ركعة الحمد وما تيسّر من السور، والقنوت في الثانية قبل الركوع. وبعد التسليم الدعاء الوارد.", ids: ["jm126"] },
  { t: "الركعتان الثالثة والرابعة", d: "كالأوليين: الحمد وسورة، والقنوت في الثانية، ثم التسليم والدعاء.", ids: ["jm126"] },
  { t: "الركعتان الخامسة والسادسة", d: "الحمد وسورة، والقنوت في الثانية، ثم التسليم.", ids: [] },
  { t: "الركعتان السابعة والثامنة", d: "الحمد وسورة، والقنوت في الثانية، ثم التسليم.", ids: [] },
  { t: "بعد الركعة الثامنة", d: "قل: «يا الله» عشر مرات، ثم الدعاء الوارد.", ids: ["f_layl_8"], count: 10, cl: "يا الله" },
  { t: "ركعتا الشفع", d: "ركعتان يُقرأ فيهما بعد الحمد التوحيد، ثم التسليم والدعاء «إلهي تعرّض لك في هذا الليل المتعرّضون…».", ids: ["f_shaf"] },
  { t: "ركعة الوتر", d: "ركعة واحدة: الحمد والتوحيد، ثم ارفع يديك للقنوت، وأطِل فيه ما استطعت.", ids: ["d_watr_istighfar"] },
  { t: "قنوت الوتر: الاستغفار", d: "«أستغفر الله ربي وأتوب إليه» سبعين مرة.", ids: ["d_watr_istighfar"], count: 70, cl: "أستغفر الله ربي وأتوب إليه" },
  { t: "قنوت الوتر: الاستجارة", d: "«هذا مقام العائذ بك من النار» سبع مرات.", ids: [], count: 7, cl: "هذا مقام العائذ بك من النار" },
  { t: "قنوت الوتر: العفو", d: "«العفو» ثلاثمائة مرة.", ids: [], count: 300, cl: "العفو" },
  { t: "قنوت الوتر: الدعاء للمؤمنين", d: "ادعُ لأربعين مؤمنًا فأكثر بأسمائهم، تعدّهم واحدًا واحدًا.", ids: [], count: 40, cl: "اللهم اغفر لفلان" },
  { t: "إتمام الوتر", d: "ثم الركوع والسجود والتشهد والتسليم، وبعده تسبيح الزهراء عليها السلام.", ids: [], zahra: true },
  { t: "بعد الفراغ من صلاة الليل", d: "الدعاء بما كان يدعو به الإمام زين العابدين عليه السلام بعد صلاة الليل، ثم ما شئت من الدعاء.", ids: ["f_after_layl"] },
];
const guide = { i: 0, n: 0 };
function openGuide() { guide.i = 0; drawGuide(); $("#guideDialog").showModal(); }
function drawGuide() {
  const st = LAYL_STEPS[guide.i];
  guide.n = 0;
  const target = st.zahra ? 0 : st.count || 0;
  $("#gTitle").textContent = `صلاة الليل — ${ar(guide.i + 1)} من ${ar(LAYL_STEPS.length)}`;
  const links = st.ids.map(itemById).filter((e) => e && e.it.text).map((e) => `<button type="button" class="read-btn" data-gtext="${esc(e.it.text)}" data-gitem="${esc(e.it.id)}">📖 ${esc(e.it.title.slice(0, 45))}</button>`).join("");
  $("#gBody").innerHTML = `<div class="g-dots">${LAYL_STEPS.map((_, k) => `<i class="${k < guide.i ? "done" : k === guide.i ? "cur" : ""}"></i>`).join("")}</div>
    <h3>${esc(st.t)}</h3><p>${esc(st.d)}</p>${links ? `<div class="g-links">${links}</div>` : ""}
    ${target || st.zahra ? `<div class="g-counter"><button type="button" class="tb-btn" id="gTap"><b id="gN">٠</b><small id="gT"></small></button><div class="g-cl" id="gCl"></div></div>` : ""}`;
  if (st.zahra) { guide.seq = ZAHRA; guide.step = 0; } else guide.seq = null;
  const draw = () => {
    const tg = guide.seq ? guide.seq[guide.step][0] : target;
    $("#gN").textContent = ar(guide.n);
    $("#gT").textContent = `من ${ar(tg)}`;
    $("#gCl").textContent = guide.seq ? `${guide.seq[guide.step][1]} (${ar(guide.step + 1)}/٣)` : st.cl || "";
    $("#gTap").classList.toggle("full", guide.n >= tg && (!guide.seq || guide.step === 2));
  };
  const tap = $("#gTap");
  if (tap) {
    draw();
    tap.onclick = () => {
      const tg = guide.seq ? guide.seq[guide.step][0] : target;
      if (guide.n >= tg && (!guide.seq || guide.step === 2)) return;
      guide.n++;
      if (guide.n === tg) {
        navigator.vibrate?.(150);
        if (guide.seq && guide.step < 2) { beep(660); guide.step++; guide.n = 0; }
        else { beep(880); setTimeout(() => beep(1175), 160); }
      }
      draw();
    };
  }
  $("#gBody").querySelectorAll("[data-gtext]").forEach((b) => (b.onclick = () => openText(b.dataset.gtext, null, b.dataset.gitem, dateKey(today()))));
  $("#gPrev").disabled = guide.i === 0;
  const last = guide.i === LAYL_STEPS.length - 1;
  $("#gNext").textContent = last ? "✓ أتممت صلاة الليل" : "التالي ←";
}
function bindGuide() {
  $("#gPrev").onclick = () => { if (guide.i > 0) { guide.i--; drawGuide(); } };
  $("#gNext").onclick = () => {
    if (guide.i < LAYL_STEPS.length - 1) { guide.i++; drawGuide(); return; }
    // صلاة الليل تُحسب لليوم الذي بدأ ليله (قبل الفجر تُحسب لأمس)
    const cp = currentPeriod();
    const day = cp && cp.key === "night" && new Date() < cp.times.fajr ? addDays(today(), -1) : today();
    if (!store.isDone(day, "d_layl")) store.toggle(day, "d_layl");
    $("#guideDialog").close(); renderTab();
    toast("تقبّل الله صلاتك، وأُشير إليها بأنها تمّت");
  };
  $("#guideDialog").addEventListener("keydown", (e) => {
    if (e.key === " " && $("#gTap")) { e.preventDefault(); $("#gTap").click(); }
    if (e.key === "ArrowLeft") $("#gNext").click();
    if (e.key === "ArrowRight") $("#gPrev").click();
  });
}

/* ---------- القبلة ---------- */
const KAABA = { lat: 21.4225, lng: 39.8262 };
function qiblaOf(c) {
  const f1 = rad(c.lat), f2 = rad(KAABA.lat), dl = rad(KAABA.lng - c.lng);
  const bearing = fixA(deg(Math.atan2(Math.sin(dl), Math.cos(f1) * Math.tan(f2) - Math.sin(f1) * Math.cos(dl))));
  const a = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  const km = 6371 * 2 * Math.asin(Math.sqrt(a));
  return { bearing, km };
}
const DIRS = ["الشمال", "الشمال الشرقي", "الشرق", "الجنوب الشرقي", "الجنوب", "الجنوب الغربي", "الغرب", "الشمال الغربي"];
function qiblaHTML(big = false) {
  const c = store.settings.city;
  if (!c) return "";
  const { bearing, km } = qiblaOf(c);
  const dir = DIRS[Math.round(bearing / 45) % 8];
  const arrow = `<svg class="qibla-dial" viewBox="0 0 100 100" width="${big ? 120 : 46}" height="${big ? 120 : 46}" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>
    <text x="50" y="16" text-anchor="middle" font-size="12" fill="currentColor">ش</text>
    <g transform="rotate(${bearing.toFixed(1)} 50 50)"><path d="M50 12 L58 52 L50 46 L42 52 Z" fill="currentColor"/><rect x="44" y="6" width="12" height="10" rx="2" fill="currentColor"/></g></svg>`;
  if (km < 1) return `<div class="qibla">🕋 أنت عند الكعبة المشرفة</div>`;
  return `<div class="qibla ${big ? "big" : ""}">${arrow}<div><b>القبلة: ${ar(Math.round(bearing))}° من الشمال</b><small>نحو ${dir} · ${ar(Math.round(km).toLocaleString("en"))} كم إلى مكة المكرمة</small>
    ${big ? `<small>وجّه أعلى الدائرة إلى الشمال (بالبوصلة أو بخريطة الهاتف)، فيشير السهم إلى القبلة.</small>` : ""}</div></div>`;
}
/* ---------- وضع شهر رمضان ---------- */
function ramadanHTML(cp, nowD) {
  if (hijri(today()).m !== 9 && hijri(addDays(today(), 1)).m !== 9) return "";
  const N = prayerTimes(addDays(today(), 1));
  const mins = Number(store.settings.imsakMinutes ?? 10) * 60e3;
  const imsakToday = new Date(cp.times.fajr - mins), imsakTom = new Date(N.fajr - mins);
  const inMonth = hijri(today()).m === 9;
  let label, at;
  if (inMonth && nowD >= cp.times.fajr && nowD < cp.times.maghrib) { label = "بقي على الإفطار"; at = cp.times.maghrib; }
  else if (nowD < imsakToday && inMonth) { label = "بقي على الإمساك"; at = imsakToday; }
  else if (hijri(addDays(today(), 1)).m === 9) { label = "بقي على الإمساك"; at = imsakTom; }
  return `<div class="ramadan-band">🌙 <b>شهر رمضان</b> · الإمساك ${hm(nowD < imsakToday ? imsakToday : imsakTom)} · الإفطار ${hm(cp.times.maghrib)}
    ${at ? ` · ${label}: <b id="ramCountdown" data-at="${at.getTime()}">${hms(at - nowD)}</b>` : ""}</div>`;
}

/* ====================== تبويب: أدعيتي ====================== */
function renderMine() {
  const sec = $("#tab-mine");
  const d = today();
  const s = store.settings;
  let html = "";
  // الورد اليومي
  const wird = (s.wird || []).map(itemById).filter(Boolean);
  const st = dayStats(d, "common");
  html += `<div class="group"><div class="group-head"><span class="ico">📿</span><h3>وردي اليومي</h3>
    ${wird.length ? `<span class="count">${ar(st.done)}/${ar(st.total)}</span>` : ""}
    <button class="link-btn" id="mineWird">✎ ${wird.length ? "تعديل" : "اختيار الأعمال"}</button></div>`;
  if (wird.length) {
    html += `<div class="progress-in"><div class="bar"><i style="width:${st.pct}%"></i></div></div>`;
    // مرتبة حسب أوقات اليوم
    for (const g of DATA.daily) {
      const its = g.items.filter((it) => s.wird.includes(it.id));
      if (its.length) html += `<div class="kind-head">${g.icon} ${esc(g.title)}</div>` + its.map((it) => itemHTML(it, d)).join("");
    }
  } else {
    html += `<p class="empty-note">لم تختر وردك بعد. اختر الأعمال التي تلتزم بها كل يوم، فيُحسب الإنجاز عليها وحدها، وتظهر هنا مرتبة حسب أوقات اليوم.</p>`;
  }
  html += `</div>`;
  html += qadaHTML();
  // المفضلة
  const favs = (s.favs || []).map(itemById).filter(Boolean);
  html += `<div class="group"><div class="group-head"><span class="ico">★</span><h3>المفضلة</h3><span class="count">${ar(favs.length)}</span></div>`;
  html += favs.length
    ? favs.map((e) => itemHTML(e.it, d, false).replace('<div class="item-main">', `<div class="item-main"><div class="search-where">${esc(e.where)}</div>`)).join("")
    : `<p class="empty-note">اضغط النجمة ☆ بجانب أي دعاء أو عمل لإضافته إلى هنا.</p>`;
  html += `</div>`;
  // آخر ما قرأت
  const last = (s.lastRead || []).map((r) => ({ e: itemById(r.id), t: r.t })).filter((x) => x.e);
  if (last.length) {
    html += `<div class="group"><div class="group-head"><span class="ico">📖</span><h3>آخر ما قرأت</h3>
      <button class="link-btn" id="clearLast">مسح</button></div>` +
      last.map(({ e, t }) => itemHTML(e.it, d, false).replace('<div class="item-main">', `<div class="item-main"><div class="search-where">${esc(e.where)} · ${agoText(t)}</div>`)).join("") + `</div>`;
  }
  sec.innerHTML = html;
  bindQada(sec);
  $("#mineWird", sec).onclick = () => { state.wirdEdit = true; setTab("daily"); };
  const cl = $("#clearLast", sec);
  if (cl) cl.onclick = () => { s.lastRead = []; saveSettings(); renderMine(); };
}
/* ====================== تبويب: المكتبة ====================== */
const TOPICS = [
  ["الصلوات المستحبة وطريقتها", "🕌", null],
  ["الرزق وقضاء الدين", "💰", /رزق|الغني|الفقر|السوق|التجار|الدين|دين/],
  ["قضاء الحوائج", "🤲", /حاج|حوائج|المهم/],
  ["الشفاء والعافية", "🌿", /شفاء|مرض|وجع|الحمي|المريض|سقم|عافيه|العافيه|العله/],
  ["الأمان والحرز", "🛡️", /خوف|المخوف|عدو|ظالم|السلطان|حرز|عوذه|تعويذ|استعاذ|الامان/],
  ["المغفرة والتوبة", "💧", /غفر|توب|التوبه|استغفار|الذنوب|العفو/],
  ["الاستخارة", "🧭", /استخار|خيره/],
  ["الوالدان والأهل والذرية", "👪", /والدي|للوالدين|الوالدين|الولد|الذريه|الحمل|الزواج|التزويج|الاهل|العيال/],
  ["السفر", "🧳", /سفر|المسافر|الراكب|الدابه|السفينه|الارتحال/],
  ["الحفظ والعلم", "📚", /الحفظ|الذكاء|العلم|النسيان|نسيان|التعلم/],
  ["الموتى والقبور", "🕯️", /الميت|الموتي|القبر|القبور|الجنازه|للميت/],
  ["الزيارات", "🕋", /زياره/],
];
const libState = { sel: null, limit: 200 };
let libIndex = null;
function buildLib() {
  searchIndex ||= buildSearchIndex();
  const byId = new Map();
  for (const e of searchIndex) if (!byId.has(e.it.id)) byId.set(e.it.id, e);
  const all = [...byId.values()];
  const lib = {};
  for (const [, n] of BOOKS) lib["b:" + n] = all.filter((e) => booksOf(e.it.src).includes(n));
  lib["t:" + TOPICS[0][0]] = all.filter((e) => HOWTO[e.it.id]);
  for (const [n, , re] of TOPICS.slice(1)) lib["t:" + n] = all.filter((e) => re.test(e.head));
  return lib;
}
function renderLibrary() {
  libIndex ||= buildLib();
  const sec = $("#tab-library");
  const d = today();
  if (libState.sel && libIndex[libState.sel]) {
    const list = libIndex[libState.sel];
    const name = libState.sel.slice(2);
    let html = `<div class="lib-head"><button class="primary-btn ghost" data-lib="">→ المكتبة</button><h2>${esc(name)}</h2><span class="count">${ar(list.length)}</span></div>`;
    html += `<div class="group">${list.slice(0, libState.limit).map((e) => itemHTML(e.it, d, false).replace('<div class="item-main">', `<div class="item-main"><div class="search-where">${esc(e.where)}</div>`)).join("")}</div>`;
    if (list.length > libState.limit) html += `<button class="primary-btn ghost wide" id="libMore">عرض المزيد (${ar(list.length - libState.limit)})</button>`;
    sec.innerHTML = html;
    const m = $("#libMore", sec);
    if (m) m.onclick = () => { libState.limit += 200; renderLibrary(); };
    return;
  }
  libState.sel = null; libState.limit = 200;
  const card = (key, icon, name) => `<button class="lib-card" data-lib="${esc(key)}"><span class="ico">${icon}</span><b>${esc(name)}</b><small>عدد الأعمال: ${ar(libIndex[key].length)}</small></button>`;
  let html = `<div class="section-title" style="margin-top:0">حسب الموضوع</div><div class="lib-grid">${TOPICS.map(([n, i]) => card("t:" + n, i, n)).join("")}</div>`;
  html += `<div class="section-title">حسب الكتاب</div><div class="lib-grid">${BOOKS.map(([, n]) => card("b:" + n, "📖", n)).filter((x, i) => libIndex["b:" + BOOKS[i][1]].length).join("")}</div>`;
  html += `<p class="note">تصنيف المواضيع آلي من عناوين الأعمال وأوصافها، فقد يفوته بعضها. للبحث الدقيق في النصوص استعمل خانة البحث.</p>`;
  sec.innerHTML = html;
}

/* ---------- قضاء الفوائت ---------- */
const QADA = [["fajr", "الصبح"], ["dhuhr", "الظهر"], ["asr", "العصر"], ["maghrib", "المغرب"], ["isha", "العشاء"], ["fast", "الصيام (أيام)"], ["ayat", "صلاة الآيات"]];
function qadaHTML() {
  const q = store.settings.qada || {};
  const left = QADA.reduce((a, [k]) => a + (+q[k] || 0), 0);
  const done = +q.done || 0;
  return `<details class="group fold" data-key="grp:qada" ${openSet.has("grp:qada") ? "open" : ""}><summary class="group-head"><span class="ico">⏳</span><h3>قضاء الفوائت</h3>
    <span class="count">${left ? `المتبقي ${ar(left)}` : "لا شيء"}${done ? ` · قضيت ${ar(done)}` : ""}</span><span class="chev">▾</span></summary>
    <p class="empty-note" style="padding-bottom:0">اكتب عدد ما عليك من كل صلاة، واضغط «قضيت» كلما قضيت واحدة.</p>
    ${QADA.map(([k, n]) => `<div class="qada-row"><b>${n}</b><input type="number" min="0" data-qset="${k}" value="${+q[k] || 0}">
      <button class="primary-btn" data-qdone="${k}" ${+q[k] ? "" : "disabled"}>✓ قضيت واحدة</button></div>`).join("")}</details>`;
}
function bindQada(sec) {
  const q = (store.settings.qada = { ...(store.settings.qada || {}) });
  sec.querySelectorAll("[data-qset]").forEach((i) => (i.onchange = () => { q[i.dataset.qset] = Math.max(0, parseInt(i.value, 10) || 0); saveSettings(); renderTab(); }));
  sec.querySelectorAll("[data-qdone]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.qdone;
    if (!(+q[k] > 0)) return;
    q[k] = +q[k] - 1; q.done = (+q.done || 0) + 1; saveSettings(); renderTab();
    toast(q[k] ? `تقبّل الله، بقي ${ar(q[k])}` : "تقبّل الله، أتممت هذا القضاء");
  }));
  bindDetails(sec);
}

function agoText(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${ar(m)} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${ar(h)} ساعة`;
  return `قبل ${ar(Math.round(h / 24))} يوم`;
}
const openSet = new Set();

/* ====================== تبويب: الشهر الهجري ====================== */
function renderMonth() {
  const sel = state.date;
  const { start, len, y, m } = hijriMonth(sel);
  const order = [6, 0, 1, 2, 3, 4, 5]; // يبدأ الأسبوع بالسبت
  let html = `<div class="month-head">
    <button class="icon-btn" id="mPrev" title="الشهر السابق">→</button>
    <h2>${monthName(m)} ${ar(y)}هـ</h2>
    <button class="icon-btn" id="mNext" title="الشهر التالي">←</button></div>`;
  {
    const uqS = uqStart(y, m, start);
    const opts = [-1, 0, 1].map((k) => addDays(uqS, k));
    const cur = dateKey(start);
    const has = (store.settings.monthStarts || {})[ymKey(y, m)];
    html += `<div class="hilal-bar"><span>🌙 أول الشهر حسب ثبوت الهلال:</span>
      <div class="seg" id="hilalSeg">${opts.map((o, i) => `<button data-v="${dateKey(o)}" class="${dateKey(o) === cur ? "on" : ""}">${WEEKDAYS[o.getDay()]} ${ar(o.getDate())} ${GREG_MONTHS[o.getMonth()]}${i === 1 ? " (أم القرى)" : ""}</button>`).join("")}</div>
      ${has ? `<small>معدَّل يدويًا</small>` : ""}</div>`;
  }
  html += `<div class="cal">`;
  html += order.map((w) => `<div class="wd">${WEEKDAYS[w]}</div>`).join("");
  const lead = order.indexOf(start.getDay());
  for (let i = 0; i < lead; i++) html += `<div class="cell blank"></div>`;
  const now = today();
  for (let i = 0; i < len; i++) {
    const d = addDays(start, i);
    const evs = eventsFor(d).filter((e) => e.kind !== "plain");
    const kind = evs[0]?.kind || "";
    const isPast = d <= now;
    const pct = isPast ? dayStats(d).pct : 0;
    html += `<button class="cell ${kind ? "k-" + kind : ""} ${sameDay(d, now) ? "today" : ""} ${sameDay(d, sel) ? "sel" : ""}" data-date="${dateKey(d)}">
      <span class="hd">${ar(i + 1)}</span><span class="gd">${ar(d.getDate())} ${GREG_MONTHS[d.getMonth()]}</span>
      <span class="ev">${esc(evs.map((e) => e.title.split("—")[0]).join("، "))}</span>
      ${isPast ? `<span class="pr"><i style="width:${pct}%"></i></span>` : ""}</button>`;
  }
  html += `</div>`;
  const mo = DATA.months[m];
  if (mo?.general?.length) {
    html += `<div class="section-title">أعمال عامة في ${esc(mo.name)}</div><div class="group">${mo.general.map((it) => itemHTML(it, sel, false)).join("")}</div>`;
  }
  const evList = Object.entries(mo?.days || {}).filter(([, e]) => e.kind !== "plain").sort((a, b) => (a[0] === "last" ? 31 : +a[0]) - (b[0] === "last" ? 31 : +b[0]));
  if (evList.length) {
    html += `<div class="section-title">مناسبات ${esc(mo.name)}</div><div class="group">` +
      evList.map(([k, e]) => `<div class="ev-row" data-day="${k}"><span class="kdot ${e.kind}"></span>
        <div class="ev-when"><b>${k === "last" ? "آخر الشهر" : ar(k) + " " + esc(mo.name)}</b></div><div class="ev-title">${esc(e.title)}</div></div>`).join("") + `</div>`;
  }
  const t = $("#tab-month");
  t.innerHTML = html;
  t.querySelectorAll("#hilalSeg button").forEach((b) => (b.onclick = () => {
    const ms = store.settings.monthStarts = { ...(store.settings.monthStarts || {}) };
    const uqS = dateKey(uqStart(y, m, start));
    if (b.dataset.v === uqS) delete ms[ymKey(y, m)]; else ms[ymKey(y, m)] = b.dataset.v;
    saveSettings(); clearHijri(); searchIndex = null;
    setDate(new Date(b.dataset.v + "T12:00"));
    const prevLen = daysBetween(new Date(b.dataset.v + "T12:00"), hijriMonth(addDays(new Date(b.dataset.v + "T12:00"), -1)).start);
    if (prevLen > 30 || prevLen < 29) toast(`تنبيه: صار الشهر السابق ${ar(prevLen)} يومًا، فعدّل أوله أيضًا`);
    else toast(`أول ${monthName(m)}: ${b.textContent.replace(" (أم القرى)", "")}`);
  }));
  $("#mPrev", t).onclick = () => setDate(addDays(start, -1));
  $("#mNext", t).onclick = () => setDate(addDays(start, len));
  t.querySelectorAll(".cell[data-date]").forEach((c) => (c.onclick = () => { setDate(new Date(c.dataset.date + "T12:00")); setTab("today"); }));
  t.querySelectorAll(".ev-row[data-day]").forEach((r) => (r.onclick = () => {
    const k = r.dataset.day;
    setDate(addDays(start, k === "last" ? len - 1 : +k - 1)); setTab("today");
  }));
}

/* ====================== تبويب: المناسبات القادمة ====================== */
function renderEvents() {
  const now = today();
  const rows = [];
  for (let i = 0; i <= 370; i++) {
    const d = addDays(now, i);
    for (const ev of eventsFor(d)) if (ev.kind !== "plain") rows.push({ d, ev, i });
  }
  let html = `<div class="section-title" style="margin-top:0">المناسبات خلال السنة القادمة</div><div class="group">`;
  html += rows.map(({ d, ev, i }) => {
    const h = hijri(d);
    const left = i === 0 ? "اليوم" : i === 1 ? "غداً" : `بعد ${ar(i)} يوماً`;
    return `<div class="ev-row" data-date="${dateKey(d)}"><span class="kdot ${ev.kind}"></span>
      <div class="ev-when"><b>${ar(h.d)} ${monthName(h.m)}</b>${WEEKDAYS[d.getDay()]} ${ar(d.getDate())}/${ar(d.getMonth() + 1)}</div>
      <div class="ev-title">${esc(ev.title)}</div><span class="ev-left ${i <= 7 ? "soon" : ""}">${left}</span></div>`;
  }).join("");
  html += `</div><p class="note">التواريخ محسوبة بتقويم أم القرى، ويمكن تعديل أول كل شهر حسب ثبوت الهلال من تبويب «الشهر الهجري».</p>
    <button class="primary-btn ghost" id="icsBtn">📅 تصدير المناسبات إلى تقويم Outlook أو Google (ملف ‎.ics)</button>`;
  const t = $("#tab-events");
  t.innerHTML = html;
  $("#icsBtn", t).onclick = () => exportICS(rows);
  t.querySelectorAll(".ev-row").forEach((r) => (r.onclick = () => { setDate(new Date(r.dataset.date + "T12:00")); setTab("today"); }));
}

function exportICS(rows) {
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const escI = (x) => String(x).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AlAamal//Mustahabbat//AR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:المناسبات الدينية"];
  for (const { d, ev } of rows) {
    const h = hijri(d);
    lines.push("BEGIN:VEVENT", `UID:${dt(d)}-${Math.abs([...ev.title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}@alaamal`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dt(d)}`, `DTEND;VALUE=DATE:${dt(addDays(d, 1))}`,
      `SUMMARY:${escI(ev.title)}`, `DESCRIPTION:${escI(`${h.d} ${monthName(h.m)} ${h.y}هـ`)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "المناسبات-الدينية.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("حُفظ ملف التقويم في التنزيلات، افتحه لإضافته إلى تقويمك");
}

/* ====================== تبويب: الإنجاز ====================== */
function renderStats() {
  const now = today();
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = addDays(now, -i); days.push({ d, ...dayStats(d) }); }
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].done > 0) streak++;
    else if (i === days.length - 1) continue; // اليوم لم يبدأ بعد لا يقطع السلسلة
    else break;
  }
  const active = days.filter((x) => x.done > 0);
  const avg = active.length ? Math.round(active.reduce((s, x) => s + x.pct, 0) / active.length) : 0;
  const totalDone = Object.values(store.progress).reduce((s, l) => s + l.length, 0);

  // أكثر الأعمال اليومية مواظبة
  const counts = [];
  for (const g of DATA.daily) for (const it of g.items) {
    const c = days.filter((x) => store.isDone(x.d, it.id)).length;
    counts.push({ it, c });
  }
  counts.sort((a, b) => b.c - a.c);
  counts.splice(30);

  let html = `<div class="stat-grid">
    <div class="stat"><div class="v">${ar(days[29].pct)}٪</div><div class="l">إنجاز اليوم</div></div>
    <div class="stat"><div class="v">${ar(streak)}</div><div class="l">أيام متتالية من المواظبة</div></div>
    <div class="stat"><div class="v">${ar(avg)}٪</div><div class="l">متوسط أيامك النشطة (٣٠ يوماً)</div></div>
    <div class="stat"><div class="v">${ar(totalDone)}</div><div class="l">مجموع الأعمال المنجزة</div></div></div>`;
  html += `<div class="group"><div class="group-head"><span class="ico">📈</span><h3>آخر ٣٠ يوماً</h3></div>
    <div class="chart">${days.map((x) => `<div class="col" title="${dateKey(x.d)}: ${x.pct}%"><i class="${x.pct ? "" : "zero"}" style="height:${Math.max(x.pct, 1)}%"></i></div>`).join("")}</div>
    <div class="chart-labels">${days.map((x, i) => `<span>${i % 5 === 4 || i === 29 ? ar(x.d.getDate()) : ""}</span>`).join("")}</div></div>`;
  html += `<div class="group top-list"><div class="group-head"><span class="ico">🏅</span><h3>المواظبة على الأعمال اليومية (آخر ٣٠ يوماً)</h3></div>
    ${counts.map(({ it, c }) => `<div class="item"><div class="item-main"><div class="item-title">${esc(it.title)}</div></div>
      <div class="minibar"><div class="bar"><i style="width:${Math.round((c / 30) * 100)}%"></i></div></div>
      <span class="badge">${ar(c)} يوماً</span></div>`).join("")}</div>`;
  $("#tab-stats").innerHTML = html;
}

/* ====================== تبويب: الإعدادات ====================== */
function seg(name, options, current) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(current) ? "on" : ""}">${l}</button>`).join("")}</div>`;
}
function switchHTML(name, on, disabled = false) {
  return `<label class="switch"><input type="checkbox" data-sw="${name}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""}><span></span></label>`;
}
function renderSettings() {
  const s = store.settings;
  const h = hijri(today());
  const srv = store.server;
  let html = `<div class="group"><div class="group-head"><span class="ico">🎨</span><h3>المظهر</h3></div>
    <div class="set-row"><div class="lbl"><b>السمة</b></div>${seg("theme", [["light", "فاتح"], ["dark", "داكن"], ["auto", "حسب النظام"]], s.theme)}</div>
    <div class="set-row"><div class="lbl"><b>حجم الخط</b></div>${seg("fontScale", [[0.9, "صغير"], [1, "متوسط"], [1.15, "كبير"], [1.3, "أكبر"]], s.fontScale)}</div>
    <div class="set-row"><div class="lbl"><b>نظام الساعة</b><small>لأوقات الصلاة والساعة والتنبيهات</small></div>${seg("clockFormat", [[12, "١٢ ساعة (ص/م)"], [24, "٢٤ ساعة"]], s.clockFormat ?? 12)}</div></div>`;
  html += `<div class="group"><div class="group-head"><span class="ico">🌙</span><h3>التقويم الهجري</h3></div>
    <div class="set-row"><div class="lbl"><b>تعديل التاريخ الهجري</b><small>اليوم حسب الإعداد الحالي: ${hijriText(h)}</small></div>
    ${seg("hijriOffset", [[-2, "−٢"], [-1, "−١"], [0, "أم القرى"], [1, "+١"], [2, "+٢"]], s.hijriOffset)}</div></div>`;
  const pt = prayerTimes(today());
  html += `<div class="group"><div class="group-head"><span class="ico">🕌</span><h3>أوقات الصلاة</h3></div>
    <div class="set-row"><div class="lbl"><b>المدينة</b><small>${pt ? `اليوم: الفجر ${hm(pt.fajr)} · الظهر ${hm(pt.dhuhr)} · المغرب ${hm(pt.maghrib)} · منتصف الليل ${hm(pt.midnight)}` : "لحساب أوقات الصلاة وترتيب أعمال الوقت"}</small></div>${cityPickerHTML("setCity")}</div>
    <div class="set-row"><div class="lbl"><b>مدينة أخرى (بالإحداثيات)</b><small>خط العرض وخط الطول، مثل: 26.52 و 50.01</small></div>
      <div style="display:flex;gap:6px"><input class="coord" id="cLat" placeholder="العرض" value="${s.city ? s.city.lat : ""}"><input class="coord" id="cLng" placeholder="الطول" value="${s.city ? s.city.lng : ""}"><button class="read-btn" id="cSave">حفظ</button></div></div>
    <div class="set-row"><div class="lbl"><b>تنبيه قبل الأذان</b><small>الفجر والظهر والمغرب، مع أعمال ذلك الوقت</small></div>${switchHTML("prayerNotify", s.prayerNotify, !srv || !s.city)}</div>
    <div class="set-row"><div class="lbl"><b>قبل الأذان بـ</b></div>${seg("prayerBefore", [[0, "عند الأذان"], [5, "٥ د"], [10, "١٠ د"], [15, "١٥ د"], [30, "٣٠ د"]], s.prayerBefore)}</div>
    <p class="note" style="padding:0 18px 12px">الحساب على الطريقة الجعفرية: الفجر بزاوية ١٦°، والمغرب عند ذهاب الحمرة المشرقية (٤°)، ومنتصف الليل بين الغروب والفجر. تُعرض الأوقات بتوقيت المدينة المختارة، وتأتي التنبيهات بتوقيت جهازك. قد يختلف الوقت دقيقة أو دقيقتين عن التقويم المحلي، وفي البلاد الشمالية البعيدة (فوق ٤٨° تقريبًا) قد لا يغيب الشفق صيفًا فيكون وقت الفجر ومنتصف الليل تقريبيًا.</p></div>`;
  if (s.city) html += `<div class="group"><div class="group-head"><span class="ico">🕋</span><h3>اتجاه القبلة — ${esc(s.city.name)}</h3></div><div style="padding:14px 18px">${qiblaHTML(true)}</div></div>`;
  html += `<div class="group"><div class="group-head"><span class="ico">🌙</span><h3>شهر رمضان</h3></div>
    <div class="set-row"><div class="lbl"><b>الإمساك قبل الفجر بـ</b><small>يظهر في «الآن» طوال الشهر مع العدّ للإفطار والإمساك</small></div>${seg("imsakMinutes", [[0, "عند الفجر"], [5, "٥ د"], [10, "١٠ د"], [15, "١٥ د"]], s.imsakMinutes ?? 10)}</div></div>`;
  html += profilesHTML() + personalHTML();
  html += `<div class="group"><div class="group-head"><span class="ico">🔔</span><h3>التنبيهات وبدء التشغيل</h3></div>
    <div class="set-row"><div class="lbl"><b>صوت الأذان عند دخول الوقت</b><small>ضع ملف الأذان باسم adhan.mp3 أو adhan.wav في مجلد data داخل مجلد البرنامج</small></div>${switchHTML("adhanSound", s.adhanSound, !srv || !s.city)}</div>
    <div class="set-row"><div class="lbl"><b>تشغيل البرنامج مع ويندوز</b><small>يبقى بجانب الساعة ليُظهر التنبيهات</small></div>${switchHTML("autostart", s.autostart, !srv)}</div>
    <div class="set-row"><div class="lbl"><b>تنبيه بأعمال اليوم</b><small>إشعار من ويندوز بالمناسبة وأعمال اليوم</small></div>${switchHTML("notify", s.notify, !srv)}</div>
    <div class="set-row"><div class="lbl"><b>وقت تنبيه الصباح</b><small>أعمال اليوم ومناسبته</small></div><input type="time" data-time="morningTime" value="${esc(s.morningTime)}" ${!srv || !s.notify ? "disabled" : ""}></div>
    <div class="set-row"><div class="lbl"><b>وقت تنبيه المساء</b><small>أعمال الليلة (ليلة الجمعة، ليالي المناسبات)</small></div><input type="time" data-time="eveningTime" value="${esc(s.eveningTime)}" ${!srv || !s.notify ? "disabled" : ""}></div>
    ${srv ? "" : `<p class="note" style="padding:0 18px 12px">التنبيهات متاحة عند تشغيل البرنامج من ملف «الغياث.exe».</p>`}</div>`;
  html += `<div class="group"><div class="group-head"><span class="ico">💾</span><h3>البيانات</h3></div>
    <div class="set-row"><div class="lbl"><b>نسخة احتياطية من سجل الإنجاز</b><small>${srv ? "يُحفظ السجل تلقائياً في مجلد البرنامج (data)" : "يُحفظ السجل في هذا المتصفح"}</small></div>
    <div style="display:flex;gap:8px"><button class="read-btn" id="exportBtn">تصدير</button><button class="read-btn" id="importBtn">استيراد</button>
    <input type="file" id="importFile" accept=".json" hidden></div></div></div>
    <p class="note">${esc(DATA.meta.note)}</p>`;
  html += `<div class="group"><div class="group-head"><span class="ico">⬇️</span><h3>تحديث المحتوى</h3></div>
    <div class="set-row"><div class="lbl"><b>رابط ملف التحديث</b><small>رابط ملف manifest.json لنسخة المحتوى المنشورة (مثلًا على GitHub). يُنزَّل منه المحتوى الجديد وتُحفظ نسخة من القديم.</small></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><input id="updUrl" class="upd-url" dir="ltr" placeholder="https://…/manifest.json" value="${esc(s.updateUrl || "")}"><button class="read-btn" id="updSave">حفظ</button><button class="read-btn" id="updRun" ${!srv ? "disabled" : ""}>تحديث الآن</button></div></div>
    <p class="note" style="padding:0 18px 12px">إصدار المحتوى الحالي: ${esc(String(DATA.meta.version))}</p></div>`;
  const reps = s.reports || [];
  html += `<div class="group"><div class="group-head"><span class="ico">⚑</span><h3>ملاحظاتي على النصوص</h3><span class="count">${ar(reps.length)}</span>
    ${reps.length ? `<button class="link-btn" id="repCopy">نسخ الكل</button>` : ""}</div>
    ${reps.length ? reps.map((r, i) => `<div class="item"><div class="item-main"><div class="item-title">${esc(r.title)}</div><div class="item-desc">${esc(r.note)}</div><div class="item-src">${agoText(r.t)}</div></div><button class="read-btn" data-repdel="${i}">حذف</button></div>`).join("")
      : `<p class="empty-note">إذا وجدت خطأ في نص فاضغط «⚑ خطأ؟» في نافذة النص، وتُجمع ملاحظاتك هنا لترسلها أو لأصلحها لك.</p>`}</div>`;
  const t = $("#tab-settings");
  t.innerHTML = html;

  t.querySelectorAll("[data-seg]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const name = g.dataset.seg;
    s[name] = name === "theme" ? b.dataset.v : Number(b.dataset.v);
    store.save("settings");
    if (name === "hijriOffset") clearHijri();
    applyLook(); renderHeader(); renderSettings();
  })));
  t.querySelectorAll("[data-sw]").forEach((c) => (c.onchange = () => { s[c.dataset.sw] = c.checked; store.save("settings"); renderSettings(); }));
  bindCityPicker($("#setCity", t), renderSettings);
  bindProfiles(t); bindPersonal(t);
  const uu = $("#updUrl", t);
  if (uu) {
    $("#updSave", t).onclick = () => { s.updateUrl = uu.value.trim(); saveSettings(); toast("حُفظ الرابط"); };
    $("#updRun", t).onclick = () => runUpdate();
  }
  $("#cSave", t).onclick = () => {
    const lat = parseFloat($("#cLat", t).value), lng = parseFloat($("#cLng", t).value);
    if (!(Math.abs(lat) <= 66 && Math.abs(lng) <= 180)) return toast("إحداثيات غير صحيحة");
    s.city = { name: `الإحداثيات ${lat.toFixed(2)}، ${lng.toFixed(2)}`, lat, lng, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }; tzFmt.clear();
    saveSettings(); renderSettings(); toast("تم الحفظ");
  };
  t.querySelectorAll("[data-time]").forEach((c) => (c.onchange = () => { s[c.dataset.time] = c.value; store.save("settings"); toast("تم الحفظ"); }));
  t.querySelectorAll("[data-repdel]").forEach((b) => (b.onclick = () => { s.reports.splice(+b.dataset.repdel, 1); saveSettings(); renderSettings(); }));
  const rc = $("#repCopy", t);
  if (rc) rc.onclick = async () => {
    const txt = reps.map((r, i) => `${i + 1}. ${r.title}` + "\n" + r.note).join("\n\n");
    try { await navigator.clipboard.writeText(txt); toast("نُسخت الملاحظات"); } catch (e) { toast("تعذّر النسخ"); }
  };
  $("#exportBtn", t).onclick = () => {
    const blob = new Blob([JSON.stringify({ progress: store.progress, favs: s.favs, wird: s.wird, reports: s.reports }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `سجل-الإنجاز-${dateKey(today())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("#importBtn", t).onclick = () => $("#importFile", t).click();
  $("#importFile", t).onchange = async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!data.progress || typeof data.progress !== "object") throw new Error();
      for (const [k, list] of Object.entries(data.progress)) {
        store.progress[k] = [...new Set([...(store.progress[k] || []), ...list])];
      }
      store.save("progress");
      for (const k of ["favs", "wird"]) if (Array.isArray(data[k])) s[k] = [...new Set([...(s[k] || []), ...data[k]])];
      saveSettings();
      toast("تم استيراد السجل ودمجه");
    } catch (err) { toast("الملف غير صالح"); }
  };
}

/* ---------- أفراد العائلة ---------- */
function profilesHTML() {
  const s = store.settings;
  return `<div class="group"><div class="group-head"><span class="ico">👪</span><h3>أفراد العائلة</h3></div>
    <p class="empty-note" style="padding-bottom:4px">لكل فرد سجل إنجازه ووِرده ومفضلته وقضاؤه. الإعدادات العامة (المدينة والمظهر) مشتركة.</p>
    ${s.profiles.map((pf) => `<div class="set-row"><div class="lbl"><b>${esc(pf.name)}${pf.id === s.activeProfile ? " ✓" : ""}</b></div>
      <div style="display:flex;gap:6px">${pf.id === s.activeProfile ? `<span class="badge">الحالي</span>` : `<button class="read-btn" data-pswitch="${pf.id}">التبديل إليه</button>`}
      <button class="read-btn" data-pren="${pf.id}">تسمية</button>${pf.id !== "main" ? `<button class="read-btn" data-pdel="${pf.id}">حذف</button>` : ""}</div></div>`).join("")}
    <div class="set-row"><input id="pName" class="upd-url" placeholder="اسم الفرد الجديد"><button class="read-btn" id="pAdd">＋ إضافة</button></div></div>`;
}
async function switchProfile(id) {
  const s = store.settings;
  if (id === s.activeProfile) return;
  await store.flush("progress");
  s.pdata = { ...(s.pdata || {}) };
  s.pdata[s.activeProfile] = Object.fromEntries(PER_PROFILE.map((k) => [k, s[k]]));
  const nd = s.pdata[id] || {};
  for (const k of PER_PROFILE) s[k] = nd[k] ?? DEFAULT_SETTINGS[k];
  s.activeProfile = id;
  await store.flush("settings");
  store.progress = {};
  try {
    if (store.server) { const r = await fetch(`/api/store/${progressFile()}`, { cache: "no-store" }); if (r.ok) store.progress = await r.json(); }
    else store.progress = JSON.parse(localStorage.getItem(progressFile()) || "{}");
  } catch (e) { /* سجل فارغ */ }
  renderHeader(); renderTab();
  toast(`الآن: ${s.profiles.find((x) => x.id === id)?.name}`);
}
function bindProfiles(t) {
  const s = store.settings;
  t.querySelectorAll("[data-pswitch]").forEach((b) => (b.onclick = () => switchProfile(b.dataset.pswitch)));
  t.querySelectorAll("[data-pren]").forEach((b) => (b.onclick = () => {
    const pf = s.profiles.find((x) => x.id === b.dataset.pren);
    const n = prompt("الاسم الجديد:", pf.name);
    if (n && n.trim()) { pf.name = n.trim().slice(0, 30); saveSettings(); renderSettings(); renderHeader(); }
  }));
  t.querySelectorAll("[data-pdel]").forEach((b) => (b.onclick = () => {
    const pf = s.profiles.find((x) => x.id === b.dataset.pdel);
    if (!confirm(`حذف «${pf.name}» من القائمة؟ (يبقى ملف سجله في مجلد data)`)) return;
    s.profiles = s.profiles.filter((x) => x.id !== pf.id);
    if (s.pdata) delete s.pdata[pf.id];
    saveSettings(); renderSettings(); renderHeader();
  }));
  $("#pAdd", t).onclick = () => {
    const n = $("#pName", t).value.trim();
    if (!n) return toast("اكتب الاسم أولًا");
    s.profiles = [...s.profiles, { id: "p" + Date.now().toString(36).slice(-8), name: n.slice(0, 30) }];
    saveSettings(); renderSettings(); renderHeader();
  };
}
/* ---------- مناسباتي الشخصية ---------- */
function personalHTML() {
  const list = store.settings.personal || [];
  const months = Object.entries(DATA.months).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
  const days = Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${ar(i + 1)}</option>`).join("");
  return `<div class="group"><div class="group-head"><span class="ico">🕯️</span><h3>مناسباتي الشخصية (بالتاريخ الهجري)</h3></div>
    <p class="empty-note" style="padding-bottom:4px">مثل ذكرى وفاة قريب، لتُذكّرك بقراءة الفاتحة والتصدق وصلاة الهدية. تظهر في «أعمال اليوم» والتقويم والمناسبات والتنبيه الصباحي.</p>
    ${list.map((pe, i) => `<div class="set-row"><div class="lbl"><b>${esc(pe.title)}</b><small>${ar(pe.d)} ${esc(monthName(+pe.m))}${pe.note ? " · " + esc(pe.note) : ""}</small></div><button class="read-btn" data-pedel="${i}">حذف</button></div>`).join("")}
    <div class="set-row personal-form"><input id="peTitle" class="upd-url" placeholder="العنوان، مثل: ذكرى وفاة الوالد"><select id="peDay">${days}</select><select id="peMonth">${months}</select><button class="read-btn" id="peAdd">＋ إضافة</button></div></div>`;
}
function bindPersonal(t) {
  const s = store.settings;
  t.querySelectorAll("[data-pedel]").forEach((b) => (b.onclick = () => { s.personal = s.personal.filter((_, i) => i !== +b.dataset.pedel); saveSettings(); renderSettings(); }));
  $("#peAdd", t).onclick = () => {
    const title = $("#peTitle", t).value.trim();
    if (!title) return toast("اكتب العنوان أولًا");
    s.personal = [...(s.personal || []), { title: title.slice(0, 80), d: +$("#peDay", t).value, m: +$("#peMonth", t).value }];
    saveSettings(); renderSettings(); toast("أُضيفت المناسبة");
  };
}
/* ---------- تحديث المحتوى ---------- */
async function runUpdate() {
  const url = (store.settings.updateUrl || "").trim();
  if (!/^https:\/\//.test(url)) return toast("اكتب رابطًا يبدأ بـ https://");
  toast("جارٍ التحقق من التحديث…");
  try {
    const r = await fetch("/api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || r.status);
    if (j.updated) { toast(`حُدّث المحتوى إلى الإصدار ${j.version}، جارٍ إعادة التحميل`); setTimeout(() => location.reload(), 1500); }
    else toast("المحتوى محدَّث بالفعل");
  } catch (e) { toast("تعذّر التحديث: " + e.message); }
}

/* ====================== المظهر والنوافذ ====================== */
const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
function applyLook() {
  const s = store.settings;
  const theme = s.theme === "auto" ? (darkMQ.matches ? "dark" : "light") : s.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty("--fs", s.fontScale || 1);
}
darkMQ.addEventListener?.("change", applyLook);

/* ---------- عدّاد الأذكار ---------- */
const ZAHRA = [[34, "الله أكبر"], [33, "الحمد لله"], [33, "سبحان الله"]];
const tb = { n: 0, target: 0, seq: null, step: 0, itemId: null, date: null };
function parseCount(s) {
  if (!s || /صلو|ركع|يوم|ليل/.test(s)) return 0;
  const n = parseInt(String(s).replace(/[٠-٩]/g, (c) => AR_DIGITS.indexOf(c)), 10);
  return n >= 3 && n <= 10000 ? n : 0;
}
function tbSet(target, seq = null) {
  Object.assign(tb, { n: 0, target, seq, step: 0 });
  if (seq) tb.target = seq[0][0];
  tbDraw();
}
function tbDraw() {
  $("#tbCount").textContent = ar(tb.n);
  $("#tbTarget").textContent = tb.target ? `من ${ar(tb.target)}` : "بلا حدّ";
  $("#tbLabel").textContent = tb.seq ? `تسبيح الزهراء: ${tb.seq[tb.step][1]} (${ar(tb.step + 1)}/٣)` : "";
  const v = tb.seq ? "z" : String(tb.target);
  document.querySelectorAll("#tbPresets button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  $("#tbBtn").classList.toggle("full", !!tb.target && tb.n >= tb.target);
}
let audioCtx;
function beep(f = 880, ms = 140) {
  try {
    audioCtx ||= new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = f; g.gain.value = 0.08;
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) { /* بلا صوت */ }
}
function tbTap() {
  if (tb.target && tb.n >= tb.target && !tb.seq) return;
  tb.n++;
  if (tb.target && tb.n === tb.target) {
    navigator.vibrate?.(200);
    if (tb.seq && tb.step < tb.seq.length - 1) {
      beep(660); tb.step++; tb.n = 0; tb.target = tb.seq[tb.step][0];
    } else {
      beep(880); setTimeout(() => beep(1175), 160);
      if (tb.seq) tb.n = tb.target;
      if (tb.itemId && !store.isDone(tb.date, tb.itemId)) {
        store.toggle(tb.date, tb.itemId); renderTab();
        toast("اكتمل العدد، وأُشير إلى العمل بأنه تمّ");
      } else toast("اكتمل العدد");
    }
  }
  tbDraw();
}

async function openText(id, altId, itemId = null, dateStr = null) {
  const t = DATA.texts[id];
  if (!t) return;
  if (!t.text && LONG_READY) { toast("جارٍ تحميل النص…"); await LONG_READY; }
  const a = altId ? DATA.texts[altId] : null;
  $("#dlgTitle").textContent = t.title;
  // النجمة وآخر ما قُرئ والعدّاد
  const entry = itemId ? itemById(itemId) : null;
  const it = entry?.it;
  const star = $("#dlgStar");
  star.hidden = !it;
  if (it) {
    star.dataset.fav = it.id;
    star.textContent = isFav(it.id) ? "★" : "☆";
    star.classList.toggle("on", isFav(it.id));
    const lr = (store.settings.lastRead || []).filter((r) => r.id !== it.id);
    lr.unshift({ id: it.id, t: Date.now() });
    store.settings.lastRead = lr.slice(0, 8);
    saveSettings();
  }
  tb.itemId = it?.id || null;
  tb.date = dateStr ? new Date(dateStr + "T12:00") : state.date;
  const isZahra = it && /تسبيح (فاطمة )?الزهراء/.test(stripDiac(it.title));
  const cnt = isZahra ? 0 : parseCount(it?.count);
  if (isZahra) tbSet(0, ZAHRA); else tbSet(cnt);
  $("#tasbih").hidden = !(isZahra || cnt);
  $("#dlgCounter").classList.toggle("on", !$("#tasbih").hidden);
  const body = $("#dlgBody");
  const how = it && HOWTO[it.id] ? `<div class="how-card"><b>🧭 طريقة الأداء باختصار</b><ol>${HOWTO[it.id].map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : "";
  let plain = "";
  if (t.text) {
    body.className = "dlg-body";
    plain = t.text + (t.note ? `\n\n— ${t.note}` : "");
    if (a && a.text) plain += `\n\n❖ ما ورد في ${a.src} ❖\n\n${a.text}`;
    body.innerHTML = how + `<div class="read-text">${richText(plain)}</div>`;
  } else {
    body.className = "dlg-body placeholder";
    plain = `لم يُضَف نص هذا العمل في هذه النسخة بعد.\nيمكنك قراءته من: ${t.src}` + (t.note ? `\n\n${t.note}` : "");
    body.innerHTML = how + esc(plain);
  }
  dlgState = { title: t.title, text: t.text ? plain : "", src: t.src || "", itemId: it?.id || null };
  $("#dlgListen").hidden = !LISTEN_RE.test(stripDiac(t.title));
  $("#dlgCopy").hidden = $("#dlgImage").hidden = $("#dlgPrint").hidden = !t.text;
  $("#dlgSrc").textContent = t.src ? `المصدر: ${t.src}` + (a && a.text ? ` — ومعه نص ${a.src}` : "") : "";
  $("#textDialog").showModal();
  body.scrollTop = 0;
  afterOpen(id, body);
}
function afterOpen(id, body) {
  // الفهرس للنصوص الطويلة ذات الأقسام
  const heads = [...body.querySelectorAll(".sec-head")];
  const toc = $("#dlgToc");
  const long = (dlgState.text || "").length > 2500;
  toc.hidden = !(long && heads.length >= 4);
  if (!toc.hidden) {
    toc.innerHTML = `<option value="">📑 الفهرس (${ar(heads.length)})</option>` + heads.map((h, i) => `<option value="${i}">${esc((h.dataset.label || h.textContent).slice(0, 60))}</option>`).join("");
    toc.onchange = () => { const h = heads[+toc.value]; if (h) body.scrollTo({ top: h.offsetTop - body.offsetTop - 8, behavior: "smooth" }); toc.value = ""; };
  }
  // تمييز كلمات البحث إن فُتح النص من نتائج البحث
  const q = $("#search").value.trim();
  if (q.length >= 2 && document.querySelector("#tab-search.active")) {
    const rt = body.querySelector(".read-text");
    if (rt) {
      rt.innerHTML = markWords(rt.innerHTML, q);
      const first = rt.querySelector("mark");
      if (first) { body.scrollTop = first.offsetTop - body.offsetTop - 80; return; }
    }
  }
  // متابعة القراءة من الموضع السابق في الأدعية الطويلة
  const pos = (store.settings.readPos || {})[id];
  if (long && pos > 0.03) {
    const bar = document.createElement("button");
    bar.type = "button"; bar.className = "resume-bar";
    bar.textContent = `📍 تابع من حيث توقفت (${ar(Math.round(pos * 100))}٪)`;
    bar.onclick = () => { body.scrollTo({ top: pos * (body.scrollHeight - body.clientHeight), behavior: "smooth" }); bar.remove(); };
    body.prepend(bar);
  }
  let tmr;
  body.onscroll = () => {
    if (!long) return;
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      const r = body.scrollTop / Math.max(1, body.scrollHeight - body.clientHeight);
      const rp = (store.settings.readPos = { ...(store.settings.readPos || {}) });
      if (r > 0.97 || r < 0.03) delete rp[id]; else rp[id] = Math.round(r * 1000) / 1000;
      saveSettings();
    }, 800);
  };
}
/** تمييز كلمات البحث في نص مشكول: نتجاوز الحركات ونوحّد الهمزات */
function markWords(html, q) {
  const DIAC = "[\\u064B-\\u065F\\u0670\\u0640]*";
  const cls = (c) => ("اأإآٱ".includes(c) ? "[اأإآٱ]" : "يى".includes(c) ? "[يىئ]" : "هة".includes(c) ? "[هة]" : c === "و" ? "[وؤ]" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const all = unify(stripDiac(q)).split(/\s+/).filter(Boolean);
  const pat = (w) => [...w].map(cls).join(DIAC);
  const parts = html.split(/(<[^>]+>)/);
  const apply = (re) => parts.map((part) => (part.startsWith("<") ? part : part.replace(re, (m) => `<mark>${m}</mark>`))).join("");
  // العبارة كاملة أولًا، فإن لم توجد فالكلمات الطويلة وحدها (دون «يا» و«من» ونحوها)
  if (all.length > 1) {
    const phrase = new RegExp(all.map(pat).join(DIAC + "[\\s\\u00a0]+" + DIAC), "g");
    const out = apply(phrase);
    if (out.includes("<mark>")) return out;
  }
  const words = all.filter((w) => w.length >= 3);
  if (!words.length) return html;
  return apply(new RegExp(words.map(pat).join("|"), "g"));
}

/* ---------- وضع القراءة والمشاركة ---------- */
let dlgState = {};
// تمييز الآيات بين ﴿ ﴾، وعناوين السور بين ❖ ❖
const HEAD_RE = /^(❖|الفصل|فصل |الباب|باب |القسم|المقام|الليلة |اليوم |زيارة |صلاة |دعاء |(ال)?(أول|ثاني|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر|حادي|الثاني عشر)[^ ]* ?[:：]|\([٠-٩0-9]{1,3}\)\s*$|[٠-٩0-9]{1,3}\s*[-ـ.)]\s)/;
function isHeadLine(line) {
  const t = line.trim();
  return t.length >= 3 && t.length <= 70 && !/[،,]$/.test(t) && HEAD_RE.test(stripDiac(t));
}
function richText(s) {
  return String(s).split("\n").map((line) => {
    if (isHeadLine(line)) return `\u0001${line}\u0002`;
    // الفقرات المرقّمة مثل «(١) اللهم إني أسألك…» في الجوشن وأمثاله
    const m = line.match(/^\s*\(([0-9٠-٩]{1,3})\)\s+(.*)$/);
    if (m) return `\u0003${m[1]}\u0004${stripDiac(m[2]).split(/\s+/).slice(0, 5).join(" ")}\u0005${m[2]}`;
    return line;
  }).join("\n")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/\u0001([^\u0002]*)\u0002/g, '<span class="sec-head">$1</span>')
    .replace(/\u0003([^\u0004]*)\u0004([^\u0005]*)\u0005/g, (_, n, lbl) => `<span class="sec-head num" data-label="${ar(n)}. ${lbl}…">(${ar(n)})</span> `)
    .replace(/﴿[^﴾]{0,1500}﴾/g, (m) => `<span class="ayah">${m}</span>`)
    .replace(/❖[^❖\n]{1,120}❖/g, (m) => `<span class="sura-head">${m}</span>`);
}
const LISTEN_RE = /كميل|الندبة|العهد|الجوشن|السمات|الافتتاح|أبي حمزة|ابي حمزة|التوسل|دعاء الصباح|دعاء عرفة|زيارة عاشوراء|زيارة وارث|الزيارة الجامعة|أمين الله|امين الله|المناجاة|مناجاة|حديث الكساء|دعاء الفرج|المشلول|مكارم الأخلاق|يستشير|المجير|العشرات|سورة يس|سورة الواقعة|سورة الملك|سورة الرحمن|سورة الكهف|سورة الدخان|سورة الإنسان|دعاء البهاء|دعاء الحج|أبي حمزة/;
const READ_FONTS = [
  ["traditional", "الخط التقليدي", `"Traditional Arabic", "Amiri", serif`],
  ["majalla", "مجلّة", `"Sakkal Majalla", "Traditional Arabic", serif`],
  ["naskh", "نسخ واضح", `"Arabic Typesetting", "Traditional Arabic", serif`],
  ["simple", "خط بسيط", `"Segoe UI", Tahoma, sans-serif`],
];
function applyReadLook() {
  const s = store.settings;
  const f = READ_FONTS.find((x) => x[0] === s.readFont) || READ_FONTS[0];
  document.documentElement.style.setProperty("--read-font", f[2]);
  document.documentElement.style.setProperty("--read-scale", s.readScale || 1);
  $("#textDialog").classList.toggle("paper", !!s.readPaper);
  $("#dlgPaper").classList.toggle("on", !!s.readPaper);
  $("#dlgFont").value = f[0];
}
function bindReadTools() {
  $("#dlgFont").innerHTML = READ_FONTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  const scale = (d) => { const s = store.settings; s.readScale = Math.min(2, Math.max(0.7, Math.round(((s.readScale || 1) + d) * 10) / 10)); saveSettings(); applyReadLook(); };
  $("#dlgBigger").onclick = () => scale(0.1);
  $("#dlgSmaller").onclick = () => scale(-0.1);
  $("#dlgFont").onchange = (e) => { store.settings.readFont = e.target.value; saveSettings(); applyReadLook(); };
  $("#dlgPaper").onclick = () => { store.settings.readPaper = !store.settings.readPaper; saveSettings(); applyReadLook(); };
  $("#dlgCopy").onclick = async () => {
    const txt = `${dlgState.title}\n\n${dlgState.text}\n\n${dlgState.src ? "المصدر: " + dlgState.src : ""}`;
    try { await navigator.clipboard.writeText(txt); toast("نُسخ النص"); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("نُسخ النص"); }
  };
  $("#dlgImage").onclick = () => exportImage();
  $("#dlgPrint").onclick = () => printText();
  $("#printPage").onclick = () => printPage();
  $("#dlgListen").onclick = () => {
    const q = encodeURIComponent(stripDiac(dlgState.title).replace(/[«»()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60));
    window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank", "noopener");
  };
  $("#dlgReport").onclick = () => {
    $("#reportTitle").textContent = dlgState.title;
    $("#reportText").value = "";
    $("#reportDialog").showModal();
  };
  $("#reportSave").onclick = (e) => {
    e.preventDefault();
    const note = $("#reportText").value.trim();
    if (!note) return toast("اكتب الملاحظة أولًا");
    store.settings.reports = [...(store.settings.reports || []), { id: dlgState.itemId, title: dlgState.title, note, t: Date.now() }];
    saveSettings();
    $("#reportDialog").close();
    toast("حُفظت ملاحظتك، وتجدها في الإعدادات");
  };
  applyReadLook();
}
/* ---------- الطباعة ---------- */
function printHeader() {
  const d = state.date;
  return `<div class="print-head"><b>الغياث</b><span>${hijriText(hijri(d))} — ${WEEKDAYS[d.getDay()]} ${gregText(d)}</span></div>`;
}
/** طباعة الدعاء المفتوح: العنوان وطريقة الأداء والنص والمصدر */
function printText() {
  const it = dlgState.itemId ? itemById(dlgState.itemId)?.it : null;
  const how = it && HOWTO[it.id] ? `<div class="how-card"><b>طريقة الأداء باختصار</b><ol>${HOWTO[it.id].map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : "";
  $("#printArea").innerHTML = `${printHeader()}<h1>${esc(dlgState.title)}</h1>${how}
    <div class="print-text">${richText(dlgState.text || "")}</div>${dlgState.src ? `<p class="print-src">المصدر: ${esc(dlgState.src)}</p>` : ""}`;
  document.body.classList.add("print-text-mode");
  window.print();
}
/** طباعة الصفحة الحالية، مع فتح الأقسام المطوية (دون إضافات الكتب) */
function printPage() {
  const sec = document.querySelector(".tab.active");
  const closed = [...sec.querySelectorAll("details.fold:not([open]), details.how:not([open])")];
  closed.forEach((x) => (x.open = true));
  $("#printArea").innerHTML = printHeader();
  document.body.classList.add("print-page-mode");
  window.print();
  closed.forEach((x) => (x.open = false));
}
window.addEventListener("afterprint", () => document.body.classList.remove("print-text-mode", "print-page-mode"));

/** تصدير الدعاء صورةً جميلة (PNG) */
function exportImage() {
  const W = 1080, pad = 90, lh = 64;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = `40px ${getComputedStyle(document.documentElement).getPropertyValue("--read-font") || "serif"}`;
  ctx.font = font;
  const wrap = (txt, f, maxW) => {
    ctx.font = f;
    const out = [];
    for (const para of txt.split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  let lines = wrap(dlgState.text, font, W - pad * 2);
  const MAXL = 40;
  if (lines.length > MAXL) { lines = lines.slice(0, MAXL); lines[MAXL - 1] += " …"; }
  const titleLines = wrap(dlgState.title, `bold 46px ${font.slice(5)}`, W - pad * 2);
  const H = pad + titleLines.length * 66 + 40 + lines.length * lh + 120 + pad;
  c.width = W; c.height = H;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fbf7ee"); g.addColorStop(1, "#f1e7d3");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#a8792a"; ctx.lineWidth = 4; ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.lineWidth = 1.5; ctx.strokeRect(42, 42, W - 84, H - 84);
  ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  let y = pad;
  ctx.fillStyle = "#1d6b52"; ctx.font = `bold 46px ${font.slice(5)}`;
  for (const l of titleLines) { ctx.fillText(l, W / 2, y); y += 66; }
  ctx.fillStyle = "#a8792a"; ctx.fillText("❖", W / 2, y - 6); y += 40;
  ctx.fillStyle = "#1f2a24"; ctx.font = font;
  for (const l of lines) { ctx.fillText(l, W / 2, y); y += lh; }
  ctx.fillStyle = "#6b726c"; ctx.font = `26px "Segoe UI", Tahoma, sans-serif`;
  y += 40;
  if (dlgState.src) ctx.fillText(dlgState.src.slice(0, 70), W / 2, y);
  ctx.fillText("من برنامج «الغياث»", W / 2, y + 38);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `${stripDiac(dlgState.title).replace(/[\\/:*?"<>|«»]/g, "").slice(0, 50)}.png`;
  a.click();
  toast("حُفظت الصورة في مجلد التنزيلات");
}

/* ====================== البحث ====================== */
// إزالة التشكيل للعرض، ثم توحيد الحروف بنفس الطول للمطابقة (حتى يتطابق موضع المقتطف)
const stripDiac = (s) => String(s || "").replace(/[ً-ٰٟـ]/g, "");
const unify = (s) => s.replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
let searchIndex = null;
function buildSearchIndex() {
  const list = [];
  const seen = new Set();
  const add = (items, where) => {
    for (const it of items || []) {
      const k = it.id + "|" + where;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = it.text ? DATA.texts[it.text] : null;
      const head = stripDiac(`${it.title} ${it.desc || ""} ${it.src || ""}`);
      const plain = t && t.text ? stripDiac(t.text) : "";
      list.push({ it, where, head: unify(head), plain, key: unify(plain) });
    }
  };
  for (const g of DATA.daily) add(g.items, `يوميًا — ${g.title}`);
  for (const wd of Object.values(DATA.weekdays)) { add(wd.day, `يوم ${wd.name}`); add(wd.night, `ليلة ${wd.name}`); }
  for (const [d, v] of Object.entries(DATA.monthly.days || {})) { add(v.items, `كل شهر — يوم ${ar(d)}`); add(v.night, `كل شهر — ليلة ${ar(d)}`); }
  for (const r of DATA.monthly.rules || []) add([r.item], "كل شهر");
  for (const mo of Object.values(DATA.months)) {
    add(mo.general, `${mo.name} — كل يوم`);
    for (const [d, v] of Object.entries(mo.days || {})) {
      const day = d === "last" ? "آخر يوم" : `يوم ${ar(d)}`;
      add(v.items, `${mo.name} — ${day} (${v.title})`);
      add(v.night, `${mo.name} — ليلة ${d === "last" ? "آخر يوم" : ar(d)} (${v.title})`);
    }
    for (const r of mo.rules || []) add(r.items, `${mo.name} — ${r.title}`);
  }
  return list;
}

const searchFilter = { kind: "all", book: "" };
function renderSearch(q) {
  searchIndex ||= buildSearchIndex();
  const words = unify(stripDiac(q)).trim().split(/\s+/).filter(Boolean);
  const sec = $("#tab-search");
  const phrase = words.join(" ");
  const exact = [], inTitle = [], inText = [];
  for (const e of searchIndex) {
    if (e.head.includes(phrase)) exact.push(e);
    else if (words.every((w) => e.head.includes(w))) inTitle.push(e);
    else if (e.key && words.every((w) => e.key.includes(w))) inText.push(e);
  }
  // الأقصر عنوانًا أولًا داخل المطابقة التامة (الأقرب لما كُتب)
  exact.sort((a, b) => a.it.title.length - b.it.title.length);
  const textOnly = new Set(inText);
  const passes = (e) => (searchFilter.kind === "all" || kindOf(e.it) === searchFilter.kind) && (!searchFilter.book || booksOf(e.it.src).includes(searchFilter.book));
  const all = [...exact, ...inTitle, ...inText].filter(passes);
  const filters = `<div class="search-filters">${[["all", "الكل"], ["salat", "🕌 صلوات"], ["dua", "🤲 أدعية وأذكار"], ["ziyara", "🕋 زيارات"], ["other", "📌 أخرى"]]
    .map(([k, n]) => `<button class="fchip ${searchFilter.kind === k ? "on" : ""}" data-fkind="${k}">${n}</button>`).join("")}
    <select id="fBook"><option value="">كل الكتب</option>${BOOKS.map(([, n]) => `<option ${searchFilter.book === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
  const MAX = 150;
  const snippet = (e) => {
    const i = e.key.indexOf(words[0]);
    if (i < 0) return "";
    const a = Math.max(0, i - 60), b = Math.min(e.plain.length, i + words[0].length + 80);
    return `<div class="search-snip">${a ? "…" : ""}${esc(e.plain.slice(a, i))}<mark>${esc(e.plain.slice(i, i + words[0].length))}</mark>${esc(e.plain.slice(i + words[0].length, b))}${b < e.plain.length ? "…" : ""}</div>`;
  };
  sec.innerHTML = filters + `<p class="search-info">${all.length ? `${ar(all.length)} نتيجة لـ «${esc(q)}»${all.length > MAX ? ` — تُعرض أول ${ar(MAX)}` : ""}` : `لا توجد نتائج لـ «${esc(q)}»`}</p>` +
    all.slice(0, MAX).map((e) => {
      const html = itemHTML(e.it, state.date, false);
      const extra = `<div class="search-where">${esc(e.where)}</div>` + (textOnly.has(e) ? snippet(e) : "");
      return html.replace('<div class="item-main">', `<div class="item-main">${extra}`);
    }).join("");
  sec.querySelectorAll("[data-fkind]").forEach((b) => (b.onclick = () => { searchFilter.kind = b.dataset.fkind; renderSearch(q); }));
  $("#fBook", sec).onchange = (e) => { searchFilter.book = e.target.value; renderSearch(q); };
}

function onSearch() {
  const q = $("#search").value.trim();
  const searching = q.length >= 2;
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", searching ? s.id === "tab-search" : s.id === `tab-${state.tab}`));
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", !searching && b.dataset.tab === state.tab));
  if (searching) renderSearch(q);
}

let toastTimer;
function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ====================== التشغيل ====================== */
async function main() {
  await store.init();
  applyLook();
  try {
    DATA = await (await fetch("data.json", { cache: "no-store" })).json();
    try { HOWTO = await (await fetch("howto.json", { cache: "no-store" })).json(); } catch (e) { /* اختياري */ }
  } catch (e) {
    document.body.innerHTML = `<p style="padding:40px;text-align:center">تعذّر تحميل ملف المحتوى data.json.<br>شغّل البرنامج من ملف «الغياث.exe».</p>`;
    return;
  }

  $("#prevDay").onclick = () => setDate(addDays(state.date, -1));
  $("#nextDay").onclick = () => setDate(addDays(state.date, 1));
  $("#goToday").onclick = () => setDate(today());
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { $("#search").value = ""; setTab(b.dataset.tab); }));
  let searchTimer;
  $("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(onSearch, 200); });
  $("#search").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; onSearch(); } });

  const rerender = () => { if ($("#search").value.trim().length >= 2) onSearch(); else renderTab(); };
  document.addEventListener("click", (e) => {
    const chk = e.target.closest(".check");
    if (chk) { store.toggle(chk.dataset.date ? new Date(chk.dataset.date + "T12:00") : state.date, chk.dataset.id); rerender(); return; }
    const rd = e.target.closest(".read-btn[data-text]");
    if (rd) return openText(rd.dataset.text, rd.dataset.alt, rd.dataset.item, rd.dataset.date);
    const fv = e.target.closest("[data-fav]");
    if (fv) {
      e.preventDefault();
      const on = toggleList("favs", fv.dataset.fav);
      toast(on ? "أُضيف إلى أدعيتي ★" : "أُزيل من أدعيتي");
      if (fv.id === "dlgStar") { fv.textContent = on ? "★" : "☆"; fv.classList.toggle("on", on); }
      rerender(); return;
    }
    const wb = e.target.closest("[data-wird]");
    if (wb) { toggleList("wird", wb.dataset.wird); rerender(); return; }
    const go = e.target.closest("[data-goto]");
    if (go) { if (go.dataset.open) openSet.add(go.dataset.open); $("#search").value = ""; setTab(go.dataset.goto); window.scrollTo(0, 0); return; }
    const gd = e.target.closest("[data-guide]");
    if (gd) return openGuide();
    const sm = e.target.closest(".src-more");
    if (sm) { const f = sm.nextElementSibling; f.hidden = !f.hidden; sm.textContent = f.hidden ? "التفاصيل" : "إخفاء"; return; }
    const lb = e.target.closest("[data-lib]");
    if (lb) { libState.sel = lb.dataset.lib; renderLibrary(); window.scrollTo(0, 0); return; }
    const ne = e.target.closest(".ns.ev[data-date]");
    if (ne) { setDate(new Date(ne.dataset.date + "T12:00")); setTab("today"); }
  });
  bindReadTools();
  bindGuide();
  // العدّاد
  $("#tbBtn").onclick = tbTap;
  $("#tbReset").onclick = () => { if (tb.seq) tbSet(0, tb.seq); else tbSet(tb.target); };
  document.querySelectorAll("#tbPresets button").forEach((b) => (b.onclick = () => (b.dataset.v === "z" ? tbSet(0, ZAHRA) : tbSet(+b.dataset.v))));
  $("#dlgCounter").onclick = () => { const h = $("#tasbih").hidden = !$("#tasbih").hidden; $("#dlgCounter").classList.toggle("on", !h); };
  $("#textDialog").addEventListener("keydown", (e) => {
    if ($("#tasbih").hidden || e.target.matches("input,select")) return;
    if (e.key === " " || e.key === "Enter" || e.key === "+") { e.preventDefault(); tbTap(); }
  });
  document.addEventListener("keydown", (e) => {
    if ($("#textDialog").open || $("#reportDialog").open || e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowRight") setDate(addDays(state.date, -1));
    if (e.key === "ArrowLeft") setDate(addDays(state.date, 1));
  });
  $("#textDialog").addEventListener("click", (e) => { if (e.target.id === "textDialog") e.target.close(); });

  // الانتقال لليوم الجديد تلقائياً بعد منتصف الليل إن كان المستخدم على اليوم الحالي
  let lastToday = dateKey(today());
  setInterval(() => {
    const k = dateKey(today());
    if (k !== lastToday) {
      if (dateKey(state.date) === lastToday) setDate(today());
      lastToday = k;
    }
  }, 60000);

  // النصوص الطويلة (٨ م.ب) تُحمَّل بعد ظهور الواجهة حتى يفتح البرنامج بسرعة
  LONG_READY = (async () => {
    try {
      const long = await (await fetch("long-texts.json", { cache: "no-store" })).json();
      for (const [k, v] of Object.entries(long)) {
        const t = DATA.texts[k];
        if (t && !t.text && v.text) { t.text = v.text; t.src = v.src || `${t.src} — النص من ${v.web}`; }
      }
    } catch (e) { /* يعمل البرنامج بدونها */ }
    searchIndex = null; libIndex = null;
    if ($("#search").value.trim().length >= 2) onSearch(); else renderTab();
  })();
  $("#profileSel").onchange = (e) => switchProfile(e.target.value);
  const hashDate = location.hash.match(/date=(\d{4}-\d{2}-\d{2})/);
  if (hashDate) state.date = atNoon(new Date(hashDate[1] + "T12:00"));
  renderHeader();
  renderTab();
}
main();
