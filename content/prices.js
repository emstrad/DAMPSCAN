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
  damp: { name: 'Damp survey', info: 'Readings, inspection and photographs to find the cause, with a written report and recommendations the next day.' },
  timber: { name: 'Damp and timber survey', info: 'The damp survey plus accessible timbers checked for decay, fungal growth and wood-boring insects, with timber moisture readings.' }
};

/* On their own, or added to a survey on the same visit (at least 40% less). */
export const EXTRAS = [
  { key: 'timber-localised', name: 'Localised timber assessment', scope: 'Accessible timbers, one or two rooms', alone: 160, withSurvey: 95, addable: false,
    info: 'Accessible timbers checked for decay, fungal growth and woodworm, with a timber report.' },
  { key: 'timber-full', name: 'Full-house timber assessment', scope: 'An accessible standard home', alone: 250, withSurvey: 150, addable: false,
    info: 'The whole accessible home checked for timber decay and woodworm, with a timber report.' },
  { key: 'invasive', name: 'Targeted invasive investigation', scope: 'One straightforward area', alone: 145, withSurvey: 85, from: true, addable: true,
    info: 'Where normal access is not enough: a small opening, agreed with you before we start.',
    when: 'Plaster or boarding hides the wall, or earlier damp work needs checking behind it. Only done if the surveyor agrees it is needed.' },
  { key: 'camera', name: 'Underfloor camera check', scope: 'One area, up to two straightforward access points', alone: 145, withSurvey: 85, addable: true,
    info: 'A camera under suspended timber floors to see the joists and ventilation without lifting boards.',
    when: 'Wooden floors downstairs that feel soft, bounce or smell musty.' },
  { key: 'cavity', name: 'Low-level cavity bridging check', scope: 'One wall section up to 6 m, up to three points', alone: 160, withSurvey: 95, addable: true,
    info: 'Checks for rubble or mortar in the bottom of a cavity wall bridging damp across.',
    when: 'Damp low down on a ground floor wall in a house with cavity walls.' },
  /* Only ever added to a survey, so no price on its own (the owner, 15 Nov 2026). Flown only
     where the rules and the site allow, so one we cannot fly on the day is not charged. */
  { key: 'drone', name: 'Drone roof check', scope: 'Roof, chimneys, flashings, valleys and gutters from the air', alone: null, withSurvey: 149, addable: true,
    info: 'Close-up photos and video of everything high up that lets water in, without ladders or scaffolding. Not charged if we cannot fly on the day.',
    when: 'Damp on an upper floor, a ceiling or a chimney breast, or you are buying and cannot see the roof.' }
];

/* Each extra on a survey adds this much time on site (the owners' choice,
   8 Nov 2026), so the diary leaves room for it. */
export const EXTRA_MINUTES = 30;

export const pounds = (n, from = false) => `${from ? 'From ' : ''}£${n}`;

/** Everything the website's survey step needs, in one plain object. */
export const priceList = () => ({ sizes: SIZES, services: SERVICES, extras: EXTRAS });
