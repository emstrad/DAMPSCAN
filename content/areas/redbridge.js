/* Redbridge. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'redbridge',
  site: 'ati',
  name: 'Redbridge',
  title: 'Damp Surveys in Redbridge | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Redbridge, IG1 to IG8, E11 and E18. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Redbridge',
  intro:
    'Redbridge is Edwardian terrace at the Ilford end and generously sized interwar semi and detached through Woodford and Wanstead, with the Roding valley running between them. It is a borough of relatively sound houses where the damp is nearly always caused by something bolted onto them later.',
  stock: [
    'The Ilford Edwardian terraces are solid brick with rear closet wings and slate roofs, and a great many have been extended at the rear and converted in the loft. Loft conversions are worth singling out here because they are so common and so frequently the cause: a conversion that fills the roof space removes the ventilation path the roof depended on, and unless replacement ventilation was designed in, condensation forms in the remaining void and appears as damp on a ceiling below.',
    'The Woodford and Wanstead stock is larger interwar and inter-generational, cavity walled with working damp proof courses and often with tile hung or rendered upper elevations. Tile hanging fails invisibly and needs close inspection. Rendered elevations that have been overcoated in modern masonry paint trap water in the same way as anywhere else.',
    'The Roding valley matters for the properties near it, where ground water and surface drainage are genuinely a factor, and for the mature tree cover across the borough, which fills gutters reliably every autumn and puts roots into old clay drainage. A displaced drain under a solid floor is a recurring finding on the older stock.',
  ],
  common: [
    'Loft conversions that removed the roof ventilation without replacing it',
    'Condensation in remaining roof voids after a conversion, showing as ceiling damp below',
    'Slipped or cracked hanging tiles on interwar and Edwardian upper elevations',
    'Rendered elevations overcoated in impermeable masonry paint',
    'Root damaged and displaced clay drains under solid ground floors',
    'Gutters and valleys blocked by heavy autumn leaf fall',
  ],
  coverage:
    'We survey across the borough, from Ilford and Seven Kings up through Wanstead and Woodford to Barkingside and Hainault.',
  places: ['Ilford', 'Wanstead', 'Woodford', 'South Woodford', 'Barkingside', 'Gants Hill', 'Seven Kings', 'Chigwell', 'Hainault'],
  districts: ['IG1', 'IG2', 'IG3', 'IG4', 'IG5', 'IG6', 'IG8', 'E11', 'E18'],
  faq: [
    {
      q: 'We had a loft conversion and now the ceiling below is damp. Why?',
      a:
        'Because the conversion probably removed the ventilation the roof depended on without replacing it. A traditional cold roof works by having air move freely through the space above the insulation, carrying moisture away. Fill that space with rooms and the remaining voids at the edges become cold, unventilated pockets where moisture condenses. It appears as damp on a ceiling and is very often diagnosed as a roof leak. The fix is ventilation, not a new roof covering.'
    },
    {
      q: 'Do you inspect the roof, or only the inside?',
      a:
        'Both, and the roof is often where the answer is. Damp appearing on an upper floor or a ceiling usually originates above it, and the causes are rarely visible from the ground: slipped hanging tiles, a lifted flashing, a blocked valley, or a loft conversion that closed off a ventilation path. We take internal readings to establish where the water is arriving and then work upward and outward to find where it is entering.'
    },
  ],
  nearby: ['waltham-forest', 'havering']
};
