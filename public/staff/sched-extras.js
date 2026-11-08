/* Extras on the Scheduling booking form: the add-ons from the one price list,
   ticked with what the customer chose online, and the total (survey plus
   extras), which can be changed. Booking a job card leaves them hidden: its
   survey and price are changed from the job pop-up. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var state = { rates: [], extras: [], typed: false };

  function rateFor(key) { return state.rates.filter(function (r) { return r.key === key; })[0]; }
  function total() {
    var r = rateFor(el('b-type').value);
    if (!r) return '';
    var sum = r.pricePence / 100;
    el('b-extras').querySelectorAll('input:checked').forEach(function (b) { sum += Number(b.dataset.price); });
    return String(Math.round(sum));
  }
  function refresh() { if (!state.typed) el('b-price').value = total(); }

  /* Called each time the form opens, for this customer only. */
  function fill(c, data) {
    state.rates = data.rates || []; state.extras = data.extras || []; state.typed = false;
    var box = el('b-extras');
    var wrap = el('b-extras-wrap');
    wrap.hidden = c.kind === 'job';
    if (wrap.hidden) return;
    var chose = ((c.chose && c.chose.addOns) || []).map(function (a) { return a.key; });
    box.textContent = '';
    state.extras.forEach(function (x) {
      var l = U.node('label', 'b-extra');
      var b = document.createElement('input'); b.type = 'checkbox'; b.value = x.key; b.dataset.price = x.price;
      b.checked = chose.indexOf(x.key) !== -1;
      b.addEventListener('change', refresh);
      l.appendChild(b);
      l.appendChild(document.createTextNode(' ' + x.name + ', ' + (x.from ? 'from ' : '') + '£' + x.price));
      box.appendChild(l);
    });
    refresh();
  }

  function values() {
    if (el('b-extras-wrap').hidden) return {};
    var keys = [].map.call(el('b-extras').querySelectorAll('input:checked'), function (b) { return b.value; });
    var p = el('b-price').value.trim();
    return { extras: keys, pricePounds: p === '' ? null : Number(p) };
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('b-type').addEventListener('change', refresh);
    el('b-price').addEventListener('input', function () { state.typed = el('b-price').value.trim() !== ''; });
  });
  global.DSSCHEDX = { fill: fill, values: values };
})(window);
