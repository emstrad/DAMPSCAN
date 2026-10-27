/* Search on Scheduling: type a name, postcode, phone, email or a word from
   their message and every customer on the board that matches shows, best
   first, so "do we have a callback for her?" takes a second. Forgiving:
   one wrong letter in a longer word still matches, postcodes and phone
   numbers match whatever the spacing, and a number matches from any part.
   Tap a result for the customer card. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var STAGE = { new: 'New enquiry', contacted: 'Contacted', waiting: 'Waiting for time' };
  var squash = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim(); };
  var digits = function (s) { return String(s || '').replace(/\D/g, '').replace(/^44/, '0'); };

  /* Letters to change to turn one word into the other, stopping past max. */
  function edits(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /* One slip in a word of four or more letters, two in seven or more. */
  function near(w, t) { var max = t.length >= 7 ? 2 : 1; return edits(w, t, max) <= max; }

  /* How well one card fits the words typed; 0 when any word misses. */
  function score(c, q) {
    var hay = squash([c.name, c.postcode, c.email, c.street, c.notes, c.wanted, (c.issues || []).join(' ')].join(' '));
    var words = hay.split(' ');
    var pc = squash(c.postcode).replace(/ /g, ''), ph = digits(c.phone);
    var total = 0;
    var terms = squash(q).split(' ').filter(Boolean);
    for (var k = 0; k < terms.length; k++) {
      var t = terms[k], best = 0;
      if (/^\d{3,}$/.test(t.replace(/ /g, '')) && ph.indexOf(digits(t)) >= 0) best = 5;
      if (squash(c.name).split(' ').some(function (w) { return w.indexOf(t) === 0; })) best = Math.max(best, 6);
      if (pc && pc.indexOf(t) === 0) best = Math.max(best, 5);
      if (!best && hay.indexOf(t) >= 0) best = 3;
      if (!best && t.length >= 4 && words.some(function (w) { return near(w, t); })) best = 2;
      if (!best) return 0;
      total += best;
    }
    /* A whole number typed as one block, spaces and all. */
    return total;
  }

  function wire(input, list, opts) {
    function run() {
      var q = input.value.trim();
      list.textContent = '';
      list.hidden = !q;
      if (!q) return;
      var phoneQ = digits(q);
      var hits = (opts.cards() || []).map(function (c) {
        var s = score(c, q);
        if (!s && phoneQ.length >= 4 && digits(c.phone).indexOf(phoneQ) >= 0) s = 5;
        return { c: c, s: s };
      }).filter(function (h) { return h.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 8);
      if (!hits.length) { list.appendChild(U.node('li', 'panel-note', 'Nobody on the board matches. Closed and booked customers are in the search at the top of the page.')); return; }
      hits.forEach(function (h) {
        var c = h.c;
        var b = U.node('button', 'ss-hit'); b.type = 'button';
        b.appendChild(U.node('b', null, (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : '')));
        var last = c.log && c.log.length ? c.log[c.log.length - 1] : null;
        b.appendChild(U.node('span', 'meta', [STAGE[c.stage], c.phone, last ? 'last: ' + (last.note || last.how) : 'nobody in touch yet'].filter(Boolean).join(' · ')));
        b.addEventListener('click', function () { opts.open(c); });
        var li = document.createElement('li'); li.appendChild(b); list.appendChild(li);
      });
    }
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; run(); } if (e.key === 'Enter') { var f = list.querySelector('button'); if (f) f.click(); } });
    return { refresh: run };
  }
  global.DSSCHEDSEARCH = { wire: wire, score: score };
})(window);
