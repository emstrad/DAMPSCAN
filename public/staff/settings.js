/* Settings: the people list, the assistant's connector address for this
   site, and whether this device has notifications on. Everything else on the
   page is links to where each setting is kept. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };

  el('mcp-url').textContent = global.location.origin + '/api/admin/mcp';

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
  /* Apple Pay and card through Revolut (lib/revolut-pay.js): whether the key is in, and connecting Revolut's notices. */
  function payments(d) {
    var show = function (x) {
      el('p-pay').hidden = false;
      el('pay-state').textContent = !x.key ? 'Off: add REVOLUT_MERCHANT_KEY in Vercel.' : x.connected ? 'On, and Revolut tells us about payments (connected ' + new Date(x.connected).toLocaleDateString('en-GB') + ').' + (x.sandbox ? ' Test mode.' : '') : 'Key added. Connect Revolut so payments tick themselves off.';
      el('pay-connect').hidden = !x.key;
      el('pay-connect').textContent = x.connected ? 'Connect again' : 'Connect Revolut payments';
    };
    if (d) return show(d);
    U.get('/api/admin/business?view=payments').then(show).catch(function () {});
  }
  el('pay-connect').addEventListener('click', async function () {
    var b = this; b.disabled = true;
    var r = await U.send('/api/admin/business', { op: 'revolut-connect' }).catch(function () { return null; });
    b.disabled = false;
    if (r && r.ok) payments(r.data); else el('pay-state').textContent = (r && r.data && r.data.error) || 'That did not connect.';
  });

  var on = 'Notification' in global && global.Notification.permission === 'granted';
  el('push-state').textContent = on ? 'Notifications are on for this device.' : 'Notifications are not on for this device.';
  /* Who gets the staff app alert as well as ntfy, so a missing phone shows. */
  U.get('/api/admin/push').then(function (d) {
    var list = el('push-phones'); list.textContent = '';
    (d.phones || []).forEach(function (p) { list.appendChild(U.node('li', null, p.name + ': ' + p.phones + (p.phones === 1 ? ' phone' : ' phones'))); });
    if (!list.children.length) list.appendChild(U.node('li', null, 'No phone has staff app notifications on yet. Only ntfy will buzz.'));
    el('push-ntfy').textContent = d.ntfy ? 'ntfy is still on as well (remove NTFY_TOPIC in Vercel to stop it). The last enquiry alerts:' : 'Alerts go to the staff app (and enquiry texts to the owners). ntfy is off.';
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
