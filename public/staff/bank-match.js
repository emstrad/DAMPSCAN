/* Matching payments to jobs, one card at a time.

   Every payment in that is not on a job yet gets a card: the money, who it
   is from, their reference, and the best guess, with what that job still
   owes. Yes matches it. "Someone else" searches the jobs still owed money.
   "Split across jobs" divides one payment between several jobs. "Not a job"
   moves on and leaves it in the list below to be sorted there. Customers use
   their first name as the reference, which is what the guess leans on most,
   with who has paid for whom before.

   The automatic Revolut feed's switch sits underneath. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var state = { lines: [], jobs: [], at: 0, feed: null, picks: [] };

  var panel = U.node('section', 'panel match');
  panel.setAttribute('aria-labelledby', 'h-match');
  var head = U.node('h2', null, 'Match payments');
  head.id = 'h-match';
  var card = U.node('div', 'match-card');
  var feedBox = U.node('div', 'feed-box');
  panel.appendChild(head);
  panel.appendChild(card);
  panel.appendChild(feedBox);
  var lines = document.querySelector('section.lines');
  lines.parentNode.insertBefore(panel, lines);

  var owed = function (j) { return Math.max(0, (j.surveyPricePence || 0) + (j.remedialPence || 0) - (j.receivedPence || 0)); };
  var day = function (iso) { return iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''; };
  var who = function (j) { return (j.customerName || j.firstName || 'Job ' + j.id) + (j.postcode ? ', ' + j.postcode : ''); };
  function qs() { var b = global.DSBANK && global.DSBANK.books(); return b ? '&books=' + b : ''; }

  function button(text, cls, fn) { var b = U.node('button', 'btn btn--sm ' + (cls || 'btn--ghost'), text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  async function send(body) {
    var res = await U.send('/api/admin/bank?' + qs().slice(1), body);
    if (!res.ok) { var e = (res.data && res.data.errors) || {}; throw new Error(e[Object.keys(e)[0]] || 'That could not be saved.'); }
    return res.data;
  }

  async function done() {
    await load();
    if (global.DSBANK) global.DSBANK.refresh();
  }

  async function match(tx, jobId) {
    try { await send({ id: tx.id, jobId: jobId }); await done(); } catch (e) { fail(e.message); }
  }

  function fail(m) { var err = card.querySelector('.err'); if (err) { err.textContent = m; err.classList.add('is-shown'); } }

  /* Jobs still owed money, best first for this payment: same amount, then
     the text typed. */
  function search(tx, text) {
    var t = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
    return state.jobs.filter(function (j) { return owed(j) > 0; }).filter(function (j) {
      if (!t) return true;
      var hay = [j.customerName, j.firstName, j.postcode, String(j.id), (owed(j) / 100).toFixed(2)].join(' ').toLowerCase().replace(/\s+/g, '');
      return hay.indexOf(t) !== -1;
    }).sort(function (a, b) { return (owed(b) === tx.amountPence) - (owed(a) === tx.amountPence) || String(b.jobDate).localeCompare(String(a.jobDate)); }).slice(0, 8);
  }

  function jobButton(j, onPick) {
    var b = U.node('button', 'match-job', '');
    b.type = 'button';
    b.appendChild(U.node('strong', null, who(j)));
    b.appendChild(U.node('span', null, (j.jobDate ? day(j.jobDate) + ' · ' : '') + U.money(owed(j)) + ' owed'));
    b.addEventListener('click', function () { onPick(j); });
    return b;
  }

  function searchBox(tx, onPick) {
    var wrap = U.node('div', 'match-search');
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Name, postcode or amount';
    input.setAttribute('aria-label', 'Find the job');
    var results = U.node('div', 'match-results');
    function draw() {
      results.textContent = '';
      var found = search(tx, input.value);
      if (!found.length) results.appendChild(U.node('p', 'panel-note', 'No job still owed money matches that.'));
      found.forEach(function (j) { results.appendChild(jobButton(j, onPick)); });
    }
    input.addEventListener('input', draw);
    wrap.appendChild(input);
    wrap.appendChild(results);
    draw();
    setTimeout(function () { input.focus(); }, 0);
    return wrap;
  }

  /* One payment for several jobs: pick them, each takes what it owes until
     the money runs out, and the amounts can be changed before saving. */
  function splitMode(tx) {
    var box = U.node('div', 'match-split');
    var list = U.node('div', 'match-picks');
    var left = U.node('p', 'panel-note');
    function remaining() { return tx.amountPence - state.picks.reduce(function (s, p) { return s + (U.toPence(p.input.value) || 0); }, 0); }
    function redraw() { left.textContent = remaining() === 0 ? 'All of ' + U.money(tx.amountPence) + ' is shared out.' : U.money(remaining()) + ' still to share out.'; }
    box.appendChild(U.node('p', null, 'Pick each job this payment covers.'));
    box.appendChild(searchBox(tx, function (j) {
      if (state.picks.some(function (p) { return p.job.id === j.id; })) return;
      var row = U.node('div', 'match-pick');
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = (Math.min(owed(j), Math.max(0, remaining())) / 100).toFixed(2);
      input.setAttribute('aria-label', 'Amount for ' + who(j));
      input.addEventListener('input', redraw);
      row.appendChild(U.node('span', null, who(j)));
      row.appendChild(input);
      list.appendChild(row);
      state.picks.push({ job: j, input: input });
      redraw();
    }));
    box.appendChild(list);
    box.appendChild(left);
    box.appendChild(button('Save the split', 'btn--primary', async function () {
      var parts = state.picks.map(function (p) { return U.toPence(p.input.value) || 0; });
      if (state.picks.length < 2 || remaining() !== 0) { fail('Pick at least two jobs, with amounts adding up to ' + U.money(tx.amountPence) + '.'); return; }
      try {
        var r = await send({ op: 'divide', id: tx.id, parts: parts });
        for (var i = 0; i < r.ids.length; i += 1) await send({ id: r.ids[i], jobId: state.picks[i].job.id });
        await done();
      } catch (e) { fail(e.message); }
    }));
    redraw();
    return box;
  }

  function draw(mode) {
    card.textContent = '';
    state.picks = [];
    var waiting = state.lines.length - state.at;
    head.textContent = 'Match payments' + (waiting > 0 ? ' (' + waiting + ' waiting)' : '');
    if (waiting <= 0) { card.appendChild(U.node('p', 'panel-note', 'All matched.')); return; }
    var tx = state.lines[state.at];
    var top = U.node('div', 'match-top');
    top.appendChild(U.node('span', 'match-amount', U.money(tx.amountPence)));
    top.appendChild(U.node('span', 'match-from', 'from ' + (tx.counterparty || tx.description) + ' on ' + day(tx.postedOn) + (tx.reference ? ' · reference "' + tx.reference + '"' : '')));
    card.appendChild(top);
    var guess = (tx.suggested || []).map(function (id) { return state.jobs.filter(function (j) { return j.id === id; })[0]; }).filter(Boolean)[0];
    if (mode === 'search') card.appendChild(searchBox(tx, function (j) { match(tx, j.id); }));
    else if (mode === 'split') card.appendChild(splitMode(tx));
    else if (guess) {
      var q = U.node('p', 'match-guess');
      q.appendChild(document.createTextNode('Is this '));
      q.appendChild(U.node('strong', null, who(guess)));
      q.appendChild(document.createTextNode('? ' + (guess.jobDate ? 'Job on ' + day(guess.jobDate) + ', ' : '') + U.money(owed(guess)) + ' owed.'));
      card.appendChild(q);
    } else card.appendChild(U.node('p', 'match-guess', 'No clear guess for this one.'));
    var actions = U.node('div', 'card-actions');
    if (!mode && guess) actions.appendChild(button('Yes', 'btn--primary', function () { match(tx, guess.id); }));
    if (mode !== 'search') actions.appendChild(button(guess && !mode ? 'Someone else' : 'Find the job', null, function () { draw('search'); }));
    if (mode !== 'split') actions.appendChild(button('Split across jobs', null, function () { draw('split'); }));
    if (mode) actions.appendChild(button('Back', null, function () { draw(); }));
    actions.appendChild(button('Not a job, skip', null, function () { state.at += 1; draw(); }));
    card.appendChild(actions);
    var err = U.node('span', 'err');
    err.setAttribute('role', 'alert');
    card.appendChild(err);
  }

  function drawFeed() {
    feedBox.textContent = '';
    var f = state.feed;
    if (!f) return;
    feedBox.appendChild(U.node('h3', null, 'Automatic import from Revolut'));
    var text = !f.configured ? 'Not connected yet. Once the Revolut Business API keys are added in Vercel, switch this on and statements arrive by themselves every morning; no more uploading.'
      : f.enabled ? 'On. Last fetched ' + (f.lastSyncedAt ? U.when(f.lastSyncedAt) : 'not yet') + (f.lastError ? '. Last problem: ' + f.lastError : '') + '.'
        : 'Connected and switched off. Switch it on to fetch statements every morning.';
    feedBox.appendChild(U.node('p', 'panel-note', text));
    if (f.configured) {
      feedBox.appendChild(button(f.enabled ? 'Switch off' : 'Switch on', null, async function () {
        try { state.feed = (await send({ op: 'feed', enabled: !f.enabled })).feed; drawFeed(); } catch (e) { feedBox.appendChild(U.node('p', 'err is-shown', e.message)); }
      }));
    }
  }

  async function load() {
    try {
      var d = await U.get('/api/admin/bank?view=in' + qs());
      state.lines = (d.transactions || []).filter(function (t) { return t.amountPence > 0 && !t.jobId && (!t.split || !t.split.length) && t.category !== 'transfer'; });
      state.jobs = d.jobs || [];
      state.feed = d.feed;
      state.at = 0;
      draw();
      drawFeed();
    } catch (e) { card.textContent = 'Could not load the payments to match.'; }
  }

  global.DSBANKMATCH = { load: load };
})(window);
