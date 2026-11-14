/* The Apple Pay or Google Pay button right on the customer's page (the
   owner's ask, 14 Nov 2026): tap, Face ID, paid, without a trip to Stripe's
   page. Stripe.js draws the button (it must come from js.stripe.com); our
   server makes the payment for the amount chosen and checks it (lib/revolut-pay.js
   startWallet), and the page then comes back exactly as after Stripe's page, so
   the payment is confirmed from Stripe itself before it shows as received.
   Phones with neither wallet never see it: the usual Pay button stays. */
(function (global) {
  'use strict';
  var JS = 'https://js.stripe.com/v3/';
  var loading = null;
  function load() {
    if (global.Stripe) return Promise.resolve(global.Stripe);
    if (loading) return loading;
    loading = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = JS; s.async = true;
      s.onload = function () { ok(global.Stripe); }; s.onerror = function () { loading = null; no(new Error('stripe')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /**
   * Mounts the button in `box`. o: { key, token, amount(), ok(), onShown(), onNone(), onError(text) }.
   * onNone: no wallet on this phone after all (or Stripe.js would not load), so the page puts its own Pay button back.
   * Returns { amount(pence) } so the page can follow Deposit, In full or Other.
   */
  function mount(box, o) {
    var elements = null, now = Math.max(30, o.amount() || 0), settled = false, busy = false;
    var none = function () { if (settled) return; settled = true; box.hidden = true; o.onNone(); };
    /* Stripe normally answers in a second; if it has not in six, the page's own button is the way to pay. */
    var wait = setTimeout(none, 6000);
    load().then(function (Stripe) {
      var stripe = Stripe(o.key);
      /* ATi's page is light and DampScan's dark: a solid black button on light, white on dark, so it always reads as a button. */
      var light = document.documentElement.dataset.site === 's2';
      elements = stripe.elements({ mode: 'payment', amount: now, currency: 'gbp', paymentMethodTypes: ['card'],
        appearance: { theme: light ? 'stripe' : 'night', variables: { borderRadius: '14px' } } });
      var ece = elements.create('expressCheckout', {
        buttonType: { applePay: 'plain', googlePay: 'plain' }, buttonHeight: 52,
        buttonTheme: { applePay: light ? 'black' : 'white', googlePay: light ? 'black' : 'white' },
        paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
        layout: { maxColumns: 1, maxRows: 1 }
      });
      ece.on('ready', function (e) {
        var any = e.availablePaymentMethods && (e.availablePaymentMethods.applePay || e.availablePaymentMethods.googlePay);
        clearTimeout(wait);
        if (!any) { none(); return; }
        if (settled) return;
        settled = true; box.hidden = false; box.classList.remove('is-loading'); o.onShown();
      });
      ece.on('loaderror', function () { clearTimeout(wait); none(); });
      /* An amount the page would refuse never opens the sheet. */
      ece.on('click', function (e) { if (o.ok() && !busy) e.resolve(); });
      ece.on('confirm', function (ev) {
        var pence = o.amount(), done = false;
        busy = true;
        /* Whatever goes wrong, the Apple Pay sheet is closed with a failure (never left spinning) and we hear why. */
        var fail = function (text) {
          if (done) return; done = true; busy = false;
          try { ev.paymentFailed({ reason: 'fail' }); } catch (e) { /* the sheet may already be gone */ }
          o.onError(text || 'That payment didn\'t go through. Nothing was taken.');
          fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: 'portal', op: 'wallet_failed', t: o.token, text: String(text || '').slice(0, 200) }) }).catch(function () {});
        };
        var slow = setTimeout(function () { fail('That took too long. Nothing was taken: please try again.'); }, 30000);
        elements.submit().then(function (sub) {
          if (sub.error) throw new Error(sub.error.message);
          return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: 'portal', op: 'wallet', t: o.token, pence: pence }) });
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d.ok || !d.clientSecret) throw new Error('That didn\'t start (' + (d.error || 'no answer') + '). Please try again.');
          return stripe.confirmPayment({ elements: elements, clientSecret: d.clientSecret, confirmParams: { return_url: d.back }, redirect: 'if_required' })
            .then(function (res) { if (res.error) throw new Error(res.error.message); done = true; clearTimeout(slow); location.href = d.back; });
        }).catch(function (err) { clearTimeout(slow); fail(err && err.message); });
      });
      ece.mount(box);
    }).catch(function () { clearTimeout(wait); none(); });
    return { amount: function (pence) { if (pence >= 30 && pence !== now) { now = pence; if (elements) elements.update({ amount: pence }); } } };
  }

  global.PTWALLET = { mount: mount };
})(window);
