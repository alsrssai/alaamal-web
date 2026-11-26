/* عامل الخدمة لتطبيق الويب (آيفون): يحفظ ملفات البرنامج في الجهاز ليعمل دون إنترنت.
   CACHE يتغيّر مع كل بناء فتُحدَّث الملفات تلقائيًا. */
const CACHE = "alaamal-202611270147";
const FILES = ["./", "index.html", "app.js", "extra.js", "styles.css", "fonts.css", "quran.json", "zahra.json", "mobile.js", "mobile.css", "data.json", "long-texts.json", "howto.json",
  "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // لا خادم على الهاتف: البيانات تُحفظ في تخزين الجهاز
  if (url.pathname.includes("/api/")) { e.respondWith(new Response("", { status: 404 })); return; }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && e.request.method === "GET") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }))
  );
});
