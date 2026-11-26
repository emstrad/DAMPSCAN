/* The booking form's end (bf.js; the owner's third pass, 15 Nov 2026): booked
   the moment a time is tapped, then this screen. Booked: the deposit to pay and
   their own page to open there and then (the link the booked text carries),
   and Add to calendar. A time asked for (Book it straight away off): we call to
   confirm. Agent, outside our area or "just call me": a text once the time is
   agreed. Photos, a note and a previous survey come after, all optional, so
   nothing optional stands before the booking; live they join the enquiry. */
(function (global) {
  'use strict';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* A calendar file in London time, made in the browser. */
  function ics(d, h) {
    var start = d.when.date.replace(/-/g, '') + 'T' + d.when.time.replace(':', '') + '00';
    var mins = (d.pick && d.pick.minutes) || 60, hh = Number(d.when.time.slice(0, 2)), mm = Number(d.when.time.slice(3)) + mins;
    var end = d.when.date.replace(/-/g, '') + 'T' + pad(hh + Math.floor(mm / 60)) + pad(mm % 60) + '00';
    var text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Damp Surveying Limited//Booking//EN', 'BEGIN:VEVENT',
      'UID:trial-' + Date.now() + '@damp', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;TZID=Europe/London:' + start, 'DTEND;TZID=Europe/London:' + end,
      'SUMMARY:' + h.title, 'LOCATION:' + d.address.replace(/,/g, '\\,'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })); a.download = 'survey.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* Anything to add, as three tiles in the form's own tile style (the owner, 26 Nov 2026: the old
     line did not look like it opened): photos, a previous survey or report, a note. One opens at a time. */
  var ICON = {
    photos: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    report: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>'
  };
  function later(d, h) {
    var wrap = el('div', 'ht-later'); wrap.appendChild(el('p', 'ht-label', 'Anything to add?'));
    var row = el('div', 'ht-addrow'), panel = el('div', 'ht-extras'); panel.hidden = true;
    var list = el('ul', 'file-list'), save = el('button', 'btn btn--primary', 'Add to my booking'); save.type = 'button'; save.hidden = true;
    var picked = { photos: [], report: [] };
    var sync = function () { d.fileObjs = picked.photos.concat(picked.report).slice(0, 10); list.textContent = ''; d.fileObjs.forEach(function (x) { list.appendChild(el('li', null, x.name)); }); save.hidden = !(d.fileObjs.length || d.notes); };
    /* The phone's own picker behind a real button, not the browser's grey "Choose Files". */
    var fileBox = function (key, accept, label) {
      var lab = el('label', 'btn btn--ghost ht-pickfiles', 'Choose ' + (key === 'photos' ? 'photos' : 'files'));
      var f = el('input'); f.type = 'file'; f.multiple = true; f.accept = accept; f.hidden = true; f.setAttribute('aria-label', label); lab.appendChild(f);
      f.addEventListener('change', function () { picked[key] = Array.prototype.slice.call(f.files, 0, 10); if (key === 'report' && picked.report.length) d.previous = true; sync(); });
      return lab;
    };
    var bodies = {
      photos: function () { return [el('p', 'ht-sub', 'Photos of the damp, the walls or anything you\'re worried about.'), fileBox('photos', 'image/*', 'Photos')]; },
      report: function () { return [el('p', 'ht-sub', 'A previous damp survey, a report or a quote, as a PDF or photos.'), fileBox('report', 'image/*,application/pdf', 'Previous survey or report')]; },
      note: function () { var t = el('textarea'); t.rows = 3; t.value = d.notes; t.setAttribute('aria-label', 'A note for us'); t.placeholder = 'Anything we should know before the visit'; t.addEventListener('input', function () { d.notes = t.value; sync(); }); return [t]; }
    };
    var open = null;
    [['photos', 'Photos'], ['report', 'Previous survey or report'], ['note', 'A note']].forEach(function (x) {
      var b = el('button', 'ht-tile ht-addtile'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[x[0]] + '</svg>';
      b.appendChild(el('span', null, x[1]));
      b.addEventListener('click', function () {
        open = open === x[0] ? null : x[0];
        row.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b && open === x[0])); });
        panel.textContent = ''; panel.hidden = !open;
        if (open) bodies[open]().forEach(function (n) { panel.appendChild(n); });
      });
      row.appendChild(b);
    });
    save.addEventListener('click', function () {
      save.disabled = true; save.textContent = 'Adding...';
      h.extras(d).then(function (r) { save.textContent = r.ok ? 'Added, thank you' : 'That didn\'t send. Try again'; save.disabled = Boolean(r.ok); if (r.ok) { picked = { photos: [], report: [] }; d.fileObjs = []; list.textContent = ''; } });
    });
    wrap.appendChild(row); wrap.appendChild(panel); wrap.appendChild(list); wrap.appendChild(save);
    return wrap;
  }

  /* h: { money, nice, clock, sizes, again, live, extras } from bf.js. */
  function draw(pane, d, h) {
    var booked = Boolean(d.when) && !d.requested, asked = Boolean(d.when) && d.requested;
    var ring = el('div', 'check-ring'); ring.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    pane.appendChild(ring);
    pane.appendChild(el('h2', 'ht-h', booked ? 'You\'re booked in, ' + d.name : 'Thanks, ' + d.name));
    pane.appendChild(el('p', 'ht-when-big', booked ? h.nice(d.when.date) + ' at ' + h.clock(d.when.time)
      : asked && d.unsure ? 'We\'ve held ' + h.nice(d.when.date) + ' at ' + h.clock(d.when.time) + ' for you. We\'ll call to confirm your survey and price.'
      : asked ? 'You asked for ' + h.nice(d.when.date) + ' at ' + h.clock(d.when.time) + '. We\'ll call to confirm it, then text you.'
      : d.unsure && !d.agent ? 'We\'ll call to help you choose the right survey and agree a time, then text you to confirm.' : d.agent ? 'We\'ll arrange the time with ' + d.agent.name + ' and text you once it\'s confirmed.' : d.outside ? 'You\'re a little outside our usual area: we\'ll check we can reach you and call to agree a time.' : 'We\'ll call you to agree a time, then text you to confirm.'));

    /* Not booked: said plainly, so nobody thinks they have bought anything. */
    if (!booked) pane.appendChild(el('p', 'ht-sub', 'Nothing is booked or paid yet.'));

    var s = d.pick ? h.sizes.filter(function (z) { return z.key === d.pick.size; })[0] : null;
    var lines = [
      ['Survey', s ? (d.pick.service === 'timber' ? 'Damp and timber, ' : 'Damp, ') + s.name.toLowerCase() + (d.pick.extras.length ? ' + ' + d.pick.extras.length + ' extra' + (d.pick.extras.length > 1 ? 's' : '') : '') : 'To agree'],
      ['Price', d.pick && d.pick.totalPounds ? h.money(d.pick.totalPounds) + (booked ? ', deposit ' + h.money(d.pick.totalPounds / 2) : ', nothing to pay yet') : 'To agree'],
      ['Where', d.address], ['Let in by', d.agent ? d.agent.name : 'You']
    ];
    var dl = el('dl', 'ht-sum'); lines.forEach(function (l) { dl.appendChild(el('dt', null, l[0])); dl.appendChild(el('dd', null, l[1])); }); pane.appendChild(dl);

    if (booked) {
      /* The deposit while they are still keen, on their own page (Apple Pay or Google Pay there, Stripe's Express Checkout). */
      var acts = el('div', 'ht-acts'), note = el('p', 'ht-sub ht-trialnote', ''); note.hidden = true;
      var link = function (cls, html, said) {
        var a = el('a', cls); a.innerHTML = html;
        if (h.live && d.page) a.href = d.page;
        else { a.href = '#'; a.addEventListener('click', function (e) { e.preventDefault(); note.textContent = said; note.hidden = false; }); }
        return a;
      };
      if (!h.live || d.page) {
        var pay = el('div', 'ht-pay');
        pay.appendChild(link('btn btn--primary btn--lg ht-paybtn', '<b>Pay ' + h.money(d.pick.totalPounds / 2) + ' deposit</b><span>Apple Pay, Google Pay or card</span>',
          'Trial: live, this opens their own page with Apple Pay or Google Pay: Face ID and it is paid.'));
        pane.appendChild(pay);
        acts.appendChild(link('btn btn--ghost btn--lg', 'Your survey page', 'Trial: live, this opens their own page: the visit, payments, messages and their report.'));
      }
      var cal = el('button', 'btn btn--ghost btn--lg', 'Add to calendar'); cal.type = 'button';
      cal.addEventListener('click', function () { ics(d, { title: 'Damp survey' }); });
      acts.appendChild(cal); pane.appendChild(acts); pane.appendChild(note);
      pane.appendChild(el('p', 'ht-sub', 'We\'ve texted the link to ' + d.phone + ' too.'));
    }
    pane.appendChild(later(d, h));
    if (h.live) return;
    pane.appendChild(el('p', 'ht-sub ht-trialnote', 'Trial only: nothing was saved or sent. Live, this ' + (booked ? 'books the time, tells the surveyor and texts ' + d.name + ' their page link.' : 'makes their card on Scheduling and alerts you.')));
    var again = el('button', 'bt-skip', 'Start again'); again.type = 'button'; again.addEventListener('click', h.again);
    pane.appendChild(again);
  }

  global.HTDONE = { draw: draw };
})(window);
