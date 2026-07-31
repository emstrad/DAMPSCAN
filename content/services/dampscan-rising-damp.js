/* Rising Damp, dampscan. Written from this site's position, not shared with the other.
   See scripts/service-template.js for why the pair are two documents. */
export default {
  slug: 'rising-damp',
  site: 'dampscan',
  name: 'Rising Damp',
  title: 'Rising Damp Surveys & Treatment | DampScan',
  metaDescription:
    'Rising damp diagnosed before it is treated, across Kent and the South East. Most walls sent to us for a damp proof course do not need one.',
  h1: 'Rising damp: diagnosed first, treated only if that is what it is',
  intro:
    'Rising damp is real, and it is diagnosed far more often than it occurs. Groundwater drawn up through porous masonry produces a distinctive set of signs, and at least four other faults produce signs that look identical. We survey before we quote, and a good share of the walls sent to us for a damp proof course turn out not to need one.',
  signsHeading: 'What rising damp actually looks like',
  signs: [
    'A tide mark of staining that stops at a consistent height, usually up to about a metre above floor level',
    'Salt blooms, a white crystalline deposit, on the plaster surface at and just below that line',
    'Skirtings, wallpaper or paint lifting away from the wall at low level',
    'Damp that is present all year and does not respond to individual rain events',
    'Decay in timbers built into the wall at or below the affected height',
  ],
  sections: [
    {
      h2: 'The four things that look the same',
      paras: [
        'A bridged damp proof course is the most common. The house has a perfectly good physical course, and eighty years of drives, paths and patios have raised the external ground above it, so water crosses the barrier rather than being stopped by it. Same tide mark, same salts, same meter readings. The remedy is a spade and a drainage channel.',
        'A cement render or gypsum plaster on a solid wall is the second. Those walls were built to take in moisture and release it again. Sealed with an impermeable finish, they take it in and hold it, and it appears at the lowest, coldest part of the room. Injecting the wall does nothing about the finish that is trapping it.',
        'A defective drain or a leaking service is the third, and it produces damp that is localised and persistent and stays put through dry weather. The fourth is lateral water, where ground behind a retaining or below ground wall is pushing moisture through sideways. Neither is coming from below, so neither responds to a damp proof course.',
      ]
    },
    {
      h2: 'How we tell them apart',
      paras: [
        'Calibrated moisture readings taken on a grid rather than at the spots that look worst, so the shape of the moisture is recorded rather than its peak. Rising damp has a profile: it decreases with height and it stops. A leak does not behave that way and neither does condensation.',
        'A full external inspection, which is where most answers are. Ground levels against every elevation, drainage and gully condition, rainwater goods, pointing and render, and the presence and height of any existing damp proof course. This is the part that a survey confined to the inside of the wall cannot do.',
        'Salt analysis where it matters, because a conductivity meter responds to salt as well as to water and a salt contaminated wall reads high long after it has dried. On flood affected and coastal property that distinction decides whether there is anything to treat at all.',
      ]
    },
    {
      h2: 'What treatment involves, when it is needed',
      paras: [
        'A genuine rising damp problem in a solid wall with no working course is normally treated with a chemical damp proof course injected at the correct height, followed by replastering in a suitable salt resistant system. The replastering matters as much as the injection: salts already in the wall will come through an ordinary finish and the work will look like it has failed.',
        'DampScan carries out that work where it is what the survey found, and it is covered by an insured workmanship guarantee, with documentation you can pass to a buyer or an insurer. The term depends on the treatment and it is stated on the quote before anything is agreed. Where the survey finds something else, we say so, and a report that concludes no damp proofing is required is a perfectly normal outcome here.',
      ]
    },
  ],
  ctaHeading: 'Get it diagnosed before you pay to treat it',
  ctaBody:
    'A survey with calibrated readings, a full external inspection and a written report within 24 hours of the visit. If your wall does not need a damp proof course, the report will say so.',
  faq: [
    {
      q: 'Does rising damp exist?',
      a:
        'Yes. It requires a wall in contact with damp ground and either no damp proof course or one that has genuinely failed, and in those conditions groundwater does rise through porous masonry by capillary action. The argument is not about whether it exists but about how often it is the right answer. In our experience across Kent and the South East it is a minority of the walls we are asked to look at, because the majority have a working course that has been bridged, sealed or bypassed.'
    },
    {
      q: 'How high does rising damp go?',
      a:
        'Rarely more than about a metre, and it stops at a consistent height determined by the balance between capillary rise and evaporation from the wall surface. Damp above that height, or damp with no clear upper limit, is telling you it came from somewhere other than the ground. It is one of the simplest and most useful checks available and it takes a tape measure.'
    },
    {
      q: 'Will an injected course work through a solid stone wall?',
      a:
        'Often poorly. Injection relies on the chemical dispersing through a reasonably uniform, porous material. A rubble filled wall of ragstone, flint or chalk block has a variable core and irregular joints, so the injected barrier is rarely continuous. On walls like that the durable answers are usually external: ground levels, drainage, and permeable lime pointing and plaster that let the wall release what it takes up.'
    },
  ],
  related: ['penetrating-damp', 'condensation-and-mould', 'damp-surveys']
};
