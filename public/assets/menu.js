/**
 * The mobile menu on the two home pages.
 *
 * Below 980px the header nav was set to display:none with nothing to replace
 * it, so a phone got a header with no navigation at all. This is that
 * replacement, and it is deliberately not a library.
 *
 * What "works properly" means here, because a menu that only opens is not
 * finished:
 *
 *   - the button reports its own state, so a screen reader announces expanded
 *     or collapsed rather than reading a nameless button
 *   - opening moves focus into the panel, closing puts it back on the button,
 *     because focus left behind in a closed panel is focus lost
 *   - Tab is held inside the panel while it is open, so tabbing does not walk
 *     invisibly through the page underneath
 *   - Escape closes it, a click outside closes it, following a link closes it,
 *     and resizing past the breakpoint closes it
 *   - the page behind does not scroll while it is open
 *
 * Progressive enhancement: the markup is a real nav with real links. The
 * no-js class on the document is removed by an inline script in the head, and
 * the CSS only hides the links once that class is gone. If this file fails to
 * load, the nav renders as a wrapped list and every link still works.
 */
(function mobileMenu(){
  const toggle = document.querySelector('.nav-toggle');
  const panel = document.getElementById('primary-nav');
  if (!toggle || !panel) return;

  const FOCUSABLE = 'a[href], button:not([disabled])';
  const header = toggle.closest('header');

  /* The panel hangs off the bottom of the header, so it has to know how tall
     the header actually is. Measuring beats a hard coded number that quietly
     stops matching the moment the logo or the padding changes. */
  function measure(){
    if (header) document.documentElement.style.setProperty('--head-h', header.offsetHeight + 'px');
  }
  measure();
  window.addEventListener('resize', measure);
  const mq = window.matchMedia('(max-width: 980px)');
  let open = false;
  let lastFocus = null;

  function setOpen(next){
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('nav-open', open);

    if (open) {
      lastFocus = document.activeElement;
      const first = panel.querySelector(FOCUSABLE);
      if (first) first.focus();
    } else if (lastFocus && lastFocus.focus) {
      lastFocus.focus();
      lastFocus = null;
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));

  /* Escape from anywhere, because focus may be on any link inside the panel. */
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key !== 'Tab') return;

    /* DOM order, which is toggle first and then the panel links, because the
       button sits above the list in the markup. Building this the other way
       round put the wrap in the wrong place and focus walked straight out of
       the panel into the header behind it. */
    const items = [toggle].concat(Array.from(panel.querySelectorAll(FOCUSABLE)));
    if (items.length < 2) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* A tap on the page behind should close it, the way every other overlay
     behaves. The toggle is excluded or its own click would reopen it. */
  document.addEventListener('click', (e) => {
    if (!open) return;
    if (panel.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  });

  /* Following a link inside the panel closes it. Same page anchors would
     otherwise scroll behind a panel that is still covering the target. */
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a[href]')) setOpen(false);
  });

  /* Rotating a phone or widening a window past the breakpoint shows the normal
     nav again, and leaving the panel open behind it would strand the state. */
  const onChange = () => { if (!mq.matches) setOpen(false); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else mq.addListener(onChange);
})();
