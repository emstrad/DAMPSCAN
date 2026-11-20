/* Company, Money: where the money went, who gets what, card payments and tax
   (the owner, 20 Nov 2026: one complete overview of the money and structure).
   Drawn by company-money.js from lib/company-money-parts.js figures. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var pct = function (bp) { return Math.round(Number(bp) / 100) + '%'; };

  function rows(into, list) {
    var box = node('div', 'c-rows');
    list.forEach(function (r) {
      var row = node(r.open ? 'button' : 'div', 'c-row' + (r.cls ? ' ' + r.cls : '')); if (r.open) { row.type = 'button'; row.addEventListener('click', r.open); }
      var l = node('span', 'c-l'); l.appendChild(node('b', null, r.label)); if (r.sub) l.appendChild(node('small', null, r.sub));
      var rt = node('span', 'c-r'); rt.appendChild(node('span', 'c-amt', r.figure)); if (r.open) rt.appendChild(node('span', 'c-chev', '›'));
      row.appendChild(l); row.appendChild(rt); box.appendChild(row);
    });
    into.appendChild(box);
  }

  /* Money in down to the shares, in the order the split takes it, adding up to the penny. */
  function flow(d, section, money) {
    var f = d.flow, s = section('Where the money went');
    var sh = d.settings && d.settings.shares;
    var split = sh ? 'Scott ' + pct(sh.scott) + ', Tom ' + pct(sh.tom) + ', Ben ' + pct(sh.ben) : 'The old split';
    rows(s, [
      { label: 'Money in', sub: d.period.surveys + ' survey' + (d.period.surveys === 1 ? '' : 's') + ' paid in full', figure: money(f.in) },
      { label: 'Card fees', sub: 'Stripe, off the top', figure: '−' + money(f.cardFees) },
      { label: 'Tax pot', sub: pct(d.settings.taxBp) + ' set aside for corporation tax', figure: '−' + money(f.tax) },
      { label: 'Surveyor fees', sub: 'To whoever visited', figure: '−' + money(f.surveyorFees) },
      { label: 'Shared', sub: split, figure: money(f.shared) }
    ]);
    if (f.check) s.appendChild(node('p', 'mn-say is-bad', 'Out by ' + money(f.check) + ': a survey has money moved by hand.'));
  }

  /* Each person: what the period earned them (fees and share), and where they stand now. */
  function who(d, section, money) {
    var s = section('Who gets what');
    rows(s, d.who.map(function (p) {
      var sub = p.key === 'tax' ? 'Set aside' : (p.fees ? 'Fees ' + money(p.fees) + ' (' + p.surveys + ' survey' + (p.surveys === 1 ? '' : 's') + ')' + (p.share ? ' + share ' + money(p.share) : '') : 'Share ' + money(p.share));
      sub += ' · owed now ' + money(p.owed) + (p.coming ? ' · ' + money(p.coming) + ' coming' : '');
      return { label: p.name, sub: sub, figure: money(p.earned), open: function () { if (global.DSCOSHOW) global.DSCOSHOW('pay'); if (global.DSCOPAY) global.DSCOPAY.open(p.key); } };
    }));
  }

  /* Card payments: what Stripe took and kept, what it has paid into Tide and what it still holds. */
  function cards(d, section, tile, money) {
    var c = d.cards; if (!c) return;
    var s = section('Card payments');
    var t = node('div', 'mn-tiles');
    t.appendChild(tile('Taken by card', money(c.taken), c.payments + ' payment' + (c.payments === 1 ? '' : 's')));
    t.appendChild(tile('Stripe fees', money(c.fees), c.rate + '% of what was taken'));
    t.appendChild(tile('Refunded', money(c.refunded)));
    t.appendChild(tile('After fees and refunds', money(c.net)));
    s.appendChild(t);
    if (c.stripe && !c.stripe.error) {
      var t2 = node('div', 'mn-tiles');
      t2.appendChild(tile('Paid into Tide', money(c.stripe.paidOut), c.stripe.payouts + ' payout' + (c.stripe.payouts === 1 ? '' : 's') + ' in this period'));
      t2.appendChild(tile('Still in Stripe', money(c.stripe.available + c.stripe.pending), money(c.stripe.pending) + ' on its way'));
      s.appendChild(t2);
    } else if (c.stripe && c.stripe.error) s.appendChild(node('p', 'mn-say', 'Stripe did not answer just now.'));
    if (c.feeMissing) s.appendChild(node('p', 'mn-say', c.feeMissing + ' fee' + (c.feeMissing === 1 ? '' : 's') + ' still to come from Stripe; filled in hourly.'));
  }

  /* Corporation tax for the company year, and where the money for it is. */
  function tax(d, section, tile, money, day) {
    var x = d.tax, s = section('Tax');
    var t = node('div', 'mn-tiles');
    t.appendChild(tile('Profit so far', money(x.profit), 'since ' + day(x.yearFrom)));
    t.appendChild(tile('Corp tax due on it', money(x.estimate), Math.round(x.rate * 1000) / 10 + '% on the next pound'));
    t.appendChild(tile('Set aside', money(x.setAside), 'from every survey paid'));
    t.appendChild(tile('In tax savings', money(x.inPot), x.paidHmrc ? money(x.paidHmrc) + ' paid to HMRC' : 'none paid to HMRC yet'));
    s.appendChild(t);
    if (x.toMove > 0) s.appendChild(node('p', 'mn-say is-bad', money(x.toMove) + ' set aside and not yet moved to tax savings.'));
    s.appendChild(node('p', 'mn-say' + (x.gap < 0 ? ' is-bad' : ''), x.gap >= 0 ? money(x.gap) + ' more set aside than the tax due. Comfortable.' : 'Set aside is ' + money(-x.gap) + ' short of the tax due.'));
  }

  global.DSMONEYPARTS = { flow: flow, who: who, cards: cards, tax: tax };
})(window);
