/* The ATi and DampScan customer card in journey order (the owner's calmer
   screens, 16 Nov 2026): one row of Call, Text, Directions and Email, the one
   next step, anything they asked or that is due, then the job as it happens,
   each part one line to open with what it holds said beneath: Visit, Money,
   Report, Messages and history, Details; Not going ahead at the very bottom.
   Every part is the same one the card had before (calendar-pop.js and its
   pop-*.js files), only placed and summed up. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var DAY = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var manages = function (j) { var R = global.DSAREA.rights; return !R || !R.known || R.manages[j.site]; };

  /* One line to open: the name, what it holds beneath, a tag at the right when it needs you. */
  function group(k, title, sub, tag, tagCls, open) {
    var d = U.node('details', 'sheet-sec sheet-fold j-group'); d.open = Boolean(open);
    var s = U.node('summary'), l = U.node('span', 'c-l');
    l.appendChild(U.node('b', null, title)); if (sub) l.appendChild(U.node('small', null, sub));
    s.appendChild(l); if (tag) s.appendChild(U.node('span', 'c-tag ' + (tagCls || ''), tag));
    d.appendChild(s); k.body.appendChild(d);
    return d;
  }

  /* Call, Text, Directions and Email as four equal tiles; only those we have. */
  function quick(j, k) {
    var tel = j.phone ? String(j.phone).replace(/[^\d+]/g, '') : '';
    var addr = (j.address || []).join(', ') || j.postcode || '';
    var all = [tel && ['Call', 'tel:' + tel], tel && ['Text', 'sms:' + tel], addr && ['Directions', 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr)], j.email && ['Email', 'mailto:' + j.email]].filter(Boolean);
    if (!all.length) return;
    var row = U.node('div', 'j-quick');
    all.forEach(function (a) { var x = U.node('a', 'j-quick-b', a[0]); x.href = a[1]; if (/^https:/.test(a[1])) { x.target = '_blank'; x.rel = 'noopener'; } row.appendChild(x); });
    k.body.appendChild(row);
    if (tel || j.email) k.body.appendChild(U.node('p', 'meta j-contact', [j.phone, j.email].filter(Boolean).join(' · ')));
    /* The estate agent sits with the customer's own contacts, the first people you ring (the owner, 18 Nov 2026). */
    var a = j.agent;
    if (a) {
      var ag = U.node('div', 'j-agent'), who = U.node('span', 'c-l');
      who.appendChild(U.node('small', 'c-label', 'Estate agent')); who.appendChild(U.node('b', null, a.name + (a.branch ? ', ' + a.branch : '')));
      ag.appendChild(who);
      [a.phone && ['Call', 'tel:' + String(a.phone).replace(/[^\d+]/g, '')], a.email && ['Email', 'mailto:' + a.email]].filter(Boolean).forEach(function (c) { var x = U.node('a', 'j-quick-b j-agent-b', c[0]); x.href = c[1]; ag.appendChild(x); });
      k.body.appendChild(ag);
    }
  }

  function draw(j, k) {
    var X = global.DSPOPX, boss = manages(j), m = j.money;
    /* Every part below is its own card, so what a fold holds sits inside it (the owner, 18 Nov 2026). */
    k.body.classList.add('j-cards');
    quick(j, k);
    if (X.next) X.next(j, k.body);
    /* The next step's own tick sits in its box (managers): Deposit paid, or Paid in full once surveyed. */
    var nx = k.body.querySelector('.sheet-next');
    if (nx && j.money && /^Deposit/.test(nx.textContent)) nx.appendChild(k.tick(j, 'depositPaid', 'Deposit paid', j.depositPaid, 'Deposit marked paid.'));
    else if (nx && j.money && /^Balance/.test(nx.textContent)) nx.appendChild(k.tick(j, 'paid', 'Paid in full', j.paid, 'Marked paid in full.'));
    if (j.moveAsked) k.moveAsked(j);
    var reply = function () { k.part('DSPOPREPLY', '/staff/pop-reply.js', function (sec) { global.DSPOPREPLY.render(j, sec, k.changed); }); };
    /* A page message waiting for us comes straight after the next step. */
    if (j.phone && boss && j.pageMessage) reply();
    k.outstanding(j);
    k.todos(j);

    /* Visit: when, where, who, On my way and the date. */
    var when = !j.dateSet ? 'Not booked in yet' : DAY(j.date) + (j.time ? ' ' + j.time : ', time to confirm');
    var v = group(k, 'Visit', [when, j.surveyType, k.cap(j.surveyor)].filter(Boolean).join(' · '), j.awaitingAgent ? 'Agent to confirm' : null, 'is-info', !j.dateSet || j.status === 'cancelled');
    X.where(j, v, true);
    if (j.status !== 'paid') X.dateForm(j, function (t, f) { return k.section(t, f, v); }, k.changed);
    if (boss) v.appendChild(k.tick(j, 'awaitingAgent', 'Awaiting estate agent', j.awaitingAgent, 'Marked awaiting the agent.'));

    /* Money (the managers'): price, what is paid, what is due, the ticks, their page. */
    if (m) {
      /* Money actually in (card, transfer or a tick), as their page counts it, so a part payment shows. */
      var got = Math.max(m.paidPence || 0, j.paid ? m.pricePence : j.depositPaid ? m.depositPence : 0);
      var due = j.paid ? null : Math.max(0, (got >= m.depositPence ? m.pricePence : m.depositPence) - got);
      var paidSay = j.paid ? 'paid in full' : got >= m.depositPence ? (got > m.depositPence ? U.money(got) + ' paid' : 'deposit paid') : got ? U.money(got) + ' paid' : 'nothing paid yet';
      var mg = group(k, 'Money', U.money(m.pricePence) + ' · ' + paidSay, j.paid ? 'Paid' : U.money(due) + ' due', j.paid ? 'is-good' : 'is-warn', false);
      X.facts(mg, [['Survey', j.surveyType], ['Price', U.money(m.pricePence)]]);
      X.surveyEdit(mg, j, k.changed);
      if (global.DSPOPMONEY) global.DSPOPMONEY.render(mg, j, k.changed);
      mg.appendChild(k.tick(j, 'depositPaid', 'Deposit paid, ' + U.money(m.depositPence), j.depositPaid, 'Deposit marked paid.'));
      mg.appendChild(k.tick(j, 'paid', 'Paid in full', j.paid, 'Marked paid in full.'));
      /* Who gets what: each person's share, and money moved between people on this survey (owners). */
      var sg = group(k, 'Who gets what', 'Loading', null, null, false);
      var split = function () { global.DSPOPSPLIT.render(sg, j); };
      if (global.DSPOPSPLIT) split(); else { var sc = document.createElement('script'); sc.src = '/staff/pop-split.js'; sc.onload = split; document.head.appendChild(sc); }
    } else {
      var sv = group(k, 'The survey', j.surveyType, null, null, false);
      X.facts(sv, [['Survey', j.surveyType], ['Surveyor', k.cap(j.surveyor)]]);
      if (!j.report) sv.appendChild(k.tick(j, 'surveySent', 'Report sent', j.reportSent, 'Report marked sent.'));
    }

    /* Report: upload, Ready, Hold and Report sent, as before. */
    if (j.report) k.part('DSPOPREPORT', '/staff/pop-report.js', function (sec) { global.DSPOPREPORT.render(j, sec, k.tick, k.changed); });

    /* Messages and history: a reply by text, words to send by hand, then everything so far with the notes pinned. */
    if (j.phone && boss && !j.pageMessage) reply();
    k.dampMessages(j, k.section(j.textsOn ? 'Message by hand' : 'Messages to send', 'closed'));
    var noteSec = k.notes(j);
    if (global.DSPOPHIST) global.DSPOPHIST.render(j, k.section, noteSec);

    /* Details: what they wrote and their photos. */
    var pics = (j.files || []).length + (j.photos || []).length;
    var lead = j.lead && (j.lead.notes || j.lead.issues.length) ? j.lead : null;
    if (lead || pics) {
      var dg = group(k, 'Details', [lead && 'Their enquiry', pics && pics + ' photo' + (pics === 1 ? '' : 's')].filter(Boolean).join(' · '), null, null, false);
      if (lead && lead.issues.length) dg.appendChild(U.node('p', 'sheet-note', lead.issues.join(', ')));
      if (lead && lead.notes) dg.appendChild(U.node('p', 'sheet-note', lead.notes));
      X.pictures(j, dg, k.changed);
    }

    if (j.status === 'booked' && boss) k.part('DSPOPCLOSE', '/staff/pop-close.js', function (sec) { global.DSPOPCLOSE.render(j, sec, k.changed); });
  }

  global.DSPOPJ = { draw: draw };
})(window);
