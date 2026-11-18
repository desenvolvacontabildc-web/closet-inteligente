/* Service worker do Closet Inteligente: recebe as notificações e abre a tela certa ao tocar nelas. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Closet Inteligente", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: d.url || "/home" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/home";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { try { c.navigate(url); } catch (_) {} return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
