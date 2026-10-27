/* "What enquiries turned into": for each landing page and each source, how
   many enquiries came, how many were booked and paid, and (managers) the
   money paid, from lib/lead-outcomes.js. Joins the SEO view to the work. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  function cols(money, label) {
    var c = [
      { label: label, wrap: true, get: function (r) { return r.key; } },
      { label: 'Enquiries', get: function (r) { return U.num(r.enquiries); } },
      { label: 'Booked', get: function (r) { return U.num(r.booked) + ' (' + r.bookedRate + '%)'; } },
      { label: 'Paid', get: function (r) { return U.num(r.paid); } }
    ];
    if (money) c.push({ label: 'Money in', get: function (r) { return U.money(r.paidPence); } });
    return c;
  }
  function render(mount, o) {
    mount.textContent = '';
    if (!o) return;
    var money = (o.byPage[0] || o.bySource[0] || {}).paidPence !== undefined;
    [['By page they landed on', 'Page', o.byPage], ['By where they came from', 'Source', o.bySource]].forEach(function (t) {
      mount.appendChild(U.node('h3', null, t[0]));
      var box = U.node('div'); mount.appendChild(box);
      U.table(box, cols(money, t[1]), t[2], { empty: 'No enquiries in this period.' });
    });
  }
  global.DSOUTCOMES = { render: render };
})(window);
