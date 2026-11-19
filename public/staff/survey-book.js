/* Booking a survey on one screen, from an enquiry card or "+ New survey":
   brand, customer, survey type (the rate card price appears at once and can
   be changed), surveyor, date and time, deposit, note, and, folded away
   because most surveys are booked with the customer, the estate agent. It
   saves through the Jobs route like every other damp job, then shows the
   confirmation and deposit messages ready to send. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var S = global.DSSV;
  var rates = null;
  var dlg = document.getElementById('book-dialog');

  function row(label, control, id, hint) {
    var r = U.node('div', 'form-row');
    var l = U.node('label', null, label);
    l.htmlFor = id;
    if (hint) l.appendChild(U.node('small', null, ' ' + hint));
    control.id = id;
    r.appendChild(l);
    r.appendChild(control);
    return r;
  }
  function input(type, value) { var i = document.createElement('input'); i.type = type; if (value) i.value = value; return i; }
  function select(options, value) {
    var s = document.createElement('select');
    options.forEach(function (o) { var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; s.appendChild(opt); });
    if (value) s.value = value;
    return s;
  }
  function check(label, id) {
    var l = U.node('label', 'sv-check');
    var c = input('checkbox');
    c.id = id;
    l.appendChild(c);
    l.appendChild(document.createTextNode(' ' + label));
    return { label: l, box: c };
  }

  async function open(lead, done) {
    if (!rates) rates = (await U.get('/api/admin/rates')).rates.filter(function (r) { return r.active !== false; });
    dlg.textContent = '';
    var form = U.node('form', 'sv-form');
    form.method = 'dialog';
    var h = U.node('h2', null, lead ? 'Book ' + (lead.firstName || 'this enquiry') : 'New survey');
    h.id = 'book-title';
    form.appendChild(h);
    var sites = (global.DSAREA && global.DSAREA.me ? global.DSAREA.me.businesses.map(function (b) { return b.slug; }) : ['dampscan', 'ati-london'])
      .filter(function (s) { return S.BRAND[s]; });
    var f = {
      site: select(sites.map(function (s) { return [s, S.BRAND[s]]; }), lead && lead.site),
      name: input('text', lead && lead.name), phone: input('tel', lead && lead.phone), email: input('email', lead && lead.email),
      address: input('text', lead && lead.street), postcode: input('text', lead && lead.postcode),
      type: select(rates.map(function (r) { return [r.key, r.label]; })), price: input('number'),
      surveyor: select([['tom', 'Tom'], ['ben', 'Ben'], ['scott', 'Scott'], ['ronnie', 'Ronnie']]),
      date: input('date', S.addDays(S.londonToday(), 1)), time: input('time'), note: document.createElement('textarea')
    };
    f.name.required = true;
    f.price.min = '0'; f.price.step = '0.01'; f.price.inputMode = 'decimal';
    f.time.step = '300';
    f.note.rows = 2;
    function priceFromCard() { var r = rates.find(function (x) { return x.key === f.type.value; }); if (r) f.price.value = (r.pricePence / 100).toFixed(2); }
    f.type.addEventListener('change', priceFromCard);
    priceFromCard();
    if (sites.length > 1) form.appendChild(row('Brand', f.site, 'bk-site'));
    form.appendChild(row('Customer name', f.name, 'bk-name'));
    var two = U.node('div', 'sv-two');
    two.appendChild(row('Phone', f.phone, 'bk-phone'));
    two.appendChild(row('Email', f.email, 'bk-email'));
    form.appendChild(two);
    form.appendChild(row('Address', f.address, 'bk-address', lead && lead.street ? '(from the enquiry)' : ''));
    form.appendChild(row('Postcode', f.postcode, 'bk-postcode'));
    var three = U.node('div', 'sv-two');
    three.appendChild(row('Survey type', f.type, 'bk-type'));
    three.appendChild(row('Price £', f.price, 'bk-price', '(rate card, editable)'));
    form.appendChild(three);
    form.appendChild(row('Surveyor', f.surveyor, 'bk-surveyor'));
    var when = U.node('div', 'sv-two');
    when.appendChild(row('Date', f.date, 'bk-date'));
    when.appendChild(row('Time', f.time, 'bk-time', '(optional)'));
    form.appendChild(when);
    var dep = check('Deposit taken', 'bk-deposit');
    form.appendChild(dep.label);

    var ag = document.createElement('details');
    ag.className = 'sv-agent-box';
    ag.appendChild(U.node('summary', null, 'Booked through an estate agent?'));
    var a = { name: input('text'), branch: input('text'), phone: input('tel'), email: input('email') };
    ag.appendChild(row('Agent name', a.name, 'bk-ag-name'));
    ag.appendChild(row('Branch', a.branch, 'bk-ag-branch'));
    var ac = U.node('div', 'sv-two');
    ac.appendChild(row('Agent phone', a.phone, 'bk-ag-phone'));
    ac.appendChild(row('Agent email', a.email, 'bk-ag-email'));
    ag.appendChild(ac);
    var wait = check('Waiting on the agent to confirm the time', 'bk-wait');
    ag.appendChild(wait.label);
    form.appendChild(ag);
    form.appendChild(row('Note', f.note, 'bk-note', '(access, keys, parking)'));
    var err = U.node('p', 'err');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    var bar = U.node('div', 'top-end sv-actions');
    var save = U.node('button', 'btn btn--primary btn--sm', 'Book it');
    save.type = 'submit';
    var cancel = U.node('button', 'btn btn--ghost btn--sm', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { dlg.close(); });
    bar.appendChild(save);
    bar.appendChild(cancel);
    form.appendChild(bar);

    /* The phone's own checks stop a form without a word on an iPhone (19 Nov 2026:
       Book it "does nothing"), so every reason is said here, beside the button. */
    form.noValidate = true;
    function say(text, field) {
      err.textContent = text;
      err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (field) field.focus({ preventScroll: true });
    }
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      err.textContent = '';
      if (!f.name.value.trim()) return say('Give the customer\'s name.', f.name);
      if (f.email.value.trim() && !EMAIL.test(f.email.value.trim())) return say('That email address is not right.', f.email);
      if (!(Number(f.price.value) > 0)) return say('Give the price.', f.price);
      if (!f.date.value) return say('Pick the day.', f.date);
      /* Booking an enquiry under someone else's name joins two customers into one card. */
      var was = lead && String(lead.name || '').trim().split(/\s+/)[0].toLowerCase();
      var now = f.name.value.trim().split(/\s+/)[0].toLowerCase();
      if (was && now !== was && !global.confirm('This is ' + lead.name + '\'s enquiry. Book it as ' + f.name.value.trim() + '? If it is a different customer, Cancel and use New customer instead.')) return;
      var body = { site: f.site.value, leadId: lead ? lead.leadId : undefined, customerName: f.name.value.trim(), customerPhone: f.phone.value.trim(),
        customerEmail: f.email.value.trim(), customerAddress: f.address.value.trim(), customerPostcode: f.postcode.value.trim(),
        surveyType: f.type.value, surveyPricePence: Math.round(Number(f.price.value) * 100), surveyor: f.surveyor.value,
        jobDate: f.date.value, jobTime: f.time.value, note: f.note.value.trim(), depositPaid: dep.box.checked, status: 'booked' };
      if (a.name.value.trim()) body.estateAgent = { name: a.name.value.trim(), branch: a.branch.value.trim(), phone: a.phone.value.trim(), email: a.email.value.trim() };
      body.awaitingAgent = Boolean(body.estateAgent) && wait.box.checked;
      save.disabled = true;
      try {
        var r = await U.send('/api/admin/jobs', body);
        /* Too tight a drive from the surveyor's other survey: say why, and book anyway only when told to. */
        if (!r.ok && r.data && r.data.clash && global.confirm(r.data.clash.replace(' Send force to book it anyway.', '') + ' Book it anyway?')) r = await U.send('/api/admin/jobs', Object.assign(body, { force: true }));
        if (!r.ok) throw new Error(r.data && r.data.errors ? Object.keys(r.data.errors).map(function (k) { return r.data.errors[k]; }).join(' ') : (r.data && r.data.clash) ? 'Not booked: ' + r.data.clash.replace(' Send force to book it anyway.', '') : (r.data && r.data.error) || 'Not saved');
        if (done) done();
        drawMessages(dlg, await U.get('/api/admin/surveys?view=messages&id=' + r.data.job.id), true);
      } catch (e) { say(e.message); save.disabled = false; }
    });
    dlg.appendChild(form);
    if (!dlg.open) dlg.showModal();
    f.name.focus();
  }

  /* The messages for one survey: confirmation and deposit to the customer,
     the chase to the agent while they owe a time, remedial after the report. */
  function drawMessages(box, data, justBooked) {
    var s = data.survey;
    var m = data.messages;
    box.textContent = '';
    var h = U.node('h2', null, justBooked ? 'Booked. Send the confirmation' : 'Messages for ' + (s.firstName || 'this survey'));
    h.id = box.id === 'msg-dialog' ? 'msg-title' : 'book-title';
    box.appendChild(h);
    box.appendChild(U.node('p', 'card-meta', [s.surveyLabel, S.cap(s.surveyor), s.date ? S.shortDate(s.date) + (s.time ? ' ' + s.time : '') : '', s.postcode].filter(Boolean).join(' · ')));
    if (m.confirm) box.appendChild(S.message(m.confirm, 'Booking confirmation'));
    if (m.deposit && !s.deposit) box.appendChild(S.message(m.deposit, 'Deposit request, ' + U.money(s.depositPence)));
    if (m.chase && s.awaitingAgent) box.appendChild(S.message(m.chase, 'Ask ' + s.agent.name + ' for a time'));
    if (m.remedial && s.reportSent) box.appendChild(S.message(m.remedial, 'Offer to quote the remedial work'));
    var close = U.node('button', 'btn btn--ghost btn--sm', 'Done');
    close.type = 'button';
    close.addEventListener('click', function () { box.close(); });
    var bar = U.node('div', 'top-end sv-actions');
    bar.appendChild(close);
    box.appendChild(bar);
    if (!box.open) box.showModal();
  }

  global.DSBOOK = { open: open, drawMessages: drawMessages };
})(window);
