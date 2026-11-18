/* Growth, Estate agents (the owner, 16 Nov 2026): one brand at a time, since
   the damp sites never name each other. Each agent opens to their own booking
   link (Copy) and a month's statement of their buyers (first name and
   district) to email or copy: words for a person to check and send, never
   sent by itself. Add an agent before they have sent anyone, to hand them a
   link. Figures from lib/agent-referrals.js. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var BRAND = { 'ati-london': 'ATi Damp Survey', dampscan: 'DampScan' };
  var money = function (p) { return '£' + Math.round((Number(p) || 0) / 100).toLocaleString('en-GB'); };
  var nice = function (d, o) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }, o || {})); };
  var ymOf = function (back) { var d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
  var monthName = function (ym) { return new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var todayIso = function () { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); };

  function copy(text, btn) {
    var was = btn.textContent;
    var done = function (ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = was; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); else done(false);
  }

  /* The statement's words: that month's visits and enquiries, then what is booked ahead. */
  function statement(a, site, ym) {
    var line = function (w) {
      var who = w.first + ', ' + w.district + ': ';
      if (w.stage === 'reported') return who + 'surveyed ' + nice(w.day) + ', report sent';
      if (w.stage === 'surveyed') return who + 'surveyed ' + nice(w.day) + ', report on its way';
      if (w.stage === 'booked') return who + 'booked for ' + nice(w.day);
      if (w.stage === 'arranging') return who + 'arranging a time';
      return who + 'enquired ' + nice(w.day);
    };
    var inMonth = a.work.filter(function (w) { return w.day.slice(0, 7) === ym && w.stage !== 'booked'; });
    var ahead = a.work.filter(function (w) { return w.stage === 'booked' && w.day >= todayIso(); });
    var out = ['Hello ' + a.name + ',', ''];
    if (inMonth.length) { out.push('The surveys we did for your buyers in ' + monthName(ym) + ':'); inMonth.forEach(function (w) { out.push('- ' + line(w)); }); }
    else out.push('No surveys for your buyers in ' + monthName(ym) + '.');
    if (ahead.length) { out.push('', 'Coming up:'); ahead.forEach(function (w) { out.push('- ' + line(w)); }); }
    if (a.link) out.push('', 'Your own booking link for buyers: ' + a.link);
    out.push('', 'Thank you for sending them our way.', '', BRAND[site]);
    return out.join('\n');
  }

  function agentRow(a, site) {
    var d = document.createElement('details'); d.className = 'pay-surveys ag-agent';
    var s = document.createElement('summary'); s.className = 'c-row';
    var l = node('span', 'c-l'); l.appendChild(node('b', null, a.name + (a.branch ? ', ' + a.branch : '')));
    l.appendChild(node('small', null, a.year.surveys + ' survey' + (a.year.surveys === 1 ? '' : 's') + ' this year' + (a.year.sent ? ', ' + a.year.sent + ' through their link' : '')));
    var r = node('span', 'c-r'); if (a.year.paid) r.appendChild(node('span', 'c-amt', money(a.year.paid))); r.appendChild(node('span', 'c-chev', '›'));
    s.appendChild(l); s.appendChild(r); d.appendChild(s);

    var body = node('div', 'ag-body');
    if (a.link) {
      body.appendChild(node('span', 'c-label', 'Their booking link'));
      body.appendChild(node('small', 'ag-link', a.link));
      var cl = node('button', 'btn', 'Copy link'); cl.type = 'button'; cl.addEventListener('click', function () { copy(a.link, cl); });
      body.appendChild(cl);
    }
    /* Their own page (lib/agent-portal.js): every property, Quick book and access to confirm. */
    if (a.page) {
      body.appendChild(node('span', 'c-label', 'Their agent page'));
      body.appendChild(node('small', 'ag-link', a.page));
      var cp = node('button', 'btn', 'Copy page link'); cp.type = 'button'; cp.addEventListener('click', function () { copy(a.page, cp); });
      body.appendChild(cp);
      if (a.email) { var em = node('a', 'btn', 'Email it'); em.href = 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent('Your page for damp surveys') + '&body=' + encodeURIComponent('Your own page for booking damp surveys and seeing where each one stands: ' + a.page + '\n\nSave it to your phone\'s home screen. Anyone with the link can see your properties, so keep it in the office.'); body.appendChild(em); }
    }
    body.appendChild(node('span', 'c-label', 'Statement'));
    var seg = node('div', 'c-seg'), text = node('pre', 'ag-text'), acts = node('div', 'ag-acts');
    var mail = node('a', 'btn btn--primary', 'Email statement');
    var cs = node('button', 'btn', 'Copy statement'); cs.type = 'button';
    var pick = function (ym) {
      seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ym === ym)); });
      text.textContent = statement(a, site, ym);
      if (a.email) mail.href = 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent('Your buyers\' surveys, ' + monthName(ym)) + '&body=' + encodeURIComponent(text.textContent);
    };
    [[ymOf(0), 'This month'], [ymOf(1), 'Last month']].forEach(function (m) { var b = node('button', null, m[1]); b.type = 'button'; b.dataset.ym = m[0]; b.addEventListener('click', function () { pick(m[0]); }); seg.appendChild(b); });
    cs.addEventListener('click', function () { copy(text.textContent, cs); });
    body.appendChild(seg); body.appendChild(text);
    if (a.email) acts.appendChild(mail); acts.appendChild(cs);
    body.appendChild(acts);
    if (!a.email) body.appendChild(node('small', 'c-sub', 'No email on file: copy it into an email.'));
    pick(ymOf(1));
    d.appendChild(body);
    return d;
  }

  function addForm(site, done) {
    var d = document.createElement('details'); d.className = 'pay-surveys';
    var s = document.createElement('summary'); s.className = 'c-row';
    s.innerHTML = '<span class="c-l"><b>Add an agent</b></span><span class="c-r"><span class="c-chev">›</span></span>';
    d.appendChild(s);
    var f = node('form', 'pay-form');
    var field = function (label, type) { var i = document.createElement('input'); i.type = type; i.placeholder = label; i.setAttribute('aria-label', label); f.appendChild(i); return i; };
    var name = field('Agency name', 'text'), branch = field('Branch (optional)', 'text'), email = field('Email (optional)', 'email'), phone = field('Phone (optional)', 'tel');
    var go = node('button', 'btn btn--primary', 'Add'); go.type = 'submit'; f.appendChild(go);
    var msg = node('p', 'panel-note'); f.appendChild(msg);
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      go.disabled = true; msg.textContent = '';
      var x = await U.send('/api/admin/pay', { op: 'agent', site: site, name: name.value, branch: branch.value, email: email.value, phone: phone.value });
      go.disabled = false;
      if (!x.ok) { msg.textContent = (x.data && x.data.error) || 'Not saved.'; return; }
      done();
    });
    d.appendChild(f);
    return d;
  }

  function mount(box) {
    var sec = node('section', 'mn-sec'); sec.appendChild(node('h2', null, 'Estate agents'));
    var seg = node('div', 'c-seg ag-brands'), list = node('div');
    sec.appendChild(seg); sec.appendChild(list); box.appendChild(sec);
    var show = async function (site) {
      seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.site === site)); });
      list.textContent = '';
      var d; try { d = await U.get('/api/admin/pay?view=agents&site=' + site); } catch (e) { list.appendChild(node('p', 'mn-say', 'Could not load the agents.')); return; }
      var rows = node('div', 'c-rows');
      (d.agents || []).forEach(function (a) { rows.appendChild(agentRow(a, site)); });
      if (!(d.agents || []).length) list.appendChild(node('p', 'mn-say', 'No agents yet.'));
      else list.appendChild(rows);
      list.appendChild(addForm(site, function () { show(site); }));
    };
    [['ati-london', 'ATi'], ['dampscan', 'DampScan']].forEach(function (b) { var x = node('button', null, b[1]); x.type = 'button'; x.dataset.site = b[0]; x.addEventListener('click', function () { show(b[0]); }); seg.appendChild(x); });
    show('ati-london');
  }

  global.DSAGENTS = { mount: mount, statement: statement };
})(window);
