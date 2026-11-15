/* "Your survey": one phone screen where the customer sees what we would book
   and its price, already filled in from what they told us, and changes only
   what they want (the owner's brief, 15 Nov 2026: least friction, no scroll).
   The recommendation with its reason, the four sizes as one row, timber as a
   switch, a few suggested checks as chips (never ticked for them), and the
   total and deposit fixed at the bottom. Prices come from content/prices.js
   through the server. Plain script, the same in the Lab and on the sites.
   window.SurveyPick.mount(el, { prices, known, cta, onChoose(pick) }) */
(function (global) {
  'use strict';
  var SHORT = { localised: 'Localised', 'full-house': 'Full house', 'large-property': 'Large', premium: 'Very large' };
  var GET = ['Readings and photos', 'The cause found', 'Report next day'];

  /* What we would book for them, and why, from what we know. */
  function recommend(k) {
    k = k || {};
    var buying = Boolean(k.buying || k.agent || k.previous);
    var beds = Number(k.beds) || 0;
    var one = !buying && k.scope === 'one';
    var size = one ? 'localised' : beds >= 6 || k.period ? 'premium' : beds >= 4 ? 'large-property' : 'full-house';
    var why = one ? 'One area, so a focused survey answers it for the smallest fee.'
      : buying ? 'You are buying, so we check the whole house before you commit.'
      : 'More than one area, so the whole house is checked in one visit.';
    var suggest = {};
    if (k.floors) suggest.camera = 'wooden floors or a musty smell';
    if (k.lowWall) suggest.cavity = 'damp low on a wall';
    if (buying || k.high) suggest.drone = buying ? 'you are buying and cannot see the roof' : 'damp upstairs or on a ceiling';
    return { size: size, timber: Boolean(k.timber), why: why, suggest: suggest, buying: buying };
  }

  function total(prices, pick) {
    var z = prices.sizes.filter(function (s) { return s.key === pick.size; })[0];
    if (!z) return { pounds: 0, from: false };
    var t = z.damp + (pick.timber ? z.timber : 0), from = z.from;
    prices.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) { t += x.withSurvey; from = from || Boolean(x.from); } });
    return { pounds: t, from: from };
  }

  function mount(root, opts) {
    var P = opts.prices, rec = recommend(opts.known), more = false;
    var pick = { size: rec.size, timber: rec.timber, extras: [] };
    var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var money = function (n, from) { return (from ? 'from ' : '') + '£' + (n % 1 ? n.toFixed(2) : n); };
    var btn = function (cls, fn) { var b = node('button', cls); b.type = 'button'; b.addEventListener('click', fn); return b; };
    var size = function () { return P.sizes.filter(function (s) { return s.key === pick.size; })[0]; };

    function draw() {
      root.textContent = '';
      var z = size(), wrap = node('div', 'sp');
      /* The survey we would book, with its price and the one reason. */
      var hero = node('div', 'sp-hero');
      var top = node('div', 'sp-hero-top');
      top.appendChild(node('b', null, z.name + (pick.timber ? ' damp and timber' : ' damp survey')));
      top.appendChild(node('span', 'sp-hero-price', money(z.damp + (pick.timber ? z.timber : 0), z.from)));
      hero.appendChild(top);
      hero.appendChild(node('p', 'sp-why', pick.size === rec.size ? rec.why : z.scope + '.'));
      var ticks = node('p', 'sp-ticks'); GET.forEach(function (g) { ticks.appendChild(node('span', null, g)); }); hero.appendChild(ticks);
      wrap.appendChild(hero);

      /* Size: one row of four, the recommended one marked. */
      var row = node('div', 'sp-sizes'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Size');
      P.sizes.forEach(function (s) {
        var b = btn('sp-size', function () { pick.size = s.key; draw(); });
        b.setAttribute('aria-pressed', String(pick.size === s.key));
        b.appendChild(node('b', null, SHORT[s.key] || s.name)); b.appendChild(node('span', null, money(s.damp, s.from)));
        if (s.key === rec.size) b.appendChild(node('i', 'sp-dot', 'Best fit'));
        row.appendChild(b);
      });
      wrap.appendChild(row);

      /* Timber and the checks as chips: suggested ones first, the rest one tap away. */
      var chips = node('div', 'sp-chips');
      var chip = function (label, on, hint, fn) {
        var b = btn('sp-chip' + (hint ? ' is-hint' : ''), fn); b.setAttribute('aria-pressed', String(on));
        b.appendChild(node('span', null, label)); chips.appendChild(b);
      };
      chip('Timber +' + money(z.timber), pick.timber, rec.timber, function () { pick.timber = !pick.timber; draw(); });
      var addable = P.extras.filter(function (x) { return x.addable; });
      var first = addable.filter(function (x) { return rec.suggest[x.key] || pick.extras.indexOf(x.key) !== -1; });
      var rest = addable.filter(function (x) { return first.indexOf(x) === -1; });
      (more ? first.concat(rest) : first).forEach(function (x) {
        var on = pick.extras.indexOf(x.key) !== -1;
        chip(x.name.replace(/^(Targeted |Low-level |Underfloor )/, '').replace(/^./, function (c) { return c.toUpperCase(); }) + ' +' + money(x.withSurvey, x.from), on, rec.suggest[x.key], function () {
          pick.extras = on ? pick.extras.filter(function (e) { return e !== x.key; }) : pick.extras.concat(x.key); draw();
        });
      });
      if (!more && rest.length) { var m = btn('sp-more', function () { more = true; draw(); }); m.textContent = '+ ' + rest.length + ' more checks'; chips.appendChild(m); }
      wrap.appendChild(node('p', 'sp-label', 'Add to the same visit'));
      wrap.appendChild(chips);
      var hints = Object.keys(rec.suggest).filter(function (k) { return pick.extras.indexOf(k) === -1; });
      if (rec.timber && !pick.timber) hints.unshift('timber');
      if (hints.length) wrap.appendChild(node('p', 'sp-hint', 'Dashed ones are suggested from what you told us: ' + hints.map(function (k) { return k === 'timber' ? 'rot or woodworm' : rec.suggest[k]; }).join('; ') + '.'));

      /* Always in view: the total, the deposit today, and on. */
      var t = total(P, pick), foot = node('div', 'sp-foot');
      var sum = node('div', 'sp-sum'); sum.appendChild(node('b', null, money(t.pounds, t.from)));
      sum.appendChild(node('span', null, money(Math.ceil(t.pounds * 50) / 100) + ' deposit today' + (t.from ? ', price confirmed before we come' : '')));
      foot.appendChild(sum);
      var go = btn('sp-go', function () { if (opts.onChoose) opts.onChoose({ service: pick.timber ? 'timber' : 'damp', size: pick.size, extras: pick.extras.slice(), recommended: { size: rec.size, timber: rec.timber }, totalPounds: t.pounds, minutes: z.minutes + 30 * pick.extras.length }); });
      go.textContent = opts.cta || 'Choose a time';
      foot.appendChild(go);
      wrap.appendChild(foot);
      root.appendChild(wrap);
    }
    draw();
  }

  global.SurveyPick = { mount: mount, recommend: recommend, total: total };
})(window);
