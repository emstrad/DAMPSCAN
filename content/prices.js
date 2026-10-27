/**
 * The one price list for ATi and DampScan (13 September 2026, with the size
 * bands the prices page has always used). Everything that shows a price
 * reads it from here: the prices pages (scripts/pricing-template.js), the
 * survey step on the website after the enquiry (lib/web-booking.js sends it
 * with the times) and the minutes on site the booking times are worked out
 * with. Change a figure here and every page changes with it.
 *
 * Damp and timber is the damp survey plus the timber assessment at its with
 * a survey price. The PDF priced it for localised and full-house only; the
 * two larger bands use the full-house timber figure and say "from".
 */
export const SIZES = [
  { key: 'localised', name: 'Localised', scope: 'One or two rooms', damp: 215, timber: 95, from: false, minutes: 60,
    info: 'One issue affecting one or two rooms, with the relevant outside checks.' },
  { key: 'full-house', name: 'Full house', scope: 'Up to three bedrooms', damp: 295, timber: 150, from: false, minutes: 120,
    info: 'An accessible standard home up to three bedrooms, inside and out. Best before a purchase.' },
  { key: 'large-property', name: 'Large property', scope: 'Four to five bedrooms', damp: 375, timber: 150, from: true, minutes: 150,
    info: 'Larger houses take longer to inspect properly. The exact fee is confirmed in writing before we come.' },
  { key: 'premium', name: 'Very large or period', scope: 'Six or more bedrooms, extended, listed or period', damp: 450, timber: 150, from: true, minutes: 180,
    info: 'Where the building itself is the complication: several build eras, cellars, extensions. Quoted before we come.' }
];

export const SERVICES = {
  damp: { name: 'Damp survey', info: 'Readings, inspection and photographs to find the cause, with a written report and recommendations within 24 hours.' },
  timber: { name: 'Damp and timber survey', info: 'The damp survey plus accessible timbers checked for decay, fungal growth and wood-boring insects, with timber moisture readings.' }
};

/* On their own, or added to a survey on the same visit (at least 40% less). */
export const EXTRAS = [
  { key: 'timber-localised', name: 'Localised timber assessment', scope: 'Accessible timbers, one or two rooms', alone: 160, withSurvey: 95, addable: false,
    info: 'Accessible timbers checked for decay, fungal growth and woodworm, with a timber report.' },
  { key: 'timber-full', name: 'Full-house timber assessment', scope: 'An accessible standard home', alone: 250, withSurvey: 150, addable: false,
    info: 'The whole accessible home checked for timber decay and woodworm, with a timber report.' },
  { key: 'invasive', name: 'Targeted invasive investigation', scope: 'One straightforward area', alone: 145, withSurvey: 85, from: true, addable: true,
    info: 'Where normal access is not enough: a small opening, agreed with you before we start.' },
  { key: 'camera', name: 'Underfloor camera check', scope: 'One area, up to two straightforward access points', alone: 145, withSurvey: 85, addable: true,
    info: 'A camera under suspended timber floors to see the joists and ventilation without lifting boards.' },
  { key: 'cavity', name: 'Low-level cavity bridging check', scope: 'One wall section up to 6 m, up to three points', alone: 160, withSurvey: 95, addable: true,
    info: 'Checks for rubble or mortar in the bottom of a cavity wall bridging damp across.' }
];

export const pounds = (n, from = false) => `${from ? 'From ' : ''}£${n}`;

/** Everything the website's survey step needs, in one plain object. */
export const priceList = () => ({ sizes: SIZES, services: SERVICES, extras: EXTRAS });
