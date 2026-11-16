/* The booking form's two ways of talking to the server (bf.js): live on the
   damp sites, through the same /api/lead paths the old form used (the quiet
   step 1 save and dropout beacon of partial.js, the enquiry with its alerts,
   email and Google Ads conversion, the survey chosen, then the real times and
   the booking itself); and trial, on the staff copy of the home page, where
   nothing is saved or sent and the times come from the Lab's route. Each
   returns promises of the same shape, so bf.js never asks which it is. */
(function (global) {
  'use strict';
  var json = function (r) { return r.json().catch(function () { return {}; }); };
  var post = function (body) {
    return fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return json(r).then(function (x) { x.status = r.status; return x; }); });
  };

  /* ---------- trial: the staff copy, nothing sent ---------- */
  var slotsUrl = '/api/admin/hours?view=slots';
  var trial = {
    live: false,
    init: function () {
      fetch('/api/admin/me', { headers: { Accept: 'application/json' } }).then(function (r) { if (r.status === 401) location.replace('/staff?next=' + encodeURIComponent(location.pathname)); });
      var b = document.createElement('div'); b.className = 'ht-badge'; b.textContent = 'Staff trial: nothing is sent'; document.body.appendChild(b);
    },
    step1: function () {},
    prices: function () { return fetch(slotsUrl, { headers: { Accept: 'application/json' } }).then(json).then(function (x) { if (!x.prices) throw new Error('no prices'); return x.prices; }); },
    submit: function () { return Promise.resolve({ ok: true }); },
    times: function (d) {
      return fetch(slotsUrl + '&days=56&postcode=' + encodeURIComponent(d.postcode) + '&minutes=' + ((d.pick && d.pick.minutes) || 60), { headers: { Accept: 'application/json' } })
        .then(json).then(function (x) { return { slots: x.slots || [], instant: true }; });
    },
    pick: function () { return Promise.resolve({ ok: true, booked: true }); },
    extras: function () { return Promise.resolve({ ok: true }); }
  };

  /* ---------- live: the damp sites ---------- */
  var V = typeof DS !== 'undefined' ? DS : { id: '', referrer: '', utm: {} };
  var send = function (type, detail) { if (typeof track === 'function') track(type, detail); };
  var endpoint = typeof NOTIFY_ENDPOINT !== 'undefined' ? NOTIFY_ENDPOINT : '';
  var cfg = typeof DS_CFG !== 'undefined' ? DS_CFG : {};
  var leadId = null, partial = null, converted = false;

  /* Damp sites: the estate agent arranges access, so their details ride in the notes (Scheduling's agent line reads them). */
  function notes(d) {
    var agent = d.agent ? 'Estate agent to be contacted to arrange access: ' + [d.agent.name, d.agent.phone].filter(Boolean).join(', ') + '.' : '';
    return [agent, d.notes].filter(Boolean).join(' ');
  }
  function payload(d, stage) {
    return { stage: stage, sessionId: V.id, firstName: d.name, email: d.email, postcode: d.postcode, addressLine1: d.street, town: d.town,
      files: d.uploaded || [], phone: d.phone, issues: stage === 'complete' ? d.issues : [], previousSurvey: d.previous ? true : (stage === 'complete' ? false : null),
      notes: notes(d), sourcePath: location.pathname, referrer: V.referrer, utm: V.utm, honeypot: d.honeypot || '' };
  }
  /* The backup email, from the page only when the server could not send it (a site with no endpoint has none). */
  function email(d, subject, extra) {
    if (!endpoint) return;
    var f = { _subject: (cfg.subjectPrefix || '') + subject + ', ' + (d.name || 'unknown') + ', ' + (d.postcode || 'no postcode'), _captcha: 'false', _template: 'table',
      'First name': d.name, Email: d.email, Phone: d.phone || 'Not given', Address: [d.street, d.town, d.postcode].filter(Boolean).join(', '),
      Issue: (d.issues || []).join(', ') || 'Not given', 'Who lets us in': d.agent ? 'The estate agent' : 'The customer' };
    if (d.agent) { f['Estate agent'] = d.agent.name; f['Agent phone'] = d.agent.phone; }
    Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
    f['Lead ID'] = leadId ? String(leadId) : 'Not known'; f.Sent = new Date().toLocaleString('en-GB');
    try { fetch(endpoint, { method: 'POST', keepalive: true, headers: { Accept: 'application/json' }, body: new URLSearchParams(f) }).catch(function () {}); } catch (e) {}
  }
  /* Google Ads counts a booking once, the moment the enquiry is stored (scripts/ads-tag.js). */
  function conversion(id) {
    global.dataLayer = global.dataLayer || [];
    global.dataLayer.push({ event: (cfg.dataLayerEvent || 'site') + '_lead', stage: 'complete' });
    if (converted || !global.DS_ADS_CONVERSION || typeof global.gtag !== 'function') return;
    converted = true;
    global.gtag('event', 'conversion', id ? { send_to: global.DS_ADS_CONVERSION, transaction_id: String(id) } : { send_to: global.DS_ADS_CONVERSION });
  }
  /* Photos straight to storage (the old form's route), then their paths on the enquiry. */
  function upload(file) {
    return fetch('/api/upload?mode=presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type }) })
      .then(json).then(function (s) {
        if (s.ok && s.url) return fetch(s.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then(function (r) { if (!r.ok) throw new Error('upload'); return s.path; });
        return fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
          .then(json).then(function (x) { if (!x.ok || !x.path) throw new Error('upload'); return x.path; });
      });
  }

  var live = {
    live: true,
    init: function (d, card) {
      var opened = false;
      card.addEventListener('focusin', function () { if (opened) return; opened = true; send('form_open'); send('form_step', { step: 1 }); });
      /* Step 1 saved quietly at once, and a dropout's details sent as they leave (partial.js). */
      if (global.DS_HELD_PARTIAL) partial = global.DS_HELD_PARTIAL({ payload: function () { return payload(d, 'partial'); }, send: function () { return post(payload(d, 'partial')); }, email: function () { return false; }, endpoint: '/api/lead' });
      card.addEventListener('input', function () { if (partial) partial.bump(); });
    },
    step1: function (d) { if (partial && !(d && d.leadId)) partial.arm(); send('form_step', { step: 2 }); },
    prices: function () { return post({ op: 'prices' }).then(function (x) { if (!x.prices) throw new Error('no prices'); return x.prices; }); },
    /* The enquiry, once they have said what is going on and which survey: alerts, email, the customer's thanks and the ads count. */
    submit: function (d) {
      return post(payload(d, 'complete')).then(function (x) {
        if (x.status === 400) return { ok: false, errors: x.errors || {} };
        if (!x.ok || !x.id) return { ok: false };
        /* Back from the time step and Continue again updates the same enquiry: the backup email and the counts go once. */
        var again = (leadId || d.leadId) === x.id; leadId = d.leadId = x.id; if (partial) partial.cancel();
        if (!again) { conversion(x.id); send('form_submit'); send('form_step', { step: 3 }); if (!x.emailed) email(d, cfg.subjectComplete || 'NEW survey booking', {}); }
        var c = d.pick || {};
        return post({ op: 'survey', leadId: leadId, sessionId: V.id, choice: { service: c.service, size: c.size, extras: c.extras } }).then(function () { return { ok: true }; }, function () { return { ok: true }; });
      }, function () { if (partial) partial.rearm(); return { ok: false }; });
    },
    times: function (d) {
      return post({ op: 'times', leadId: leadId || d.leadId, sessionId: V.id, days: 56 }).then(function (x) {
        var slots = []; (x.days || []).forEach(function (dd) { (dd.times || []).forEach(function (t) { slots.push({ date: dd.date, time: t.time, ticket: t.ticket }); }); });
        return { slots: slots, instant: Boolean(x.instant), off: Boolean(x.off || x.held) };
      });
    },
    pick: function (d, s) {
      return post({ op: 'pick', leadId: leadId || d.leadId, sessionId: V.id, date: s.date, time: s.time, ticket: s.ticket }).then(function (x) {
        if (!x.ok) return { ok: false, error: x.error || 'failed' };
        send('form_step', { step: 4 });
        email(d, 'UPDATE, ' + (x.booked ? 'booked' : 'time asked for'), { Time: x.said || s.date + ' ' + s.time });
        return { ok: true, booked: Boolean(x.booked), page: x.page || null };
      });
    },
    /* After the booking, all optional: photos, a note and a previous survey on the same enquiry (no second alert). */
    extras: function (d) {
      var files = Array.prototype.slice.call(d.fileObjs || [], 0, 10);
      return files.reduce(function (ch, f) { return ch.then(function () { return upload(f).then(function (p) { (d.uploaded = d.uploaded || []).push(p); }, function () {}); }); }, Promise.resolve())
        .then(function () { return post(payload(d, 'complete')); }).then(function (x) { return { ok: Boolean(x.ok) }; }, function () { return { ok: false }; });
    }
  };

  global.BFAPI = { trial: trial, live: live };
})(window);
