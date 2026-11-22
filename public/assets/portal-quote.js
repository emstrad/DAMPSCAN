/* "Got a quote for the work?" on the customer's page once their report is done
   (the owner, 22 Nov 2026): a contractor's quote, as a PDF or photos, sent to us
   to check against their report, free; we reply through Message us
   (lib/portal-quotes.js). Uses the page's own parts, naming neither brand. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, I = P.I;
  var MAX = 5, open = false;
  function fold(p, main, token, reload) {
    if (['ready', 'report'].indexOf(p.state) === -1) return;
    var sent = p.quotes || [];
    var show = open; open = false;
    P.fold(main, sent.length ? 'Your quote (' + sent.length + ')' : 'Got a quote for the work?', function (box) {
      if (sent.length) {
        sent.forEach(function (n) { var e = h('p', 'pt-sent', I.check); e.appendChild(document.createTextNode(n)); box.appendChild(e); });
        box.appendChild(t('p', 'pt-hint', 'We have it. We\'ll check it against your report and reply in Messages.'));
      } else box.appendChild(t('p', null, 'Send us any quote you receive for the work, as a PDF or photos. We\'ll check it against your report and tell you what it covers, what it misses and anything you don\'t need. Free.'));
      if (sent.length >= MAX) return;
      var lab = h('label', 'pt-btn ghost', '<span class="in">' + (sent.length ? 'Add another page' : 'Send a quote') + '</span>'), inp = t('input');
      inp.type = 'file'; inp.accept = 'application/pdf,image/*'; inp.multiple = true; inp.hidden = true; lab.appendChild(inp);
      var msg = t('p', 'pt-hint', ''); msg.hidden = true;
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || [], 0, MAX - sent.length);
        if (!files.length) return;
        lab.classList.add('busy'); msg.hidden = false; msg.textContent = 'Sending ' + files.length + '…';
        var paths = [];
        files.reduce(function (ch, f) { return ch.then(function () { return global.PTASK.upload(f).then(function (x) { paths.push(x); }, function () {}); }); }, Promise.resolve())
          .then(function () { return paths.length ? global.PTASK.ask(token, { op: 'quote', paths: paths }) : { ok: false }; })
          .then(function (r) {
            lab.classList.remove('busy'); inp.value = '';
            if (r.ok) { P.toast('Sent. We\'ll check it and reply in Messages.'); open = true; reload(); }
            else msg.textContent = r.error === 'too_many' ? 'That\'s as many as we can take here. Email or WhatsApp the rest.' : 'That didn\'t come through. Please try again.';
          });
      });
      box.appendChild(lab); box.appendChild(msg);
    }, show);
  }
  global.PTQUOTE = { fold: fold };
})(window);
