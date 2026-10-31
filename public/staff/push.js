/* "Turn on notifications", in the header of every staff page.

   Shown only when the server has push keys (GET /api/admin/push answers a
   publicKey) and the browser can do it. On an iPhone that means the staff
   app added to the home screen, which is the installable app this is for.
   Tapping it asks the phone's permission, subscribes through sw.js and hands
   the subscription to the server, which keeps it against whoever is signed
   in. What they then hear about is their businesses only, decided by the
   server. Loaded by area.js. */
(function (global) {
  'use strict';
  var nav = global.navigator;
  if (!('serviceWorker' in nav) || !('PushManager' in global) || !('Notification' in global)) return;

  function keyBytes(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = global.atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function send(method, body) {
    var res = await fetch('/api/admin/push', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('push ' + res.status);
  }

  async function start() {
    /* Settings keeps its own place for it, so it is never squeezed off a phone's header. */
    var slot = document.getElementById('push-here');
    var header = slot || document.querySelector('header.top');
    if (!header) return;
    var cfg;
    try { cfg = await (await fetch('/api/admin/push', { headers: { Accept: 'application/json' } })).json(); } catch (e) { return; }
    if (!cfg || !cfg.publicKey) { if (slot) slot.textContent = 'Staff app alerts are not set up on the server yet (the VAPID keys in Vercel).'; return; }
    var reg = await nav.serviceWorker.register('/staff/sw.js', { scope: '/staff/' });
    var existing = await reg.pushManager.getSubscription();

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--sm push-toggle';
    function draw(on) {
      btn.textContent = on ? 'Notifications on' : 'Turn on notifications';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Tap to stop notifications on this device' : 'Get a buzz for new enquiries, accepted quotes and ratings';
    }
    var on = Boolean(existing) && global.Notification.permission === 'granted';
    /* Re-sent each visit, so a phone the server forgot (or a new sign-in on
       the same phone) is picked up again without a tap. */
    if (on) send('POST', { subscription: existing.toJSON() }).catch(function () {});
    draw(on);

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        if (on) {
          var sub = await reg.pushManager.getSubscription();
          if (sub) { await send('DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
          on = false;
        } else {
          if ((await global.Notification.requestPermission()) !== 'granted') { btn.textContent = 'Notifications blocked in settings'; return; }
          var s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) });
          await send('POST', { subscription: s.toJSON() });
          on = true;
        }
        draw(on);
      } catch (e) {
        btn.textContent = 'That did not work. Try again';
      } finally {
        btn.disabled = false;
      }
    });
    header.appendChild(btn);
  }

  start().catch(function () {});
})(window);
