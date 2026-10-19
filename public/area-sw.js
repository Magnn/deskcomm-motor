/*
 * O SERVICE WORKER DA ÁREA DO CLIENTE (`/c/<slug>/`): recebe o aviso diário ("a sua carta de hoje abriu")
 * e, no toque, abre a área. Registrado com escopo `/c/<slug>/` — não interfere no `notify-sw.js` do CRM,
 * que é da equipe. Quem manda o aviso é o cron `area-avisos`.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "", body: "", tag: "area-do-dia", href: "", icon: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload não-JSON
  }
  const href = data.href || self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || "✦", {
      body: data.body,
      tag: data.tag,
      icon: data.icon ? new URL(data.icon, self.location.origin).href : undefined,
      badge: data.icon ? new URL(data.icon, self.location.origin).href + "?t=192" : undefined,
      data: { href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || self.registration.scope;
  const url = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      const daArea = janelas.find((j) => j.url.startsWith(self.registration.scope) && "focus" in j);
      if (daArea) return daArea.focus().then(() => ("navigate" in daArea ? daArea.navigate(url) : undefined));
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
