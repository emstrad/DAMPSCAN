/**
 * The Google Ads tag, per site.
 *
 * One place rather than pasted into a head, because there are two sites and
 * about eighty pages, and a measurement tag that is on some of them and not
 * others reports numbers nobody can trust. Keyed by site so DampScan can have
 * its own without touching anything but this map, and so that ATi's tag can
 * never end up on a DampScan page.
 *
 * This is the base tag only. It records page views for the account, which is
 * what remarketing and enhanced conversions need, but it does not by itself
 * record a booking as a conversion: that needs a second call naming a
 * conversion action, gtag('event', 'conversion', { send_to: 'AW-x/label' }),
 * fired when the form succeeds. The label comes from the conversion action in
 * the Google Ads account and is not something that can be guessed here.
 *
 * Note for whoever adds that: the booking form already pushes a lead event into
 * window.dataLayer from pushLeadToCRM in public/assets/book.js, at both the
 * partial and complete stages. That is the hook, and complete is the one that
 * means a booking.
 */

/* Site key to Google Ads account, and the conversion action a booking counts
   as. A site with no entry gets no tag, and that is the whole opt in: nothing
   is added anywhere by default.

   `conversion` is the send_to from the conversion action's event snippet. It
   is deliberately not pasted into the head where Google's dialog suggests.
   That dialog offers "page load" or "click", and neither describes this form:
   it never navigates to a confirmation page, it submits in place and swaps to
   a success panel. A page load snippet in the head would count every visitor
   to every page as a booking. So the id travels to the browser as a value and
   book.js fires the event at the point a booking actually succeeds. */
const TAGS = {
  ati: {
    id: 'AW-18439115177',
    conversion: 'AW-18439115177/BEE7CIGjvPIcEKmjuthE'
  }
};

/**
 * @param {string} siteKey 'ati' or 'dampscan'
 * @returns {string} the script tags, or '' for a site with no tag configured
 */
export function adsTag(siteKey) {
  const tag = TAGS[siteKey];
  if (!tag) return '';
  /* Google's snippet, exactly as their setup screen gives it, then one line of
     ours. Kept as separate blocks so the first stays theirs and comparable
     against what the account shows. */
  return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${tag.id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${tag.id}');
</script>
<!-- Which conversion action a booking counts as. Read by public/assets/bf-live.js (damp) and book.js
     on a successful submission: see the note above on why not in the head. -->
<script>window.DS_ADS_CONVERSION = ${JSON.stringify(tag.conversion || '')};</script>`;
}

export const taggedSites = Object.keys(TAGS);
