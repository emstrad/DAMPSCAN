/* "Turn on notifications": in the + menu on every staff page, and in Settings.

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

  /* The switch itself, shared by the + menu (shell.js) and Settings: whether
     this device is on, and one call to turn it on or off. */
  var state = { available: false, on: false, toggle: null };
  global.DSPUSH = state;

  async function start() {
    var slot = document.getElementById('push-here');
    var cfg;
    try { cfg = await (await fetch('/api/admin/push', { headers: { Accept: 'application/json' } })).json(); } catch (e) { return; }
    if (!cfg || !cfg.publicKey) { if (slot) slot.textContent = 'Staff app alerts are not set up on the server yet (the VAPID keys in Vercel).'; return; }
    var reg = await nav.serviceWorker.register('/staff/sw.js', { scope: '/staff/' });
    var existing = await reg.pushManager.getSubscription();
    state.on = Boolean(existing) && global.Notification.permission === 'granted';
    /* Re-sent each visit, so a phone the server forgot (or a new sign-in on
       the same phone) is picked up again without a tap. */
    if (state.on) send('POST', { subscription: existing.toJSON() }).catch(function () {});
    state.available = true;
    /* Resolves to a word for the person: 'on', 'off' or why it failed. */
    state.toggle = async function () {
      if (state.on) {
        var sub = await reg.pushManager.getSubscription();
        if (sub) { await send('DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
        state.on = false;
        return 'off';
      }
      if ((await global.Notification.requestPermission()) !== 'granted') return 'blocked';
      var s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) });
      await send('POST', { subscription: s.toJSON() });
      state.on = true;
      return 'on';
    };
    document.dispatchEvent(new CustomEvent('ds:push'));
    if (!slot) return;
    /* Settings shows the same switch as a button of its own. */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--sm push-toggle';
    var draw = function () { btn.textContent = state.on ? 'Notifications on: tap to stop' : 'Turn on notifications'; btn.setAttribute('aria-pressed', String(state.on)); };
    draw();
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var r = await state.toggle();
        if (r === 'blocked') btn.textContent = 'Notifications blocked in the phone\'s settings'; else draw();
      } catch (e) { btn.textContent = 'That did not work. Try again'; }
      finally { btn.disabled = false; }
    });
    document.addEventListener('ds:push', draw);
    slot.appendChild(btn);
  }

  start().catch(function () {});
})(window);
