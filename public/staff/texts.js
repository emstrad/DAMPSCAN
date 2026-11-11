/* The Texts page (lib/routes/admin/texts.js): what is waiting to go (change
   the words, send now or stop it), what went and whether it arrived, and the
   wording of each text per brand with a live preview and the cost in texts. */
(function () {
  'use strict';
  var U = window.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var BRAND = { dampscan: 'DampScan', 'ati-london': 'ATi' };
  var tab = 'waiting', data = null;
  var when = function (iso) { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  function btn(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function cost(n) { return n + ' text' + (n === 1 ? '' : 's'); }
  function count(s) {
    var plain = /^[\x20-\x7E\n£€]*$/.test(s), one = plain ? 160 : 70, many = plain ? 153 : 67;
    return s.length <= one ? 1 : Math.ceil(s.length / many);
  }

  async function act(body, said) {
    var r = await U.send('/api/admin/texts', body);
    if (r && r.ok === false) { U.toast && U.toast('That did not save.'); return; }
    if (said && U.toast) U.toast(said);
    load();
  }

  function textCard(t) {
    var li = U.node('li', 'tx-card' + (t.status === 'failed' || t.delivery === 'undelivered' || t.delivery === 'failed' ? ' is-bad' : ''));
    var top = U.node('div', 'tx-top');
    top.appendChild(U.node('b', null, (t.name || 'Customer') + (t.postcode ? ', ' + t.postcode : '')));
    top.appendChild(U.node('span', 'tag', (BRAND[t.site] || '') + ' · ' + t.label));
    li.appendChild(top);
    var status = t.status === 'waiting' ? 'Goes ' + when(t.sendAfter) : t.status === 'off' ? 'Not sent: texts are off (this is what would have gone)'
      : t.status === 'cancelled' ? 'Stopped: ' + (t.error || '') : t.status === 'failed' ? 'Failed: ' + (t.error || '')
      : 'Sent ' + when(t.sentAt) + (t.delivery === 'delivered' ? ', delivered' : t.delivery ? ', ' + t.delivery : '');
    li.appendChild(U.node('p', 'meta', status + (t.by ? ' · ' + t.by : '')));
    if (t.status === 'waiting') {
      var box = document.createElement('textarea'); box.value = t.words; box.rows = 3; box.setAttribute('aria-label', 'Words of this text');
      var n = U.node('span', 'meta', cost(t.segments));
      box.addEventListener('input', function () { n.textContent = cost(count(box.value)) + ' · not saved'; });
      li.appendChild(box); li.appendChild(n);
      var row = U.node('div', 'tx-row');
      row.appendChild(btn('Save words', 'btn btn--ghost btn--sm', function () { act({ op: 'edit', id: t.id, body: box.value }, 'Saved for this text only.'); }));
      row.appendChild(btn('Send now', 'btn btn--sm', function () { act({ op: 'send', id: t.id }, 'Sent.'); }));
      row.appendChild(btn('Stop it', 'btn btn--ghost btn--sm', function () { act({ op: 'cancel', id: t.id }, 'Stopped.'); }));
      li.appendChild(row);
    } else if (t.words) li.appendChild(U.node('p', 'tx-words', t.words));
    return li;
  }

  function wordingCard(w) {
    var li = U.node('li', 'tx-card');
    var top = U.node('div', 'tx-top');
    top.appendChild(U.node('b', null, w.n + '. ' + w.label));
    top.appendChild(U.node('span', 'tag', BRAND[w.site] || ''));
    li.appendChild(top);
    li.appendChild(U.node('p', 'meta', w.when + (w.own ? ' · your wording' + (w.by ? ', ' + w.by : '') : ' · starting wording')));
    var box = document.createElement('textarea'); box.value = w.body; box.rows = 3; box.setAttribute('aria-label', w.label + ' wording');
    var n = U.node('span', 'meta', cost(count(w.body)) + ' before filling in');
    box.addEventListener('input', function () { n.textContent = cost(count(box.value)) + ' before filling in · not saved'; });
    li.appendChild(box); li.appendChild(n);
    var row = U.node('div', 'tx-row');
    row.appendChild(btn('Save', 'btn btn--sm', function () { act({ op: 'template', kind: w.kind, site: w.site, body: box.value }, 'Wording saved.'); }));
    if (w.own) row.appendChild(btn('Back to the starting words', null, function () { act({ op: 'template', kind: w.kind, site: w.site, body: '' }, 'Back to the starting words.'); }));
    li.appendChild(row);
    return li;
  }

  function draw() {
    var list = el('list'); list.textContent = '';
    var ul = U.node('ul', 'tx-ul');
    if (tab === 'wording') {
      list.appendChild(U.node('p', 'meta', 'Fill-ins: ' + data.fillIns.map(function (f) { return '{' + f + '}'; }).join(' ')));
      data.wording.forEach(function (w) { ul.appendChild(wordingCard(w)); });
    } else {
      var rows = data.texts.filter(function (t) { return tab === 'waiting' ? t.status === 'waiting' || t.status === 'sending' : t.status !== 'waiting' && t.status !== 'sending'; });
      if (!rows.length) ul.appendChild(U.node('li', 'state', tab === 'waiting' ? 'Nothing waiting.' : 'Nothing sent yet.'));
      rows.forEach(function (t) { ul.appendChild(textCard(t)); });
    }
    list.appendChild(ul);
  }

  async function load() {
    try {
      data = await U.get('/api/admin/texts');
      var senders = Object.keys(data.senders).filter(function (s) { return !data.senders[s]; }).map(function (s) { return BRAND[s]; });
      el('live').textContent = data.live ? (data.test ? 'Texts are on, in test mode: every text goes to the test number.' : 'Texts are on.')
        : 'Texts are off: nothing goes to customers. The Sent tab shows what would have gone.';
      if (senders.length) el('live').textContent += ' No sender name set for ' + senders.join(' and ') + '.';
      el('state').hidden = true; el('content').hidden = false;
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
  load();
})();
