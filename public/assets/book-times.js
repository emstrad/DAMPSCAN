/* After a damp survey enquiry is sent: "Want to pick a time now?" The times
   come from the server (lib/web-booking.js), best first for the area, and a
   tap asks for that time. It is held for the team to confirm, so the words
   say "requested", never "booked". Nothing shows when the owners have not
   switched it on, or when there are no times. Loaded by book.js. */
(function () {
  'use strict';
  var nice = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var clock = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  async function post(body) {
    var r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var d = await r.json().catch(function () { return {}; });
    return { status: r.status, data: d };
  }

  async function offer(box, lead, note) {
    var r = await post({ op: 'times', leadId: lead.id, sessionId: lead.sessionId });
    box.textContent = '';
    var times = (r.data && r.data.times) || [];
    if (!times.length) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h4', 'bt-title', 'Want to pick a survey time now?'));
    box.appendChild(el('p', 'note', note || 'These are the times that suit our surveyors in your area. Pick one and we will confirm it with you shortly.'));
    var byDay = {};
    times.forEach(function (t) { (byDay[t.date] = byDay[t.date] || []).push(t); });
    Object.keys(byDay).forEach(function (d) {
      box.appendChild(el('p', 'bt-day', nice(d)));
      var row = el('div', 'bt-row');
      byDay[d].forEach(function (t) {
        var b = el('button', 'bt-time', clock(t.time)); b.type = 'button';
        b.addEventListener('click', async function () {
          b.disabled = true;
          var p = await post({ op: 'pick', leadId: lead.id, sessionId: lead.sessionId, date: t.date, time: t.time, ticket: t.ticket });
          if (p.data && p.data.ok) {
            box.textContent = '';
            box.appendChild(el('h4', 'bt-title', 'Thanks, we have pencilled you in'));
            box.appendChild(el('p', 'note', nice(t.date) + ' at ' + clock(t.time) + ' is requested. We will be in touch shortly to confirm it.'));
          } else offer(box, lead, 'Sorry, that time has just gone. Here are the times still free.');
        });
        row.appendChild(b);
      });
      box.appendChild(row);
    });
    var no = el('button', 'bt-skip', 'No thanks, call me to arrange a time'); no.type = 'button';
    no.addEventListener('click', function () { box.hidden = true; });
    box.appendChild(no);
  }

  window.addEventListener('lead:sent', function (e) {
    var success = document.querySelector('.book-success');
    if (!success || !e.detail || !e.detail.id) return;
    var box = el('div', 'bt'); box.hidden = true;
    success.appendChild(box);
    offer(box, e.detail);
  });
})();
