/* The pieces of the customer's page (portal.js draws them): icons, the
   segmented choice with its gliding pill, folds, the toast, copying, and the
   payment card (amount, then bank transfer with the reference as the hero).
   Plain DOM, no build step. Nothing here names a brand: that comes from the server. */
(function (global) {
  'use strict';
  var S = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var I = {
    lock: S.replace(/18/g, '13') + '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    lockBig: S.replace(/18/g, '16') + '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    copy: S + '<rect x="9" y="9" width="12" height="12" rx="3"/><path d="M5 15V6a3 3 0 0 1 3-3h9"/></svg>',
    check: S + '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cal: S.replace(/18/g, '16') + '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    phone: S.replace(/18/g, '16') + '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    dl: S + '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    info: S.replace(/18/g, '16') + '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    tick: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function t(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, html, fn) { var b = h('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  var money = function (p) { return '£' + (p / 100).toFixed(p % 100 ? 2 : 0); };
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* The amount rolls to its new figure (about 260ms). */
  function roll(el, to) {
    var from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (reduce || from === to) { el.textContent = money(to); return; }
    var t0 = performance.now();
    (function step(now) { var k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3); el.textContent = money(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); else el.textContent = money(to); })(t0);
  }
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast'); el.innerHTML = I.check; el.appendChild(document.createTextNode(msg)); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }
  function glide(box) { var on = box.querySelector('button[aria-pressed="true"]'), pill = box.querySelector('.pill'); if (!on || !pill) return; pill.style.width = on.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (on.offsetLeft - 4) + 'px)'; }
  function seg(items, value, onPick, label) {
    var box = h('div', 'pt-seg'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', label); box.appendChild(h('span', 'pill'));
    items.forEach(function (it) { var b = btn(null, it[1], function () { box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); glide(box); onPick(it[0]); }); b.setAttribute('aria-pressed', String(it[0] === value)); box.appendChild(b); });
    requestAnimationFrame(function () { glide(box); }); return box;
  }
  global.addEventListener('resize', function () { document.querySelectorAll('.pt-seg').forEach(glide); });
  function fold(parent, title, fill, open) {
    var box = h('div', 'pt-fold' + (open ? ' open' : ''));
    var hd = btn(null, '<span></span>' + I.chev, function () { box.classList.toggle('open'); hd.setAttribute('aria-expanded', String(box.classList.contains('open'))); });
    hd.firstChild.textContent = title; hd.setAttribute('aria-expanded', String(Boolean(open)));
    var body = h('div', 'body'), wrap = h('div'), inner = h('div', 'inner');
    fill(inner); wrap.appendChild(inner); body.appendChild(wrap); box.appendChild(hd); box.appendChild(body); parent.appendChild(box);
  }
  function banner(cls, text, strong) {
    var b = h('div', 'pt-banner ' + (cls || ''), I.info), s = t('span', null, text);
    if (strong) { s.appendChild(document.createTextNode(' ')); s.appendChild(t('b', null, strong)); }
    b.appendChild(s); return b;
  }
  /* Copy in one tap; phones that block the clipboard fall back to selecting it. */
  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = t('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove();
    return ok ? Promise.resolve() : Promise.reject();
  }
  function copied(el, value, msg) {
    copyText(value).then(function () {
      var was = el.innerHTML; el.innerHTML = el.classList.contains('pt-copy') ? I.check : '<span class="in">' + I.check + ' Copied</span>';
      el.classList.add('done'); toast(msg); setTimeout(function () { el.innerHTML = was; el.classList.remove('done'); }, 1400);
    }, function () { toast('Press and hold to copy'); });
  }
  function copyRow(label, shown, value) {
    var r = h('div', 'pt-copyrow'), tx = h('div'); tx.appendChild(t('small', null, label)); tx.appendChild(t('b', null, shown)); r.appendChild(tx);
    var c = btn('pt-copy', I.copy, function () { copied(c, value, label + ' copied'); }); c.setAttribute('aria-label', 'Copy ' + label); r.appendChild(c); return r;
  }
  /* The business's bank details, one per line ("Sort code: 04-00-75"). */
  function bankRows(text) {
    return String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^([^:]+):\s*(.+)$/) || l.match(/^(sort code|account(?: number| no\.?)?|iban|bic|swift)\s+(.+)$/i);
      if (!m) return { label: 'Pay to', value: l };
      return { label: m[1].charAt(0).toUpperCase() + m[1].slice(1), value: m[2] };
    });
  }

  /**
   * The payment card. balanceOnly: the report stage, where only the full
   * balance unlocks the report. Otherwise the deposit (or what is left of
   * it), in full, or any amount from the deposit up.
   */
  function payCard(p, balanceOnly) {
    var m = p.money, card = h('div', 'pt-card');
    var least = balanceOnly ? m.balancePence : m.minNowPence, most = m.balancePence;
    var pick = 'deposit', other = '';
    function amount() { if (balanceOnly) return most; if (pick === 'other') return Math.round(Number(other) * 100); return pick === 'full' ? most : least; }
    function ok(a) { return isFinite(a) && a > 0 && a >= least && a <= most; }
    card.appendChild(t('div', 'pt-label', balanceOnly ? 'Balance to pay' : 'Amount to pay'));
    var amt = h('div', 'pt-amount'), big = t('b', null, money(balanceOnly ? most : least)); big.dataset.v = balanceOnly ? most : least;
    amt.appendChild(big); if (!balanceOnly) amt.appendChild(t('span', null, 'of ' + money(most) + (m.paidPence ? ' left' : ''))); card.appendChild(amt);
    var hint = t('p', 'pt-hint', ''), field = h('label', 'pt-field'), inp = t('input');
    if (!balanceOnly && least < most) {
      var wrap = h('div', 'pt-other'), inner = h('div');
      field.appendChild(t('span', null, '£')); inp.type = 'text'; inp.inputMode = 'decimal'; inp.id = 'pt-amount'; inp.setAttribute('aria-label', 'Amount in pounds');
      inp.placeholder = money(least) + ' to ' + money(most); field.appendChild(inp); inner.appendChild(field); wrap.appendChild(inner);
      card.appendChild(seg([['deposit', (m.paidPence ? 'Rest of deposit' : 'Deposit') + '<small>' + money(least) + '</small>'], ['full', 'In full<small>' + money(most) + '</small>'], ['other', 'Other<small>you choose</small>']], 'deposit', function (v) {
        pick = v; wrap.classList.toggle('open', v === 'other'); if (v === 'other') setTimeout(function () { inp.focus(); }, 120); else { other = ''; inp.value = ''; } sync();
      }, 'How much to pay'));
      card.appendChild(wrap);
      inp.addEventListener('input', function () { var v = inp.value.replace(/[^\d.]/g, ''); if (v !== inp.value) inp.value = v; other = v; sync(); });
      inp.addEventListener('blur', function () { if (other !== '' && !ok(amount())) { field.classList.remove('bad'); void field.offsetWidth; field.classList.add('bad'); } });
    }
    card.appendChild(hint);
    var area = h('div'); area.style.display = 'grid'; area.style.gap = '10px'; card.appendChild(area);
    var amountRow;
    if (p.payTo) {
      card.insertBefore(t('div', 'pt-label', 'Pay by bank transfer'), area);
      var ref = h('div', 'pt-ref');
      ref.appendChild(t('small', null, 'Your reference: use exactly this'));
      ref.appendChild(t('div', 'code', p.reference));
      var rb = btn('pt-btn', '<span class="in">' + I.copy + ' Copy reference</span>', function () { copied(rb, p.reference, 'Reference copied'); });
      ref.appendChild(rb); area.appendChild(ref);
      amountRow = copyRow('Amount', money(amount()), (amount() / 100).toFixed(2)); area.appendChild(amountRow);
      bankRows(p.payTo).forEach(function (r) { area.appendChild(copyRow(r.label, r.value, r.value.replace(/^(\d{2})[ -]?(\d{2})[ -]?(\d{2})$/, '$1$2$3'))); });
      area.appendChild(h('div', 'pt-live', '<span class="pt-dot"></span><span>We\'ll match your payment by its reference. This page updates once it\'s in.</span>'));
    }
    var call = h('a', 'pt-btn ghost', '<span class="in">' + I.phone + ' Pay by card: call us</span>'); call.href = 'tel:' + p.brand.phone; area.appendChild(call);
    function sync() {
      var a = amount(), good = ok(a);
      roll(big, good ? a : (balanceOnly ? most : least));
      field.classList.remove('bad');
      if (!balanceOnly && pick === 'other' && other !== '' && !good) { hint.className = 'pt-hint bad'; hint.textContent = a > most ? 'That\'s more than the ' + money(most) + ' due.' : 'The least you can pay now is ' + money(least) + '.'; }
      else { hint.className = 'pt-hint'; hint.textContent = balanceOnly ? 'Your report unlocks as soon as this is paid.' : 'Pay anything from ' + money(least) + '. The rest is due when your report is ready.'; }
      if (amountRow) { var b = amountRow.querySelector('b'); b.textContent = good ? money(a) : '-'; amountRow.querySelector('.pt-copy').onclick = null; }
    }
    if (amountRow) amountRow.querySelector('.pt-copy').addEventListener('click', function (e) { e.stopImmediatePropagation(); var a = amount(); if (ok(a)) copied(this, (a / 100).toFixed(2), 'Amount copied'); }, true);
    sync();
    return card;
  }

  global.PT = { I: I, h: h, t: t, btn: btn, money: money, toast: toast, seg: seg, fold: fold, banner: banner, payCard: payCard, copyRow: copyRow };
})(window);
