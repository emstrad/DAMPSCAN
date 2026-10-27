/* After a damp survey enquiry is sent: "Want to pick a time now?" The days
   with a free time come from the server (lib/web-booking.js); tapping a day
   shows every free hour that day, and a tap asks for that time. It is held
   for the team to confirm, so the words say "requested", never "booked".
   Nothing shows when the owners have not switched it on, or when there are
   no times. Loaded by book.js. */
(function () {
  'use strict';
  var nice = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var short = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var clock = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  async function post(body) {
    var r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var d = await r.json().catch(function () { return {}; });
    return { status: r.status, data: d };
  }

  async function offer(box, lead, note) {
    var r = await post({ op: 'times', leadId: lead.id, sessionId: lead.sessionId });
    box.textContent = '';
    if (r.data && r.data.askSurvey) { chooseSurvey(box, lead, r.data.slots); return; }
    if (!((r.data && r.data.days) || []).length) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h4', 'bt-title', 'Want to pick a survey time now?'));
    box.appendChild(el('p', 'note', note || 'Pick a day, then a time that suits you. We will confirm it with you shortly.'));
    /* First the days with a free time, then every free time on the day picked. */
    var days = (r.data && r.data.days) || [];
    var dayRow = el('div', 'bt-row bt-days'), timeBox = el('div', 'bt-times');
    days.forEach(function (d) {
      var b = el('button', 'bt-time bt-dayb', short(d.date)); b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        dayRow.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        showDay(d);
      });
      dayRow.appendChild(b);
    });
    box.appendChild(dayRow);
    box.appendChild(timeBox);
    function showDay(d) {
      timeBox.textContent = '';
      timeBox.appendChild(el('p', 'bt-day', nice(d.date) + ': pick a time'));
      var row = el('div', 'bt-row');
      d.times.forEach(function (t) {
        var b = el('button', 'bt-time', clock(t.time)); b.type = 'button';
        b.addEventListener('click', async function () {
          b.disabled = true;
          var p = await post({ op: 'pick', leadId: lead.id, sessionId: lead.sessionId, date: t.date, time: t.time, ticket: t.ticket });
          if (p.data && p.data.ok) {
            box.textContent = '';
            box.appendChild(el('h4', 'bt-title', 'Thanks, we have pencilled you in'));
            box.appendChild(el('p', 'note', nice(t.date) + ' at ' + clock(t.time) + ' is requested. We will be in touch shortly to confirm it.'));
          } else offer(box, lead, 'Sorry, that time has just gone. Here are the times still free.');
        });
        row.appendChild(b);
      });
      timeBox.appendChild(row);
    }
    var no = el('button', 'bt-skip', 'No thanks, call me to arrange a time'); no.type = 'button';
    no.addEventListener('click', function () { box.hidden = true; });
    box.appendChild(no);
  }

  /* Which survey, with prices (the price list in survey-quiz.js), any
     add-ons, or "not sure": the quiz's four questions, or the team helps
     them choose on the phone. Saved on the enquiry, then the times. */
  function quiz(cb) {
    if (window.SurveyQuiz) return cb();
    var s = document.createElement('script'); s.src = '/assets/survey-quiz.js?v=2'; s.onload = cb; document.head.appendChild(s);
  }
  function chooseSurvey(box, lead, slots) {
    quiz(function () {
      var P = window.SurveyQuiz.PRICE;
      box.textContent = ''; box.hidden = false;
      box.appendChild(el('h4', 'bt-title', 'Which survey would you like?'));
      var picked = null, adds = [];
      var kinds = [
        ['Localised damp survey', P.damp.localised, 'localised', false, 'One area, one or two rooms'],
        ['Full-house damp survey', P.damp.full, 'full', false, 'The whole home; best if you are buying'],
        ['Localised damp and timber survey', P.dampTimber.localised, 'localised', true, 'One area, with rot or woodworm checked'],
        ['Full-house damp and timber survey', P.dampTimber.full, 'full', true, 'The whole home, damp and timber']];
      var list = el('div', 'bt-surveys');
      kinds.forEach(function (k) {
        var b = el('button', 'bt-survey'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.appendChild(el('b', null, k[0] + ', £' + k[1])); b.appendChild(el('span', null, k[4]));
        b.addEventListener('click', function () {
          list.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          picked = { name: k[0], price: k[1], size: k[2], timber: k[3] }; go.disabled = false;
        });
        list.appendChild(b);
      });
      box.appendChild(list);
      box.appendChild(el('p', 'bt-day', 'Add on the same visit (optional)'));
      [['Underfloor camera check', P.addOn.camera[0]], ['Low-level cavity bridging check', P.addOn.cavity[0]]].forEach(function (a) {
        var l = el('label', 'bt-add'), c = document.createElement('input'); c.type = 'checkbox';
        c.addEventListener('change', function () { adds = adds.filter(function (x) { return x.name !== a[0]; }); if (c.checked) adds.push({ name: a[0], price: a[1] }); });
        l.appendChild(c); l.appendChild(document.createTextNode(' ' + a[0] + ', from £' + a[1])); box.appendChild(l);
      });
      var go = el('button', 'bt-time bt-go', 'Continue'); go.type = 'button'; go.disabled = true;
      go.addEventListener('click', function () { save(Object.assign({}, picked, { addOns: adds })); });
      box.appendChild(go);
      var help = el('button', 'bt-skip', 'Not sure? Answer four quick questions'); help.type = 'button';
      help.addEventListener('click', function () {
        box.textContent = '';
        var q = el('div', 'quiz'); box.appendChild(q);
        window.SurveyQuiz.mount(q, { onChoose: function (r) { save({ name: r.survey.name, price: r.survey.price, size: r.size, timber: r.timber, addOns: r.addOns }); } });
      });
      box.appendChild(help);
      var unsure = el('button', 'bt-skip', 'Not sure, help me choose when you call'); unsure.type = 'button';
      unsure.addEventListener('click', function () { save({ unsure: true }); });
      box.appendChild(unsure);
    });
    async function save(choice) {
      await post({ op: 'survey', leadId: lead.id, sessionId: lead.sessionId, choice: choice });
      if (slots) return offer(box, lead);
      box.textContent = '';
      box.appendChild(el('h4', 'bt-title', 'Thanks, noted'));
      box.appendChild(el('p', 'note', 'We will be in touch shortly to arrange a time.'));
    }
  }

  window.addEventListener('lead:sent', function (e) {
    var success = document.querySelector('.book-success');
    if (!success || !e.detail || !e.detail.id) return;
    var box = el('div', 'bt'); box.hidden = true;
    success.appendChild(box);
    offer(box, e.detail);
  });
})();
