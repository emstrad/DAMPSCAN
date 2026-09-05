/**
 * Reading a clipped review in full.
 *
 * reviews.css clamps a long review to eight lines so one three paragraph
 * review stops making every card in the marquee as tall as it. This is the way
 * back to the rest of it: the cards that are actually cut get a button, and the
 * button opens the whole review in a dialog.
 *
 * Measured rather than assumed. Whether a review is clipped depends on the
 * font, the viewport and the card width, so the only honest test is to ask the
 * browser whether the paragraph overflows. Cards that fit are left alone, which
 * is why a short review never carries a button it does not need.
 *
 * Nothing here is the source of any text. The dialog is filled from the card,
 * which was filled by the build from content/reviews or by the page's own
 * renderer from /api/reviews, both of which escape as they write. So this file
 * moves already escaped markup and never composes any.
 */
(function reviewPopouts(){
  const tracks = Array.from(document.querySelectorAll('.carousel-track'));
  if (!tracks.length) return;

  const root = document.documentElement;
  let dialog = null;
  let opener = null;

  /* Built once, on first use. A page whose reviews all fit never creates it. */
  function ensureDialog(){
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'review-dialog';
    dialog.innerHTML =
      '<div class="review-dialog-body">' +
        '<div class="stars"></div>' +
        '<div class="review-dialog-text"></div>' +
        '<div class="review-attr"><span class="who"></span>' +
        '<span class="src">Google review</span></div>' +
        '<button type="button" class="review-close">Close</button>' +
      '</div>';
    dialog.querySelector('.review-close').addEventListener('click', () => dialog.close());
    /* Native dialog fires close for Escape and for the button alike, so the
       tidying up lives in one place. */
    dialog.addEventListener('close', () => {
      root.classList.remove('reviews-open');
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    });
    /* A click on the backdrop lands on the dialog element itself rather than
       on anything inside it. */
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    return dialog;
  }

  function open(card, button){
    const d = ensureDialog();
    const stars = card.querySelector('.stars');
    const who = card.querySelector('.review-attr span');
    const text = card.querySelector('p');

    d.querySelector('.stars').textContent = stars ? stars.textContent : '';
    d.querySelector('.stars').setAttribute('aria-label', stars ? stars.getAttribute('aria-label') || '' : '');
    /* innerHTML rather than textContent, to keep the line breaks the reviewer
       typed. Both writers of this markup escape first, so the only tag in it
       is the <br /> they put there. */
    d.querySelector('.review-dialog-text').innerHTML = text ? text.innerHTML : '';
    d.querySelector('.who').textContent = who ? who.textContent : '';

    opener = button;
    root.classList.add('reviews-open');
    d.showModal();
    d.querySelector('.review-dialog-text').scrollTop = 0;
  }

  /**
   * The marquee needs two copies of the list to loop without a gap, and there
   * are two tracks, so every review is on screen up to four times. Only the
   * first copy of the first track should be reachable by tab: the rest is the
   * same content again, and four identical buttons in the tab order is a worse
   * experience than none.
   */
  function focusable(track, card){
    if (track.closest('[aria-hidden="true"]')) return false;
    const cards = Array.from(track.children);
    return cards.indexOf(card) < cards.length / 2;
  }

  function scan(){
    for (const track of tracks) {
      for (const card of Array.from(track.children)) {
        const text = card.querySelector('p');
        if (!text) continue;

        const clipped = text.scrollHeight > text.clientHeight + 1;
        text.classList.toggle('is-clipped', clipped);

        const existing = card.querySelector('.review-more');
        if (!clipped) { if (existing) existing.remove(); continue; }
        if (existing) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'review-more';
        button.textContent = 'Read full review';
        const who = card.querySelector('.review-attr span');
        button.setAttribute('aria-label', who ? `Read ${who.textContent}'s full review` : 'Read the full review');
        if (!focusable(track, card)) button.tabIndex = -1;
        button.addEventListener('click', () => open(card, button));
        /* Above the attribution, which is pinned to the bottom of the card. */
        card.insertBefore(button, card.querySelector('.review-attr'));
      }
    }
  }

  /* Fonts land after first paint and change where the text wraps, so a single
     measurement on load can be taken against the fallback font and be wrong.
     A second pass once the real fonts are in costs nothing. */
  scan();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scan);

  /* The card width does not change with the viewport, but the font size can,
     and a rotated phone re-wraps. Cheap enough to redo. */
  let timer = null;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  });

  /* The page replaces the whole track when /api/reviews returns a live set.
     Watching for that beats asking the page's own script to call us, which
     would mean the same call written into both home pages by hand. */
  const watch = new MutationObserver(() => scan());
  for (const track of tracks) watch.observe(track, { childList: true });
})();
