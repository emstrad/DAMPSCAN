/* Starts the phone tour once it is on screen, so it opens on the first screen. */
(function () {
  'use strict';
  var box = document.querySelector('.yp');
  if (!box) return;
  if (!('IntersectionObserver' in window)) { box.classList.add('is-live'); return; }
  var io = new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) { box.classList.add('is-live'); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe(box);
})();
