/* The Lab's booking flows, to try as a customer side by side (the owner's ask,
   15 Nov 2026): A the order today with the new survey screen, B price first
   and details last, C the hybrid (details, about the home, survey, time,
   finish). Real free times for the postcode typed; nothing is saved or sent.
   Each run ends with how many screens, taps and seconds it took. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var FLOWS = {
    A: { name: 'A. Today\'s order', steps: ['you', 'problem', 'property', 'who', 'extras', 'survey', 'time', 'done'] },
    B: { name: 'B. Price first', steps: ['about', 'survey', 'time', 'details', 'done'] },
    C: { name: 'C. Hybrid', steps: ['you', 'about', 'survey', 'time', 'finish', 'done'] }
  };
  var SEE = [['patch', 'Damp patches'], ['mould', 'Mould'], ['timber', 'Rot or woodworm'], ['floors', 'Soft or musty floors'], ['lowWall', 'Damp low on a wall'], ['high', 'Damp upstairs or ceiling']];
  var short = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var nice = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };
  var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function start(frame, flowKey, prices) {
    var flow = FLOWS[flowKey], at = 0, taps = 0, t0 = Date.now(), d = { see: [] };
    frame.onclick = function (e) { if (e.target.closest('button, label, input')) taps += 1; };

    function shell(title) {
      frame.textContent = '';
      var bar = node('div', 'lf-bar'), fill = node('i'); fill.style.width = Math.round(100 * at / (flow.steps.length - 1)) + '%'; bar.appendChild(fill); frame.appendChild(bar);
      if (at > 0 && flow.steps[at] !== 'done') { var back = node('button', 'lf-back', 'Back'); back.type = 'button'; back.addEventListener('click', function () { at -= 1; show(); }); frame.appendChild(back); }
      frame.appendChild(node('h3', 'lf-q', title));
      var body = node('div', 'lf-body'); frame.appendChild(body); return body;
    }
    function next() { at += 1; show(); }
    function field(body, key, label, type) {
      var l = node('label', 'lf-field'); l.appendChild(node('span', null, label));
      var i = document.createElement('input'); i.type = type || 'text'; i.value = d[key] || ''; i.addEventListener('input', function () { d[key] = i.value; });
      l.appendChild(i); body.appendChild(l); return i;
    }
    function go(body, text, ok) {
      var b = node('button', 'lf-go', text || 'Continue'); b.type = 'button';
      b.addEventListener('click', function () { if (!ok || ok()) next(); }); body.appendChild(b); return b;
    }
    /* One tap picks and, on its own row, moves on when it is the last thing asked. */
    function chips(body, label, list, key, multi, after) {
      if (label) body.appendChild(node('p', 'lf-label', label));
      var row = node('div', 'lf-chips');
      list.forEach(function (o) {
        var b = node('button', 'lf-chip', o[1]); b.type = 'button';
        var on = function () { return multi ? d[key].indexOf(o[0]) !== -1 : d[key] === o[0]; };
        b.setAttribute('aria-pressed', String(on()));
        b.addEventListener('click', function () {
          if (multi) d[key] = on() ? d[key].filter(function (x) { return x !== o[0]; }) : d[key].concat(o[0]); else d[key] = o[0];
          if (after) after(); else b.parentNode.querySelectorAll('.lf-chip').forEach(function (x, i) { x.setAttribute('aria-pressed', String(multi ? d[key].indexOf(list[i][0]) !== -1 : d[key] === list[i][0])); });
        });
        row.appendChild(b);
      });
      body.appendChild(row);
    }
    var buying = function () { return d.why === 'buying' || d.who === 'agent'; };
    function known() {
      var k = { buying: buying(), beds: d.beds, scope: d.scope };
      d.see.forEach(function (s) { k[s] = true; });
      return k;
    }

    var SCREENS = {
      you: function () {
        var b = shell('Book your damp survey');
        field(b, 'name', 'Your name'); field(b, 'email', 'Email', 'email');
        if (flowKey === 'C') field(b, 'phone', 'Phone (so we can call if anything is unclear)', 'tel');
        field(b, 'postcode', 'Property postcode');
        go(b, null, function () { return (d.postcode || '').trim().length >= 5; });
      },
      problem: function () { var b = shell('What can you see?'); chips(b, null, SEE, 'see', true); go(b); },
      property: function () {
        var b = shell('The property');
        field(b, 'address', 'Address'); field(b, 'phone', 'Phone number', 'tel');
        chips(b, 'Buying, or your own home?', [['buying', 'Buying'], ['own', 'My home']], 'why', false);
        chips(b, 'Bedrooms', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']], 'beds', false);
        go(b, null, function () { return d.why && d.beds; });
      },
      who: function () {
        var b = shell('Who will let us in?');
        chips(b, null, [['me', 'Me'], ['agent', 'The estate agent']], 'who', false, function () { flowKey === 'A' ? next() : show(); });
      },
      extras: function () {
        var b = shell('Anything else? (optional)');
        var p = node('button', 'lf-ghost', 'Add photos'); p.type = 'button'; b.appendChild(p);
        var note = node('textarea', 'lf-note'); note.placeholder = 'A note for the surveyor'; b.appendChild(note);
        var s = node('button', 'lf-ghost', 'Add a previous survey'); s.type = 'button'; b.appendChild(s);
        go(b, 'Continue');
      },
      about: function () {
        var b = shell('About the property');
        if (flowKey === 'B') field(b, 'postcode', 'Postcode');
        chips(b, 'Buying, or your own home?', [['buying', 'Buying'], ['own', 'My home']], 'why', false, function () { show(); });
        chips(b, 'Bedrooms', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']], 'beds', false);
        if (d.why === 'own') chips(b, 'How much is affected?', [['one', 'One area'], ['whole', 'Several rooms']], 'scope', false);
        chips(b, 'What can you see? (any)', SEE, 'see', true);
        go(b, 'See my price', function () { return d.why && d.beds && (d.why === 'buying' || d.scope) && (flowKey !== 'B' || (d.postcode || '').trim().length >= 5); });
      },
      survey: function () {
        var b = shell('Your survey');
        global.SurveyPick.mount(b, { prices: prices, known: known(), onChoose: function (p) { d.pick = p; next(); } });
      },
      time: function () {
        var b = shell('Pick a day');
        b.appendChild(node('p', 'lf-note-s', 'Finding free times...'));
        U.get('/api/admin/hours?view=slots&postcode=' + encodeURIComponent(d.postcode || 'ME19 6AB') + '&minutes=' + ((d.pick && d.pick.minutes) || 60)).then(function (r) {
          b.textContent = '';
          var byDay = {}; (r.slots || []).forEach(function (s) { (byDay[s.date] = byDay[s.date] || []).push(s); });
          var days = Object.keys(byDay).sort().slice(0, 14);
          if (!days.length) { b.appendChild(node('p', null, 'No free times for that postcode. The customer would be told we will call.')); go(b); return; }
          var row = node('div', 'lf-chips lf-days'), times = node('div', 'lf-chips');
          days.forEach(function (dd) {
            var c = node('button', 'lf-chip', short(dd)); c.type = 'button';
            c.addEventListener('click', function () {
              row.querySelectorAll('.lf-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
              times.textContent = '';
              byDay[dd].forEach(function (s) { var t = node('button', 'lf-chip', nice(s.time)); t.type = 'button'; t.addEventListener('click', function () { d.when = short(dd) + ' at ' + nice(s.time); next(); }); times.appendChild(t); });
            });
            row.appendChild(c);
          });
          b.appendChild(row); b.appendChild(node('p', 'lf-label', 'Then a time')); b.appendChild(times);
        }, function () { b.textContent = 'Times could not load.'; go(b); });
      },
      details: function () {
        var b = shell('Your details');
        field(b, 'name', 'Your name'); field(b, 'email', 'Email', 'email'); field(b, 'phone', 'Phone', 'tel'); field(b, 'address', 'Property address');
        chips(b, 'Who will let us in?', [['me', 'Me'], ['agent', 'The estate agent']], 'who', false);
        go(b, 'Book it', function () { return d.name && d.who; });
      },
      finish: function () {
        var b = shell('Last bit');
        field(b, 'address', 'Property address');
        chips(b, 'Who will let us in?', [['me', 'Me'], ['agent', 'The estate agent']], 'who', false);
        go(b, 'Book it', function () { return d.address && d.who; });
      },
      done: function () {
        var b = shell('Booked');
        var p = d.pick || {}, z = (prices.sizes.filter(function (s) { return s.key === p.size; })[0] || {});
        b.appendChild(node('p', 'lf-done', (z.name || '') + (p.service === 'timber' ? ' damp and timber' : ' damp survey') + ', £' + (p.totalPounds || 0) + (d.when ? ', ' + d.when : '')));
        b.appendChild(node('p', 'lf-note-s', 'On the live site: the booked text with the deposit link goes now. Nothing was saved here.'));
        var stats = node('p', 'lf-stats', flow.name + ': ' + (flow.steps.length - 1) + ' screens, ' + taps + ' taps, ' + Math.round((Date.now() - t0) / 1000) + ' seconds');
        b.appendChild(stats);
        var again = node('button', 'lf-ghost', 'Try again'); again.type = 'button'; again.addEventListener('click', function () { start(frame, flowKey, prices); }); b.appendChild(again);
      }
    };
    function show() { SCREENS[flow.steps[at]](); frame.scrollTop = 0; }
    show();
  }

  global.DSLabFlows = { FLOWS: FLOWS, start: start };
})(window);
