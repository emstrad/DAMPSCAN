/* What's next (the owner, 19 Nov 2026): the To-do page as "what's going on".
   Every open customer once, one next step each, in whose-move order: Your move
   (Needs you now first), Waiting on them, Waiting on agent, Booked, with Gone
   cold folded at the end. Each row says the step, why and since when, the last
   contact, the money owed and the to-dos set about them, which tick off and
   add right there. Tapping a row opens their customer card. The same picture
   the server keeps for ChatGPT and Claude (lib/next-up.js, customer_state). */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };
  var LANES = { us: ['now', 'us'], them: ['them'], agent: ['agent'], booked: ['booked'] };
  var state = { lane: 'us', data: null, q: '' };
  var pounds = function (p) { return '£' + (p / 100).toFixed(p % 100 ? 2 : 0); };
  var squash = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };

  /* "3 days", "5 hours", "just now". */
  function ago(iso) {
    if (!iso) return '';
    var mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 60) return mins < 2 ? 'just now' : mins + ' min';
    var h = Math.round(mins / 60);
    if (h < 24) return h + (h === 1 ? ' hour' : ' hours');
    var d = Math.floor(h / 24);
    return d + (d === 1 ? ' day' : ' days');
  }
  var HOW = { call: 'Called', email: 'Emailed', text: 'Texted' };
  function contactLine(c) {
    if (!c) return 'Nobody in touch yet';
    var who = c.dir === 'in' ? 'They ' + (c.how === 'email' ? 'emailed' : c.how === 'text' ? 'texted' : 'called') : (HOW[c.how] || 'In touch') + (c.by ? ' by ' + c.by : '');
    return who + ', ' + ago(c.at) + ' ago';
  }

  function open(r) {
    if (r.jobId && global.DSPOP) { global.DSPOP.open(r.jobId, { onChange: load }); return; }
    if (r.href) { location.href = r.href; return; }
    if (r.leadId) location.href = '/staff/schedule.html?area=damp#lead-' + r.leadId;
  }

  function row(r) {
    var li = U.node('li', 'nu-item' + (r.lane === 'now' ? ' is-now' : ''));
    var b = U.node('button', 'c-row nu-row'); b.type = 'button';
    var l = U.node('span', 'c-l');
    l.appendChild(U.node('b', null, (r.name || 'No name') + (r.postcode ? ', ' + r.postcode : '')));
    l.appendChild(U.node('span', 'nu-next', r.next));
    l.appendChild(U.node('small', null, [r.why, r.since ? ago(r.since) : null].filter(Boolean).join(' · ')));
    l.appendChild(U.node('small', 'nu-contact', contactLine(r.lastContact)));
    var right = U.node('span', 'c-r');
    if (r.owedPence) right.appendChild(U.node('span', 'c-tag is-warn', pounds(r.owedPence)));
    if (r.oldMoney) right.appendChild(U.node('span', 'c-tag', 'Old money'));
    right.appendChild(U.node('span', 'c-chev', '›'));
    b.appendChild(l); b.appendChild(right);
    b.addEventListener('click', function () { open(r); });
    li.appendChild(b);
    var chips = U.node('div', 'nu-chips');
    chips.appendChild(U.node('span', 'c-sub', NAME[r.site] || ''));
    if (r.phone) { var a = U.node('a', 'chip', 'Call'); a.href = 'tel:' + String(r.phone).replace(/[^\d+]/g, ''); chips.appendChild(a); }
    if (r.email) { var m = U.node('a', 'chip', 'Email'); m.href = 'mailto:' + r.email; chips.appendChild(m); }
    li.appendChild(chips);
    /* The brain read something in an email and asks before doing it. */
    if (r.ask) {
      var ask = U.node('div', 'nu-ask');
      var yes = U.node('button', 'c-ok', 'Yes, paid in full'); yes.type = 'button';
      var no = U.node('button', 'c-quiet', 'Not right'); no.type = 'button';
      var answer = async function (y) { yes.disabled = no.disabled = true; try { await U.send('/api/admin/todos', { op: 'ask', id: r.ask.id, yes: y }); } catch (e) { /* shown on reload */ } load(); };
      yes.addEventListener('click', function () { answer(true); }); no.addEventListener('click', function () { answer(false); });
      ask.appendChild(yes); ask.appendChild(no); li.appendChild(ask);
    }
    /* Their to-dos tick off and add right here, as on their card. */
    if (global.DSTODOS && !r.quoted && (r.jobId || r.leadId)) {
      var box = U.node('div', 'nu-todos');
      global.DSTODOS.render(box, r.jobId ? r.jobId : { leadId: r.leadId }, r.todos || [], load, { fold: true });
      li.appendChild(box);
    }
    return li;
  }

  function matches(r) {
    if (!state.q) return true;
    var hay = squash([r.name, r.postcode, r.phone, r.email, r.next].join(' '));
    return state.q.split(/\s+/).map(squash).filter(Boolean).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function draw() {
    var d = state.data; if (!d) return;
    var c = d.counts || {};
    el('nu-big').textContent = String(c.us || 0);
    el('nu-big-sub').textContent = c.now ? c.now + ' now' : '';
    el('nu-them').textContent = String(c.them || 0);
    el('nu-agent').textContent = String(c.agent || 0);
    el('nu-booked').textContent = String(c.booked || 0);
    document.querySelectorAll('#nu-lanes [data-lane]').forEach(function (x) {
      var k = x.getAttribute('data-lane'), n = k === 'us' ? c.us : c[k];
      x.setAttribute('aria-pressed', String(k === state.lane));
      x.querySelector('span').textContent = n ? ' ' + n : '';
    });
    var list = el('nu-list'); list.textContent = '';
    var rows = (d.rows || []).filter(matches);
    var mine = state.q ? rows : rows.filter(function (r) { return LANES[state.lane].indexOf(r.lane) !== -1; });
    var now = mine.filter(function (r) { return r.lane === 'now'; });
    if (now.length && !state.q) list.appendChild(U.node('li', 'c-label nu-head', 'Needs you now'));
    now.forEach(function (r) { list.appendChild(row(r)); });
    var rest = mine.filter(function (r) { return r.lane !== 'now'; });
    if (now.length && rest.length && !state.q) list.appendChild(U.node('li', 'c-label nu-head', 'Then'));
    rest.forEach(function (r) { list.appendChild(row(r)); });
    el('nu-empty').hidden = mine.length > 0;
    el('nu-empty').textContent = state.q ? 'Nobody matches.' : { us: 'Nothing waiting on you.', them: 'Nobody to wait on.', agent: 'No agents to wait on.', booked: 'Nothing booked ahead.' }[state.lane];
    /* Gone cold, folded at the end of Waiting on them: to try again later. */
    var cold = rows.filter(function (r) { return r.lane === 'cold'; });
    var cf = el('nu-cold'); cf.hidden = state.lane !== 'them' || !cold.length || Boolean(state.q);
    el('nu-cold-n').textContent = String(cold.length);
    var cl = el('nu-cold-list'); cl.textContent = '';
    cold.forEach(function (r) { cl.appendChild(row(r)); });
  }

  /* The last 24 hours and every check (lib/overnight.js): one folded line, amber if a check needs a look. */
  function drawDay(o) {
    var box = el('nu-day'); box.hidden = !o; if (!o) return;
    var top = o.lines.filter(function (l) { return l.n; }).slice(0, 3).map(function (l) { return l.said; });
    el('nu-day-sub').textContent = top.length ? top.join(' · ') : 'Quiet';
    var warn = o.checks.filter(function (c) { return c.state === 'warn'; }).length;
    var tag = el('nu-day-tag'); tag.textContent = warn ? warn + (warn === 1 ? ' check' : ' checks') + ' to look at' : 'All sweet';
    tag.className = 'c-tag ' + (warn ? 'is-warn' : 'is-good');
    box.classList.toggle('is-warn', warn > 0);
    var lines = el('nu-day-lines'); lines.textContent = '';
    o.lines.forEach(function (l) { lines.appendChild(U.node('li', l.n ? null : 'is-quiet', l.said)); });
    var checks = el('nu-day-checks'); checks.textContent = '';
    o.checks.forEach(function (c) {
      var li = U.node('li', 'is-' + c.state);
      li.appendChild(U.node('b', null, c.name)); li.appendChild(U.node('small', null, c.said));
      checks.appendChild(li);
    });
  }

  async function load() {
    try {
      state.data = await U.get('/api/admin/todos?view=next');
      el('nu-state').hidden = true;
      drawDay(state.data.last24);
      draw();
    } catch (e) {
      if (e.message === 'unauthorised') return;
      el('nu-state').hidden = false; el('nu-state').textContent = 'Could not load. Pull to refresh.';
    }
  }

  document.querySelectorAll('#nu-lanes [data-lane]').forEach(function (b) {
    b.addEventListener('click', function () { state.lane = b.getAttribute('data-lane'); try { sessionStorage.setItem('nu-lane', state.lane); } catch (e) { /* private mode */ } draw(); });
  });
  try { var keep = sessionStorage.getItem('nu-lane'); if (LANES[keep]) state.lane = keep; } catch (e) { /* private mode */ }
  el('nu-q').addEventListener('input', function () { state.q = el('nu-q').value.trim(); draw(); });
  global.DSNEXTUP = { load: load };
  load();
})(window);
