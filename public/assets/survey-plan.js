/* "Your survey plan" (option D, the owner's brief, 15 Nov 2026): the customer
   says what is going on and what they can see, and we build the survey the
   way a surveyor would on the phone. Three choices (Focused, Recommended,
   Complete), each a short list of checks in plain words, every one with the
   reason taken from what they told us and its price. Checks that cannot apply
   are never shown (no drone over a ground floor flat, no floor camera in an
   upstairs flat). Prices from content/prices.js through the server.
   window.SurveyPlan.build(answers, prices) and .mount(el, { prices, answers, onChoose }) */
(function (global) {
  'use strict';
  var has = function (a, k) { return (a.see || []).indexOf(k) !== -1; };

  /* The checks for one plan, each with why it is there for this customer. */
  function build(a, P) {
    var size = function (k) { return P.sizes.filter(function (s) { return s.key === k; })[0]; };
    var extra = function (k) { return P.extras.filter(function (x) { return x.key === k; })[0]; };
    var beds = Number(a.beds) || 3;
    var whole = beds >= 6 ? 'premium' : beds >= 4 ? 'large-property' : 'full-house';
    var flat = a.type === 'flat', upper = flat && a.floor === 'upper', groundFlat = flat && a.floor !== 'upper';
    var buying = a.situation === 'buying';
    var issues = (a.see || []).filter(function (k) { return k !== 'none' && k !== 'condensation'; });
    var onlyMould = !buying && issues.every(function (k) { return k === 'mould'; }) && (has(a, 'mould') || has(a, 'condensation'));
    var spread = buying || issues.length >= 2;
    var roofOk = !groundFlat;
    var floorOk = !upper;

    var core = function (k, focused) {
      var z = size(k);
      return { key: 'core', title: focused ? 'Find the cause in the affected area' : 'Find the cause, not just the symptom',
        what: (focused ? 'The rooms with the problem' : 'Every room') + ', inside and out, with moisture readings and photos. ' + z.name + ': ' + z.scope.toLowerCase() + '.',
        price: z.damp, from: z.from, fixed: true };
    };
    var timber = function (k, why) { return { key: 'timber', title: 'Check the timbers', what: 'Floors, skirtings and the loft checked for rot and woodworm, with timber readings.', why: why, price: size(k).timber }; };
    var camera = function (why) { var x = extra('camera'); return { key: 'camera', title: 'Look under your floors', what: 'A small camera goes under the floorboards, so we see the joists and air bricks without lifting anything.', why: why, price: x.withSurvey }; };
    var drone = function (why) { var x = extra('drone'); return { key: 'drone', title: 'Check your roof from the air', what: 'Close-up photos of the roof, chimney, flashings and gutters, with no ladders or scaffolding. Not charged if we cannot fly on the day.', why: why, price: x.withSurvey }; };
    var cavity = function (why) { var x = extra('cavity'); return { key: 'cavity', title: 'Check the bottom of the cavity wall', what: 'Rubble left in a cavity can carry damp across. We check up to three points with a small camera.', why: why, price: x.withSurvey }; };

    var rec = [core(spread ? whole : 'localised', !spread)], recSize = spread ? whole : 'localised';
    if (has(a, 'rot') || has(a, 'woodworm')) rec.push(timber(recSize, has(a, 'woodworm') ? 'You saw woodworm holes.' : 'You saw rotten or soft wood.'));
    if (has(a, 'rot') && floorOk) rec.push(camera('Soft or musty floors usually mean damp underneath.'));
    if (roofOk && (has(a, 'leak') || (buying && !flat))) rec.push(drone(has(a, 'leak') ? 'Damp upstairs or after rain usually starts at the roof or chimney.' : 'You cannot see the roof yourself before you buy.'));
    if (has(a, 'tide') && !flat) rec.push(cavity('A tide mark low on the wall can come from a bridged cavity.'));

    var plans = [];
    if (!buying) plans.push({ key: 'focused', name: 'Focused', note: 'Just the problem area', size: 'localised', lines: [core('localised', true)] });
    /* A buyer always has a plain choice too: the whole house, survey only. */
    else if (rec.length > 1) plans.push({ key: 'essential', name: 'Essential', note: 'The survey on its own', size: whole, lines: [core(whole, false)] });
    plans.push({ key: 'recommended', name: 'Recommended', note: 'What we would do', size: recSize, lines: rec });
    var full = [core(whole, false), timber(whole, 'Peace of mind on every timber.')];
    if (floorOk) full.push(camera('Under the floors, where rot starts unseen.'));
    if (roofOk) full.push(drone('The roof and chimney, where most leaks start.'));
    plans.push({ key: 'complete', name: 'Complete', note: 'Everything we can check', size: whole, lines: full });
    plans.forEach(function (p) { p.total = p.lines.reduce(function (t, l) { return t + l.price; }, 0); p.from = p.lines.some(function (l) { return l.from; }); });
    /* When the recommendation is already everything, two cards say the same: drop the duplicate. */
    var r = plans.filter(function (p) { return p.key === 'recommended'; })[0], c = plans[plans.length - 1];
    if (r.total === c.total && r.lines.length === c.lines.length) plans.pop();

    var lead = buying ? 'Before you exchange, know exactly what you are buying.'
      : a.situation === 'quote' ? 'We will tell you if the work is really needed. We sell no damp work, so we have no reason to say yes.'
      : onlyMould ? 'Mould is usually condensation. We will prove the cause and show you how to stop it.'
      : a.situation === 'landlord' ? 'A clear, independent report you can act on and show your tenant.'
      : 'We find what is causing it, so you only fix what needs fixing.';
    return { plans: plans, lead: lead, pick: 'recommended' };
  }

  function mount(root, o) {
    var P = o.prices, plan = build(o.answers, P), pick = plan.pick, off = {};
    var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var money = function (n, from) { return (from ? 'from ' : '') + '£' + (n % 1 ? n.toFixed(2) : n); };
    function draw() {
      root.textContent = '';
      var wrap = node('div', 'pl');
      wrap.appendChild(node('p', 'pl-lead', plan.lead));
      var cards = node('div', 'pl-cards');
      plan.plans.forEach(function (p) {
        var b = node('button', 'pl-card'); b.type = 'button'; b.setAttribute('aria-pressed', String(pick === p.key));
        if (p.key === 'recommended') b.appendChild(node('i', 'pl-best', 'Best for you'));
        b.appendChild(node('b', null, p.name)); b.appendChild(node('span', 'pl-price', money(p.total, p.from))); b.appendChild(node('small', null, p.note));
        b.addEventListener('click', function () { pick = p.key; off = {}; draw(); });
        cards.appendChild(b);
      });
      wrap.appendChild(cards);
      var chosen = plan.plans.filter(function (p) { return p.key === pick; })[0];
      wrap.appendChild(node('p', 'pl-h', 'Here is what we will do'));
      var total = 0, from = false;
      chosen.lines.forEach(function (l) {
        var on = !off[l.key];
        if (on) { total += l.price; from = from || Boolean(l.from); }
        var row = node('div', 'pl-line' + (on ? '' : ' is-off'));
        var head = node('div', 'pl-line-top');
        head.appendChild(node('b', null, l.title));
        head.appendChild(node('span', null, (l.fixed ? '' : '+') + money(l.price, l.from)));
        row.appendChild(head);
        if (l.why) row.appendChild(node('p', 'pl-why', l.why));
        row.appendChild(node('p', 'pl-what', l.what));
        if (!l.fixed) {
          var t = node('button', 'pl-toggle', on ? 'Remove' : 'Add back'); t.type = 'button';
          t.addEventListener('click', function () { off[l.key] = on; draw(); }); row.appendChild(t);
        }
        wrap.appendChild(row);
      });
      var get = node('p', 'pl-get', 'You get a written report the next day: photos, the readings, the cause, and what to do in what order.');
      wrap.appendChild(get);
      var foot = node('div', 'sp-foot'), sum = node('div', 'sp-sum');
      sum.appendChild(node('b', null, money(total, from)));
      sum.appendChild(node('span', null, money(Math.ceil(total * 50) / 100) + ' deposit today' + (from ? ', price confirmed before we come' : '')));
      foot.appendChild(sum);
      var go = node('button', 'sp-go', o.cta || 'Choose a time'); go.type = 'button';
      go.addEventListener('click', function () {
        var lines = chosen.lines.filter(function (l) { return !off[l.key]; });
        var minutes = (P.sizes.filter(function (s) { return s.key === chosen.size; })[0] || {}).minutes || 60;
        o.onChoose({ plan: chosen.key, size: chosen.size, service: lines.some(function (l) { return l.key === 'timber'; }) ? 'timber' : 'damp',
          extras: lines.map(function (l) { return l.key; }).filter(function (k) { return k !== 'core' && k !== 'timber'; }), totalPounds: total, minutes: minutes + 30 * lines.filter(function (l) { return ['camera', 'drone', 'cavity'].indexOf(l.key) !== -1; }).length });
      });
      foot.appendChild(go); wrap.appendChild(foot);
      root.appendChild(wrap);
    }
    draw();
  }

  global.SurveyPlan = { build: build, mount: mount };
})(window);
