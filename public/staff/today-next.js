/* Today's "Up next" (the owner's preview, 16 Nov 2026): the next visit that
   has not happened yet, with what you need for it, above the week. Directions
   and Call are one tap; Open is its customer card. Nothing when nothing is due. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var londonNow = function () { var p = new Date().toLocaleString('en-CA', { timeZone: 'Europe/London', hour12: false }).replace(',', ''); return p.slice(0, 16); };
  var dayWord = function (d, today) { return d === today ? 'Today' : new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };

  function draw(mount, events, open) {
    var now = londonNow(), today = now.slice(0, 10);
    var next = (events || []).filter(function (e) { return e.kind === 'job' && e.dateSet !== false && e.time && e.status === 'booked' && (e.date + ' ' + e.time) >= now; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })[0];
    if (!next) return;
    var mins = Math.round((new Date(next.date + 'T' + next.time + ':00') - new Date(now.replace(' ', 'T') + ':00')) / 60000);
    var when = next.date === today ? (mins < 60 ? 'in ' + Math.max(mins, 0) + ' min' : 'at ' + next.time) : dayWord(next.date, today) + ' ' + next.time;
    var box = U.node('section', 'up-next');
    var top = U.node('div', 'up-top');
    top.appendChild(U.node('span', 'c-label', 'Up next · ' + when));
    if (!next.quoted) top.appendChild(U.node('span', 'c-tag ' + (next.depositPaid || next.paid ? 'is-good' : 'is-warn'), next.paid ? 'Paid' : next.depositPaid ? 'Deposit in' : 'Deposit due'));
    box.appendChild(top);
    box.appendChild(U.node('b', 'up-who', next.time + ' · ' + (next.customerName || 'No name')));
    box.appendChild(U.node('span', 'up-sub', [next.postcode, next.surveyLabel, next.surveyor && next.surveyor.charAt(0).toUpperCase() + next.surveyor.slice(1)].filter(Boolean).join(' · ')));
    var row = U.node('div', 'j-quick');
    if (next.postcode) { var d = U.node('a', 'j-quick-b', 'Directions'); d.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(next.postcode); d.target = '_blank'; d.rel = 'noopener'; row.appendChild(d); }
    if (next.phone) { var c = U.node('a', 'j-quick-b', 'Call'); c.href = 'tel:' + String(next.phone).replace(/[^\d+]/g, ''); row.appendChild(c); }
    var o = U.node('button', 'j-quick-b is-main', 'Open'); o.type = 'button'; o.addEventListener('click', function () { open(next); }); row.appendChild(o);
    box.appendChild(row);
    mount.insertBefore(box, mount.firstChild);
  }

  global.DSTODAYNEXT = { draw: draw };
})(window);
