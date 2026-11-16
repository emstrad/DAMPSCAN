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

  function later(d, h) {
    var f = el('details', 'ht-later'); f.appendChild(el('summary', null, 'Anything to add? Photos, a note, a previous survey'));
    var box = el('div', 'ht-extras');
    var prev = el('label', 'check'), pc = el('input'); pc.type = 'checkbox'; pc.checked = d.previous; pc.addEventListener('change', function () { d.previous = pc.checked; });
    var tick = el('span', 'box'); tick.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    prev.appendChild(pc); prev.appendChild(tick); prev.appendChild(document.createTextNode('I\'ve had a damp survey on this property before')); box.appendChild(prev);
    var fr = el('div', 'form-row'); fr.appendChild(el('label', null, 'Photos or a previous report'));
    var files = el('input'); files.type = 'file'; files.multiple = true; files.accept = 'image/*,application/pdf';
    var list = el('ul', 'file-list');
    files.addEventListener('change', function () { d.fileObjs = Array.prototype.slice.call(files.files, 0, 10); list.textContent = ''; d.fileObjs.forEach(function (x) { list.appendChild(el('li', null, x.name)); }); });
    fr.appendChild(files); fr.appendChild(list); box.appendChild(fr);
    var nr = el('div', 'form-row'); nr.appendChild(el('label', null, 'Anything else we should know?'));
    var notes = el('textarea'); notes.rows = 3; notes.value = d.notes; notes.addEventListener('input', function () { d.notes = notes.value; });
    nr.appendChild(notes); box.appendChild(nr);
    var save = el('button', 'btn btn--ghost', 'Add to my booking'); save.type = 'button';
    save.addEventListener('click', function () {
      save.disabled = true; save.textContent = 'Adding...';
      h.extras(d).then(function (r) { save.textContent = r.ok ? 'Added, thank you' : 'That didn\'t send. Try again'; save.disabled = Boolean(r.ok); if (r.ok) { d.fileObjs = []; list.textContent = ''; } });
    });
    box.appendChild(save); f.appendChild(box);
    return f;
  }

  /* h: { money, nice, clock, sizes, again, live, extras } from bf.js. */
  function draw(pane, d, h) {
    var booked = Boolean(d.when) && !d.requested, asked = Boolean(d.when) && d.requested;
    var ring = el('div', 'check-ring'); ring.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    pane.appendChild(ring);
    pane.appendChild(el('h2', 'ht-h', booked ? 'You\'re booked in, ' + d.name : 'Thanks, ' + d.name));
    pane.appendChild(el('p', 'ht-when-big', booked ? h.nice(d.when.date) + ' at ' + h.clock(d.when.time)
      : asked ? 'You asked for ' + h.nice(d.when.date) + ' at ' + h.clock(d.when.time) + '. We\'ll call to confirm it, then text you.'
      : d.unsure && !d.agent ? 'We\'ll call to help you choose the right survey and agree a time, then text you to confirm.' : d.agent ? 'We\'ll arrange the time with ' + d.agent.name + ' and text you once it\'s confirmed.' : d.outside ? 'You\'re a little outside our usual area: we\'ll check we can reach you and call to agree a time.' : 'We\'ll call you to agree a time, then text you to confirm.'));

    /* Not booked: said plainly, so nobody thinks they have bought anything. */
    if (!booked) pane.appendChild(el('p', 'ht-sub', 'Nothing is booked or paid yet.'));

    var s = d.pick ? h.sizes.filter(function (z) { return z.key === d.pick.size; })[0] : null;
    var lines = [
      ['Survey', s ? (d.pick.service === 'timber' ? 'Damp and timber, ' : 'Damp, ') + s.name.toLowerCase() + (d.pick.extras.length ? ' + ' + d.pick.extras.length + ' extra' + (d.pick.extras.length > 1 ? 's' : '') : '') : 'To agree'],
      ['Price', d.pick && d.pick.totalPounds ? h.money(d.pick.totalPounds) + (booked ? ', deposit ' + h.money(d.pick.totalPounds / 2) : ', nothing to pay yet') : 'To agree'],
      ['Where', d.address], ['Let in by', d.agent ? d.agent.name : d.name]
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
