/* Pencilled times on Today and the week (lib/pencils.js): grey, never a
   booked survey, saying who else was offered the same time. A tap opens the
   card on the Scheduling board, where it is booked or let go. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  /* A pencilled time: grey, says who else holds it, and opens Scheduling. */
  function button(e, compact) {
    var b = U.node('button', 'tl-job is-pencil' + (e.sharing.length || e.clashesBooked ? ' is-shared' : '') + (compact ? ' tl-job--compact' : ''));
    b.type = 'button';
    if (!compact) b.appendChild(U.node('span', 'tl-time', e.time));
    var main = U.node('span', 'tl-main');
    main.appendChild(U.node('span', 'tl-who', (compact ? e.time + ' ' : '') + 'Pencilled: ' + [e.customerName || 'No name', e.postcode].filter(Boolean).join(', ')));
    main.appendChild(U.node('span', 'tl-biz tl-kind', (e.surveyor ? e.surveyor.charAt(0).toUpperCase() + e.surveyor.slice(1) + ' · ' : '') + 'not confirmed'));
    if (e.by) main.appendChild(U.node('span', 'tl-biz', 'By ' + e.by + (e.byHand ? ', held until let go (agent)' : '')));
    if (e.outsideHours) main.appendChild(U.node('span', 'tl-biz tl-clash', 'Outside ' + (e.surveyor || 'their') + '\'s hours now'));
    if (e.sharing.length) main.appendChild(U.node('span', 'tl-biz tl-clash', 'Also offered to ' + e.sharing.join(', ') + ': first yes gets it'));
    if (e.clashesBooked) main.appendChild(U.node('span', 'tl-biz tl-clash', 'Clashes with a booked survey'));
    b.appendChild(main);
    b.addEventListener('click', function (ev) { ev.stopPropagation(); location.href = '/staff/schedule.html#' + e.of + '-' + e.id; });
    return b;
  }
  global.DSPENCIL = { button: button };
})(window);
