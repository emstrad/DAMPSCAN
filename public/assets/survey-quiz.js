/* "Which survey do I need?": four taps, then the survey and any add-ons that
   fit, with prices from the one price list (13 Sept 2026). Plain
   script so it can sit on the public sites once it leaves the staff Lab.
   window.SurveyQuiz.mount(element, { onChoose(result) }) */
(function (global) {
  'use strict';
  var PRICE = {
    damp: { localised: 215, full: 295 },
    dampTimber: { localised: 310, full: 445 },
    addOn: { camera: [85, 145], cavity: [95, 160], invasive: [85, 145] }
  };
  var STEPS = [
    { key: 'why', q: 'Why do you need a survey?', one: true, options: [['buying', 'I am buying the property'], ['own', 'It is my home or a home I let'], ['selling', 'I am selling']] },
    { key: 'see', q: 'What can you see or smell? Pick all that apply.', options: [['patch', 'Damp patches or tide marks'], ['mould', 'Mould or condensation'], ['timber', 'Rotten or soft wood, or woodworm holes'], ['smell', 'A musty smell'], ['unsure', 'Not sure']] },
    { key: 'where', q: 'How much of the home is affected?', one: true, options: [['some', 'One area, one or two rooms'], ['lots', 'Several rooms, or I want the whole house checked']] },
    { key: 'extra', q: 'Do any of these apply? Pick all that apply.', options: [['floor', 'Wooden floors downstairs with a smell or soft spots'], ['low', 'Damp low down on a ground floor wall'], ['none', 'None of these']] }
  ];

  function recommend(a) {
    var whole = a.where === 'lots' || a.why === 'buying';
    var size = whole ? 'full' : 'localised';
    var timber = (a.see || []).indexOf('timber') !== -1;
    var base = timber
      ? { name: (whole ? 'Full-house' : 'Localised') + ' damp and timber survey', price: PRICE.dampTimber[size] }
      : { name: (whole ? 'Full-house' : 'Localised') + ' damp survey', price: PRICE.damp[size] };
    var add = [];
    if ((a.extra || []).indexOf('floor') !== -1) add.push({ name: 'Underfloor camera check', price: PRICE.addOn.camera[0] });
    if ((a.extra || []).indexOf('low') !== -1) add.push({ name: 'Low-level cavity bridging check', price: PRICE.addOn.cavity[0] });
    var why = a.why === 'buying' ? 'Buying, so we check the whole house before you commit.'
      : whole ? 'More than one area, so the whole house is checked in one visit.'
      : 'One area, so a focused survey answers it for the smallest fee.';
    return { survey: base, addOns: add, total: base.price + add.reduce(function (t, x) { return t + x.price; }, 0), why: why, size: size, timber: timber };
  }

  function mount(root, opts) {
    opts = opts || {};
    var answers = {}, i = 0;
    function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function draw() {
      root.textContent = '';
      if (i >= STEPS.length) return result();
      var s = STEPS[i];
      root.appendChild(node('p', 'quiz-step', 'Question ' + (i + 1) + ' of ' + STEPS.length));
      root.appendChild(node('h3', 'quiz-q', s.q));
      var picked = [];
      var list = node('div', 'quiz-options');
      s.options.forEach(function (o) {
        var b = node('button', 'quiz-opt', o[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          if (s.one) { answers[s.key] = o[0]; i += 1; draw(); return; }
          var at = picked.indexOf(o[0]);
          if (at === -1) picked.push(o[0]); else picked.splice(at, 1);
          b.setAttribute('aria-pressed', String(at === -1));
        });
        list.appendChild(b);
      });
      root.appendChild(list);
      if (!s.one) {
        var next = node('button', 'btn btn--primary', 'Next');
        next.type = 'button';
        next.addEventListener('click', function () { answers[s.key] = picked; i += 1; draw(); });
        root.appendChild(next);
      }
      if (i > 0) { var back = node('button', 'link-btn', 'Back'); back.type = 'button'; back.addEventListener('click', function () { i -= 1; draw(); }); root.appendChild(back); }
    }
    function result() {
      var r = recommend(answers);
      root.appendChild(node('p', 'quiz-step', 'Our recommendation'));
      root.appendChild(node('h3', 'quiz-q', r.survey.name + ', £' + r.survey.price));
      root.appendChild(node('p', 'quiz-why', r.why));
      if (r.addOns.length) {
        var ul = node('ul', 'quiz-adds');
        r.addOns.forEach(function (x) { ul.appendChild(node('li', null, 'Add ' + x.name.toLowerCase() + ' on the same visit, £' + x.price)); });
        root.appendChild(ul);
        root.appendChild(node('p', 'quiz-total', 'Together £' + r.total + '. Add-ons are only done if the surveyor agrees they are needed.'));
      }
      var go = node('button', 'btn btn--primary', 'Book this survey');
      go.type = 'button';
      go.addEventListener('click', function () { if (opts.onChoose) opts.onChoose(r, answers); });
      root.appendChild(go);
      var again = node('button', 'link-btn', 'Start again');
      again.type = 'button';
      again.addEventListener('click', function () { answers = {}; i = 0; draw(); });
      root.appendChild(again);
    }
    draw();
  }

  global.SurveyQuiz = { mount: mount, recommend: recommend, PRICE: PRICE };
})(window);
