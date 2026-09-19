/* Bromley. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'bromley',
  site: 'ati',
  name: 'Bromley',
  title: 'Damp Surveys Bromley, Orpington & Beckenham | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Bromley, Orpington, Beckenham and Chislehurst, BR1 to BR7. Evidence-based written reports with no remedial work to sell.',
  h1: 'Independent damp surveys in Bromley, Orpington and Beckenham',
  intro:
    'Bromley has larger houses on larger plots than most of London, which changes what goes wrong. Long roof runs, more rainwater goods, mature trees close to the building, and gardens that have been landscaped several times over. Very little of the damp we survey here starts at the wall it appears on.',
  stock: [
    'The dominant stock is interwar and post-war detached and semi detached housing, cavity walled with a working damp proof course. That means the diagnosis nearly always turns on something external. A bay roof with a shallow fall, a hopper head that overflows in heavy rain, a shared valley gutter between two roof planes, or a chimney flashing that has lifted. Any of these puts water into the wall a long way from where the stain appears inside.',
    'Landscaping is the other half of the picture. These plots have been re landscaped repeatedly, and each time the ground tends to go up. Raised beds against the house, block paving laid over an existing drive rather than instead of it, and decking built off the wall all bridge the damp proof course. On a sloping plot, the uphill elevation collects everything the garden sheds, and the effect is seasonal rather than constant, which is a useful diagnostic in itself.',
    'The subsoil across much of the borough is chalk with clay above it, and mature trees are common. That combination matters for timber and for movement rather than for damp directly, but it means we look at drainage runs carefully. A drain displaced by root growth under a solid floor produces a persistent damp patch that responds to nothing done to the wall, and it is easy to spend a lot of money before anyone lifts the manhole cover.',
  ],
  common: [
    'A damp patch on a bedroom wall traced to a lifted chimney flashing or an overflowing hopper head',
    'Raised patios, block paving and decking bridging the damp proof course on a house that never needed treating',
    'Seasonal damp on the uphill elevation of a sloping plot where garden drainage runs at the house',
    'Bay roofs with too shallow a fall, ponding and letting water in at the junction with the main wall',
    'Displaced or root damaged drains under solid ground floors producing persistent localised damp',
    'Timber decay in roof voids and bay roofs where a slow leak has run for years without showing inside',
  ],
  towns: [
    {
      name: 'Orpington',
      text: 'Orpington is largely 1930s ribbon development and the estates that filled in behind it, on chalk, with a bay fronted semi as the standard house. The damp we see here mostly begins at the back: kitchen and bathroom extensions built across the original airbricks, so a suspended floor that was ventilated for sixty years suddenly is not, and a patio laid up to the rear wall a course or two higher than the drive at the front. The front elevation reads dry, the back reads wet, and the house has not changed. Its surroundings have.'
    },
    {
      name: 'Beckenham',
      text: 'Beckenham has the larger late Victorian and Edwardian houses, a good share of them divided into flats, and that division is the recurring problem. A leaking valley gutter or a failed hopper on a converted house wets a flat two floors down, and the first question is who is responsible for the roof rather than what is wrong with it. Solid walls that have been cement rendered in the last fifty years are the other constant, and the low ground along the Beck towards Kelsey Park sits wetter than the ridge above it.'
    },
    {
      name: 'Chislehurst',
      text: 'Chislehurst is Edwardian and interwar houses on large, heavily wooded plots along the ridge. The trees are the point. A north elevation under a mature canopy never dries between showers, moss builds on the tiles and gutters block with leaf litter every autumn, and the damp that results is penetrating rather than rising, however low on the wall it shows. Where the garden falls towards the house, gullies fill with leaves and surface water reaches the wall before it reaches the drain.'
    },
  ],
  coverage:
    'We survey across the borough and out to the Kent boundary.',
  places: ['Bromley', 'Beckenham', 'Orpington', 'Chislehurst', 'Petts Wood', 'West Wickham', 'Hayes', 'Shortlands', 'Biggin Hill'],
  districts: ['BR1', 'BR2', 'BR3', 'BR4', 'BR5', 'BR6', 'BR7'],
  faq: [
    {
      q: 'The damp only appears in winter. What does that tell you?',
      a:
        'Quite a lot. Damp that is genuinely seasonal usually points at something driven by weather or ground water rather than at a constant defect: driving rain on an exposed elevation, garden drainage running at the house on a sloping plot, or a gutter that only overflows above a certain rainfall. Constant damp, unchanged through the year, points somewhere else entirely, typically a plumbing leak or a drain. The pattern over time is evidence, so it is worth telling us when you first noticed it and what the weather was doing.'
    },
    {
      q: 'Do you need to come inside, or can it be diagnosed from outside?',
      a:
        'Both, and the outside is usually where the answer is. We take calibrated readings internally to establish where the moisture is and how much of it there is, then work outside to find where it is entering: ground levels, drainage, rainwater goods, roof junctions, flashings and pointing. A survey that only looks at the inside face of the wall can tell you a wall is wet. It cannot tell you why, and why is the part you are paying for.'
    },
  ],
  nearby: ['croydon', 'lewisham']
};
