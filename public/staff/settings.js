/* Settings (the owner's tidy-up, 14 Nov 2026): notifications first, then
   only what is left to set up, then everything else as one folded line each:
   card payments, company details, where bank details, VAT, rates and the
   price book live, people, and the ChatGPT and Claude address. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };

  el('mcp-url').textContent = global.location.origin + '/api/admin/mcp';
  el('mcp-copy').addEventListener('click', function () {
    var b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(el('mcp-url').textContent) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { b.textContent = 'Press and hold the address to copy it'; });
  });

  U.get('/api/admin/people').then(function (d) {
    var ul = el('people');
    ul.textContent = '';
    (d.people || []).forEach(function (p) {
      var held = p.businesses.map(function (b) { return (NAME[b.slug] || b.slug) + (b.level === 'manage' ? ' (manages)' : ''); }).join(', ');
      ul.appendChild(U.node('li', null, p.name + (p.isAdmin ? ', admin' : '') + ': ' + held));
    });
    if (!ul.children.length) ul.appendChild(U.node('li', null, 'Nobody yet besides the owners.'));
  }).catch(function () { el('people').textContent = 'Could not load.'; });

  U.get('/api/admin/me').then(function (me) { if (me && me.isAdmin) { el('p-usage').hidden = false; payments(); } }).catch(function () {});
  /* Apple Pay and card through Stripe (lib/stripe-pay.js): whether the key is in, and connecting its notices. */
  function payments(d) {
    var show = function (x) {
      el('p-pay').hidden = false;
      var who = x.via === 'revolut' ? 'Revolut' : 'Stripe';
      el('pay-state').textContent = !x.key ? 'Off: the site cannot see STRIPE_SECRET_KEY yet. Add it in Vercel, then Redeploy.' : x.connected ? 'On. ' + who + ' tells us about every payment (connected ' + new Date(x.connected).toLocaleDateString('en-GB') + ').' + (x.sandbox ? ' Test key: no real money.' : '') : 'Key found. One tap so payments tick themselves off:';
      el('pay-connect').hidden = !x.key;
      el('pay-connect').className = 'btn btn--sm ' + (x.connected ? 'btn--ghost' : 'btn--primary');
      el('pay-connect').textContent = x.connected ? 'Connect again' : 'Connect card payments';
      /* Not connected yet with the key in: open, so the button is in view. */
      if (x.key && !x.connected) el('p-pay').open = true;
    };
    if (d) return show(d);
    U.get('/api/admin/business?view=payments').then(show).catch(function () {});
  }
  el('pay-connect').addEventListener('click', async function () {
    var b = this; b.disabled = true;
    var r = await U.send('/api/admin/business', { op: 'revolut-connect' }).catch(function () { return null; });
    b.disabled = false;
    if (r && r.ok) { payments(r.data); document.dispatchEvent(new CustomEvent('ds:ready')); } else el('pay-state').textContent = (r && r.data && r.data.error) || 'That did not connect.';
  });

  var on = 'Notification' in global && global.Notification.permission === 'granted';
  el('push-state').textContent = on ? 'Notifications are on for this device.' : 'Notifications are not on for this device.';
  /* Who gets the staff app alert as well as ntfy, so a missing phone shows. */
  U.get('/api/admin/push').then(function (d) {
    var list = el('push-phones'); list.textContent = '';
    (d.phones || []).forEach(function (p) { list.appendChild(U.node('li', null, p.name + ': ' + p.phones + (p.phones === 1 ? ' phone' : ' phones'))); });
    if (!list.children.length) list.appendChild(U.node('li', null, 'No phone has the staff app alerts on yet.'));
    el('push-ntfy').textContent = d.ntfy ? 'ntfy is on too. Its last enquiry alerts:' : '';
    var rec = el('push-recent'); rec.textContent = '';
    (d.recent || []).forEach(function (r) {
      rec.appendChild(U.node('li', null, new Date(r.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ', ' + r.title + ': ' + (r.sent ? 'ntfy took it' : 'ntfy refused it' + (r.error ? ' (' + (/^429/.test(r.error) ? 'daily limit reached' : r.error) + ')' : ''))));
    });
  }).catch(function () {});
  el('push-test').addEventListener('click', async function () {
    el('push-test-out').textContent = 'Sending.';
    var r = await U.send('/api/admin/push?test=1', {});
    var d = r.data || {};
    el('push-test-out').textContent = !r.ok ? 'That did not send.'
      : (d.ntfy ? 'ntfy took it.' : 'ntfy refused it: ' + (d.why && /^429/.test(d.why) ? 'its daily message limit is used up. Add NTFY_TOKEN from an ntfy account.' : (d.why || 'check NTFY_TOPIC in Vercel.'))) + ' Staff app: sent to ' + (d.app || 0) + (d.app === 1 ? ' phone.' : ' phones.');
  });

  el('refresh').addEventListener('click', function () { global.location.reload(); });
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    global.location.replace('/staff');
  });
})(window);
