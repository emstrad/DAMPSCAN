/* Change survey on a cancelled survey's page (the owner, 22 Nov 2026: "a small
   change survey button which runs them through the booking"): the booking
   form's own choices, the survey, how much of the home and add-ons, from the
   one price list the server sends, starting from what they had. Priced again
   on the server; this only shows the sum. Uses the page's own parts
   (portal-parts.js) so it names neither brand. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn;
  var pounds = function (n, from) { return (from ? 'from ' : '') + '£' + n; };

  /* o: the choices; had: what they booked; done(choice): back to the times. */
  function draw(area, o, had, done) {
    area.textContent = '';
    var pick = { service: had.service || 'damp', size: had.size, extras: (had.extras || []).slice() };
    var parts = [];
    function group(label, cls) { area.appendChild(t('div', 'pt-label', label)); var g = h('div', cls); area.appendChild(g); return g; }
    function choice(wrap, html, on, tap) { var b = btn(null, html, function () { tap(); sync(); }); wrap.appendChild(b); parts.push({ b: b, on: on }); return b; }

    var types = group('Your survey', 'pt-svc');
    o.services.forEach(function (s) { choice(types, '<b>' + s.name + '</b>', function () { return pick.service === s.key; }, function () { pick.service = s.key; }); });
    var sizes = group('How much of the home?', 'pt-svc'), price = {};
    o.sizes.forEach(function (z) {
      var b = choice(sizes, '<b>' + z.name + '</b><small>' + z.scope + '</small>', function () { return pick.size === z.key; }, function () { pick.size = z.key; });
      price[z.key] = t('span', 'pt-svc-price'); b.appendChild(price[z.key]);
    });
    var adds = group('Add on the same visit', 'pt-svc');
    o.extras.forEach(function (x) {
      choice(adds, '<b>' + x.name + '</b><span class="pt-svc-price">+' + pounds(x.price, x.from) + '</span>', function () { return pick.extras.indexOf(x.key) !== -1; }, function () {
        var i = pick.extras.indexOf(x.key); if (i === -1) pick.extras.push(x.key); else pick.extras.splice(i, 1);
      });
    });
    var sum = t('p', 'pt-svc-sum');
    area.appendChild(sum);
    var go = btn('pt-btn', '<span class="in">Use this survey</span>', function () { if (pick.service && pick.size) done({ service: pick.service, size: pick.size, extras: pick.extras }); });
    area.appendChild(go);
    area.appendChild(btn('pt-btn ghost', '<span class="in">Keep what I had</span>', function () { done(null); }));

    function sync() {
      parts.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.on())); });
      o.sizes.forEach(function (z) { price[z.key].textContent = pounds(z.damp + (pick.service === 'timber' ? z.timber : 0), z.from); });
      var z = o.sizes.filter(function (s) { return s.key === pick.size; })[0];
      go.disabled = !z;
      if (!z) { sum.textContent = 'Pick how much of the home.'; return; }
      var total = z.damp + (pick.service === 'timber' ? z.timber : 0), from = z.from;
      o.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) { total += x.price; from = from || x.from; } });
      sum.textContent = 'Total ' + pounds(total, from) + ', £' + (total / 2).toFixed(total % 2 ? 2 : 0) + ' deposit to book.';
    }
    sync();
  }

  global.PTSURVEY = { draw: draw };
})(window);
