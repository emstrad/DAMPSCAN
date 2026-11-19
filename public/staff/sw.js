/* The staff app's service worker. Its only job is phone notifications: it
   shows a push from lib/push.js and opens the staff area when one is tapped.
   It caches nothing, because every staff page is no-store on purpose and a
   stale copy of the Due list would be worse than no copy. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Staff area', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Staff area', {
    body: data.body || '',
    icon: '/staff/icon-192.png',
    badge: '/staff/icon-192.png',
    tag: data.tag || undefined,
    /* A second alert about the same customer still buzzes, rather than quietly replacing the first. */
    renotify: Boolean(data.tag),
    data: { url: data.url || '/staff/calendar.html' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/staff/calendar.html';
  /* Only ever somewhere inside the staff area. */
  if (url.indexOf('/staff/') !== 0) url = '/staff/calendar.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('/staff/') !== -1 && 'focus' in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
