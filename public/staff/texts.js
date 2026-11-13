/* The Texts page (lib/routes/admin/texts.js), one company at a time (the
   owner's ask, 13 Nov 2026): what is waiting to go (change the words, send
   now or stop it), what went and whether it arrived, and the wording of each
   text in the order a customer gets them. Tapping a text shows it as it lands
   on a phone, filled in with an example, with its words to change beneath. */
(function () {
  'use strict';
  var U = window.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var KEY = 'ds-texts-brand';
  var tab = 'waiting', data = null, site = null;
  var FILL = { first: 'First name', date: 'Date', window: 'Arrival time', surveyor: 'Surveyor', deposit: 'Deposit', balance: 'Balance',
    amount: 'Paid so far', total: 'Price', link: 'Their page', phone: 'Our number', brand: 'Company' };
  var when = function (iso) { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  function btn(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function count(s) {
    var plain = /^[\x20-\x7E\n£€]*$/.test(s), one = plain ? 160 : 70, many = plain ? 153 : 67;
    return s.length <= one ? 1 : Math.ceil(s.length / many);
  }
  function cost(s) { var n = count(s); return n + ' text' + (n === 1 ? '' : 's') + ' · ' + s.length + ' characters'; }
  function fill(words, vars) { return String(words || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); }).replace(/\s{2,}/g, ' ').trim(); }
  function remember(s) { try { localStorage.setItem(KEY, s); } catch (e) {} }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  async function act(body, said) {
    var r = await U.send('/api/admin/texts', body);
    if (r && r.ok === false) { if (U.toast) U.toast('That did not save.'); return false; }
    if (said && U.toast) U.toast(said);
    await load();
    return true;
  }

  /* ---------- the phone ---------- */
  /* Links and our number show as a phone shows them: blue and underlined. */
  function bubbleText(box, text) {
    box.textContent = '';
    String(text).split(/(https?:\/\/\S+|0\d{2,4} ?\d{3,4} ?\d{3,4})/).forEach(function (part, i) {
      if (!part) return;
      box.appendChild(i % 2 ? U.node('span', 'tx-link', part) : document.createTextNode(part));
    });
  }
  function phone(from, text) {
    var ph = U.node('div', 'tx-phone');
    var head = U.node('div', 'tx-phone-head');
    head.appendChild(U.node('span', 'tx-avatar', ''));
    head.appendChild(U.node('b', 'tx-from', from));
    head.appendChild(U.node('span', 'tx-sms', 'Text Message · SMS'));
    head.appendChild(U.node('span', 'tx-sms', 'Today 09:00'));
    ph.appendChild(head);
    var bub = U.node('p', 'tx-bubble');
    bubbleText(bub, text);
    ph.appendChild(bub);
    ph.appendChild(U.node('p', 'tx-noreply', 'Customers can\'t reply to this sender.'));
    return { node: ph, set: function (t) { bubbleText(bub, t); } };
  }

  function openSheet(build) {
    var dlg = el('phone');
    dlg.textContent = '';
    var bar = U.node('div', 'tx-dlg-bar');
    var title = U.node('h2', null, '');
    title.id = 'ph-title';
    bar.appendChild(title);
    bar.appendChild(btn('Close', 'btn btn--ghost btn--sm', function () { dlg.close(); }));
    dlg.appendChild(bar);
    var body = U.node('div', 'tx-dlg-body');
    dlg.appendChild(body);
    build(title, body);
    dlg.showModal();
  }

  /* One text's wording: the phone above, the words and fill-ins beneath. */
  function editWording(w) {
    var b = data.brands[w.site];
    openSheet(function (title, body) {
      title.textContent = w.n + '. ' + w.label;
      body.appendChild(U.node('p', 'meta', 'Goes when: ' + w.when));
      var ph = phone(b.from, fill(w.body, b.sample));
      body.appendChild(ph.node);
      var n = U.node('p', 'meta', '');
      var box = document.createElement('textarea');
      box.value = w.body; box.rows = 5; box.setAttribute('aria-label', 'Words of this text');
      function sync(dirty) {
        var t = fill(box.value, b.sample);
        ph.set(t);
        n.textContent = cost(t) + (dirty ? ' · not saved' : '');
      }
      box.addEventListener('input', function () { sync(true); });
      sync(false);
      body.appendChild(U.node('label', 'tx-lab', 'Words'));
      body.appendChild(box);
      body.appendChild(n);
      var chips = U.node('div', 'tx-chips');
      chips.appendChild(U.node('span', 'meta', 'Add:'));
      data.fillIns.forEach(function (f) {
        chips.appendChild(btn(FILL[f] || f, 'pill tx-chip', function () {
          var at = box.selectionStart == null ? box.value.length : box.selectionStart;
          box.value = box.value.slice(0, at) + '{' + f + '}' + box.value.slice(box.selectionEnd == null ? at : box.selectionEnd);
          box.focus(); sync(true);
        }));
      });
      body.appendChild(chips);
      var row = U.node('div', 'tx-row');
      row.appendChild(btn('Save', 'btn btn--primary btn--sm', async function () { if (await act({ op: 'template', kind: w.kind, site: w.site, body: box.value }, 'Wording saved.')) el('phone').close(); }));
      if (w.own) row.appendChild(btn('Back to the starting words', null, async function () { if (await act({ op: 'template', kind: w.kind, site: w.site, body: '' }, 'Back to the starting words.')) el('phone').close(); }));
      body.appendChild(row);
    });
  }

  /* A waiting or sent text, as it went (or will go). */
  function showText(t) {
    openSheet(function (title, body) {
      title.textContent = (t.name || 'Customer') + (t.postcode ? ', ' + t.postcode : '');
      body.appendChild(U.node('p', 'meta', t.label));
      body.appendChild(phone(data.brands[t.site].from, t.words || '').node);
      body.appendChild(U.node('p', 'meta', cost(t.words || '')));
    });
  }

  /* ---------- the lists ---------- */
  function status(t) {
    return t.status === 'waiting' ? 'Goes ' + when(t.sendAfter) : t.status === 'off' ? 'Not sent: texts were off (this is what would have gone)'
      : t.status === 'cancelled' ? 'Stopped: ' + (t.error || '') : t.status === 'failed' ? 'Failed: ' + (t.error || '')
      : 'Sent ' + when(t.sentAt) + (t.delivery === 'delivered' ? ', delivered' : t.delivery ? ', ' + t.delivery : '');
  }
  function textCard(t) {
    var li = U.node('li', 'tx-card' + (t.status === 'failed' || t.delivery === 'undelivered' || t.delivery === 'failed' ? ' is-bad' : ''));
    var top = U.node('div', 'tx-top');
    top.appendChild(U.node('b', null, (t.name || 'Customer') + (t.postcode ? ', ' + t.postcode : '')));
    top.appendChild(U.node('span', 'tag', t.label));
    li.appendChild(top);
    li.appendChild(U.node('p', 'meta', status(t) + (t.by ? ' · ' + t.by : '')));
    if (t.status === 'waiting') {
      var box = document.createElement('textarea'); box.value = t.words; box.rows = 3; box.setAttribute('aria-label', 'Words of this text');
      li.appendChild(box);
      var row = U.node('div', 'tx-row');
      row.appendChild(btn('Preview', null, function () { showText({ name: t.name, postcode: t.postcode, label: t.label, site: t.site, words: box.value }); }));
      row.appendChild(btn('Save words', null, function () { act({ op: 'edit', id: t.id, body: box.value }, 'Saved for this text only.'); }));
      row.appendChild(btn('Send now', 'btn btn--sm', function () { act({ op: 'send', id: t.id }, 'Sent.'); }));
      row.appendChild(btn('Stop it', null, function () { act({ op: 'cancel', id: t.id }, 'Stopped.'); }));
      li.appendChild(row);
    } else if (t.words) {
      var see = btn('', 'tx-words-btn', function () { showText(t); });
      see.textContent = t.words;
      see.setAttribute('aria-label', 'See this text as it arrived');
      li.appendChild(see);
    }
    return li;
  }

  /* The wording in the order a customer gets them, one tap to see and change. */
  function wordingList(ul) {
    data.wording.filter(function (w) { return w.site === site; }).forEach(function (w) {
      var li = U.node('li');
      var b = btn('', 'tx-word', function () { editWording(w); });
      b.appendChild(U.node('span', 'tx-n', String(w.n)));
      var mid = U.node('span', 'tx-word-mid');
      mid.appendChild(U.node('b', null, w.label));
      mid.appendChild(U.node('span', 'meta', w.when + (w.own ? ' · your wording' : '')));
      b.appendChild(mid);
      b.appendChild(U.node('span', 'tx-see', 'Preview'));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function drawBrands() {
    var box = el('brands'); box.textContent = '';
    var sites = Object.keys(data.brands).sort(function (a) { return a === 'dampscan' ? -1 : 1; });
    if (!site || sites.indexOf(site) === -1) site = sites.indexOf(stored()) !== -1 ? stored() : sites[0];
    box.hidden = sites.length < 2;
    sites.forEach(function (s) {
      var b = btn(data.brands[s].name, 'pill', function () { site = s; remember(s); drawBrands(); draw(); });
      b.setAttribute('aria-pressed', String(s === site));
      box.appendChild(b);
    });
  }

  function draw() {
    var list = el('list'); list.textContent = '';
    var mine = data.texts.filter(function (t) { return t.site === site; });
    var waiting = mine.filter(function (t) { return t.status === 'waiting' || t.status === 'sending'; });
    el('tab-waiting').textContent = 'Waiting' + (waiting.length ? ' (' + waiting.length + ')' : '');
    var ul = U.node('ul', tab === 'wording' ? 'tx-ul tx-words-list' : 'tx-ul');
    if (tab === 'wording') wordingList(ul);
    else {
      var rows = tab === 'waiting' ? waiting : mine.filter(function (t) { return waiting.indexOf(t) === -1; });
      if (!rows.length) ul.appendChild(U.node('li', 'state', tab === 'waiting' ? 'Nothing waiting.' : 'Nothing sent yet.'));
      rows.forEach(function (t) { ul.appendChild(textCard(t)); });
    }
    list.appendChild(ul);
  }

  async function load() {
    try {
      data = await U.get('/api/admin/texts');
      el('live').textContent = data.live ? (data.test ? 'On, in test mode: every text goes to the test number.' : 'On.')
        : 'Off: nothing goes to customers.';
      el('state').hidden = true; el('content').hidden = false;
      drawBrands();
      draw();
    } catch (e) { if (e.message !== 'unauthorised') el('state').textContent = 'Only managers of ATi or DampScan see texts.'; }
  }

  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      tab = b.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      draw();
    });
  });
  el('phone').addEventListener('click', function (ev) { if (ev.target === el('phone')) el('phone').close(); });
  load();
})();
