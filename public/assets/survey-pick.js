/* "Your survey": the one step where a customer chooses what they are booking
   (the owner's brief, 15 Nov 2026). It starts from what the form already told
   us (buying, the agent letting us in, a previous survey, what they can see),
   asks the bedrooms every time, recommends a size with the reason, lets them
   pick any of the four sizes, add timber and any extra check, and shows what
   they get, the total and the deposit now. Suggested extras are never ticked
   for them (no pre-ticked paid extras). Prices come from content/prices.js
   through the server. Plain script, the same in the Lab and on the sites.
   window.SurveyPick.mount(el, { prices, known, onChoose(pick) }) */
(function (global) {
  'use strict';
  var BEDS = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']];
  var GET = ['Calibrated readings and photographs', 'The cause found, not just the symptom', 'A written report the next day', 'Independent: we sell no damp work'];

  /* What we would book for them, and why, from what we know. */
  function recommend(k, prices) {
    k = k || {};
    var buying = Boolean(k.buying || k.agent || k.previous);
    var beds = Number(k.beds) || 0;
    var size = !buying && k.scope === 'one' ? 'localised'
      : beds >= 6 || k.period ? 'premium' : beds >= 4 ? 'large-property' : 'full-house';
    var timber = Boolean(k.timber);
    var why = !buying && k.scope === 'one' ? 'One area, so a focused survey answers it for the smallest fee.'
      : buying ? 'You are buying, so we check the whole house before you commit.'
      : 'Several areas, so the whole house is checked in one visit.';
    if (size === 'large-property') why += ' Four or five bedrooms take longer to check properly.';
    if (size === 'premium') why += ' A home this size, or a period one, needs the longest visit.';
    if (timber) why += ' You mentioned rot or woodworm, so timber is included.';
    var suggest = {};
    if (k.floors) suggest.camera = 'You mentioned wooden floors or a musty smell.';
    if (k.lowWall) suggest.cavity = 'You mentioned damp low on a wall.';
    if (buying || k.high) suggest.drone = buying ? 'You are buying and cannot see the roof yourself.' : 'You mentioned damp upstairs or on a ceiling.';
    return { size: size, timber: timber, why: why, suggest: suggest, buying: buying };
  }

  function total(prices, pick) {
    var z = prices.sizes.filter(function (s) { return s.key === pick.size; })[0];
    if (!z) return { pounds: 0, from: false };
    var t = z.damp + (pick.timber ? z.timber : 0), from = z.from;
    prices.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) { t += x.withSurvey; from = from || Boolean(x.from); } });
    return { pounds: t, from: from };
  }

  function mount(root, opts) {
    var P = opts.prices, k = Object.assign({}, opts.known || {});
    var pick = null, rec = null;
    var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var money = function (n, from) { return (from ? 'from ' : '') + '£' + (n % 1 ? n.toFixed(2) : n); };
    var btn = function (cls, text, fn) { var b = node('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };

    function draw() {
      root.textContent = '';
      root.appendChild(node('h4', 'sp-title', 'How many bedrooms?'));
      var beds = node('div', 'sp-chips');
      BEDS.forEach(function (b) {
        var c = btn('sp-chip', b[1], function () { k.beds = Number(b[0]); pick = null; draw(); });
        c.setAttribute('aria-pressed', String(Number(k.beds) === Number(b[0]))); beds.appendChild(c);
      });
      root.appendChild(beds);
      if (!k.beds) return;
      /* Not buying: one question more, how much is affected. Buying always means the whole house. */
      if (!(k.buying || k.agent || k.previous)) {
        root.appendChild(node('h4', 'sp-title', 'How much is affected?'));
        var sc = node('div', 'sp-chips');
        [['one', 'One area'], ['whole', 'Several rooms, or the whole house']].forEach(function (o) {
          var c = btn('sp-chip', o[1], function () { k.scope = o[0]; pick = null; draw(); });
          c.setAttribute('aria-pressed', String(k.scope === o[0])); sc.appendChild(c);
        });
        root.appendChild(sc);
        if (!k.scope) return;
      }
      rec = recommend(k, P);
      if (!pick) pick = { size: rec.size, timber: rec.timber, extras: [] };
      sizes(); timber(); extras(); summary();
    }

    function sizes() {
      root.appendChild(node('h4', 'sp-title', 'Your survey'));
      root.appendChild(node('p', 'sp-why', rec.why));
      var list = node('div', 'sp-sizes');
      P.sizes.forEach(function (z) {
        var c = btn('sp-size', '', function () { pick.size = z.key; draw2(); });
        c.setAttribute('aria-pressed', String(pick.size === z.key));
        var top = node('span', 'sp-size-top'); top.appendChild(node('b', null, z.name));
        if (z.key === rec.size) top.appendChild(node('em', 'sp-tag', 'Recommended'));
        c.appendChild(top);
        c.appendChild(node('span', 'sp-scope', z.scope + ' · about ' + (z.minutes >= 120 ? z.minutes / 60 + ' hours' : 'an hour') + ' on site'));
        c.appendChild(node('span', 'sp-price', money(z.damp, z.from)));
        c.appendChild(node('span', 'sp-info', z.info));
        list.appendChild(c);
      });
      root.appendChild(list);
    }

    function timber() {
      var z = P.sizes.filter(function (s) { return s.key === pick.size; })[0];
      var row = node('label', 'sp-switch'), c = document.createElement('input'); c.type = 'checkbox'; c.checked = pick.timber;
      c.addEventListener('change', function () { pick.timber = c.checked; draw2(); });
      row.appendChild(c);
      var t = node('span'); t.appendChild(node('b', null, 'Add timber, +' + money(z.timber)));
      t.appendChild(node('small', null, P.services.timber.info + (rec.timber ? ' Recommended: you mentioned rot or woodworm.' : '')));
      row.appendChild(t); root.appendChild(row);
    }

    function extras() {
      root.appendChild(node('h4', 'sp-title', 'Add on the same visit'));
      P.extras.filter(function (x) { return x.addable; }).forEach(function (x) {
        var row = node('label', 'sp-switch' + (rec.suggest[x.key] ? ' is-suggested' : '')), c = document.createElement('input'); c.type = 'checkbox';
        c.checked = pick.extras.indexOf(x.key) !== -1;
        c.addEventListener('change', function () { pick.extras = pick.extras.filter(function (e) { return e !== x.key; }); if (c.checked) pick.extras.push(x.key); draw2(); });
        row.appendChild(c);
        var t = node('span'); t.appendChild(node('b', null, x.name + ', +' + money(x.withSurvey, x.from)));
        if (rec.suggest[x.key]) t.appendChild(node('em', 'sp-tag', 'Suggested'));
        /* Suggested: our reason, then what it is. Otherwise when you would want it. */
        t.appendChild(node('small', null, rec.suggest[x.key] ? rec.suggest[x.key] + ' ' + x.info : (x.when || x.info)));
        if (x.alone) t.appendChild(node('small', 'sp-save', money(x.alone) + ' on its own, ' + money(x.withSurvey) + ' with your survey.'));
        row.appendChild(t); root.appendChild(row);
      });
    }

    function summary() {
      var box = node('div', 'sp-sum'), t = total(P, pick);
      var ul = node('ul', 'sp-get'); GET.forEach(function (g) { ul.appendChild(node('li', null, g)); }); box.appendChild(ul);
      var line = node('p', 'sp-total'); line.appendChild(node('span', null, 'Total')); line.appendChild(node('b', null, money(t.pounds, t.from))); box.appendChild(line);
      box.appendChild(node('p', 'sp-dep', money(Math.ceil(t.pounds * 50) / 100) + ' deposit to secure it, the rest when your report is ready.' + (t.from ? ' A "from" price is confirmed before we come.' : '')));
      box.appendChild(btn('sp-go', 'Choose a time', function () { if (opts.onChoose) opts.onChoose({ service: pick.timber ? 'timber' : 'damp', size: pick.size, extras: pick.extras.slice(), recommended: { size: rec.size, timber: rec.timber }, beds: k.beds, totalPounds: t.pounds }); }));
      box.appendChild(node('p', 'sp-call', 'Rather talk it through first? Call us and we will help you choose.'));
      root.appendChild(box);
    }
    /* A change below the questions redraws from the survey down, keeping the place on the page. */
    function draw2() { var y = global.scrollY; draw(); global.scrollTo(0, y); }
    draw();
  }

  global.SurveyPick = { mount: mount, recommend: recommend, total: total };
})(window);
