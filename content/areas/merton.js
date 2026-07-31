/* Merton. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'merton',
  site: 'ati',
  name: 'Merton',
  title: 'Damp Surveys in Merton | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Merton, SW19, SW20, CR4 and SM4. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Merton',
  intro:
    'Merton splits neatly in two along the Northern line. Wimbledon and its surrounds are Victorian and Edwardian; Morden and much of Mitcham were built in the decade after the tube arrived in 1926. The Wandle runs between them through what was industrial ground, and it affects the properties along it.',
  stock: [
    'The Wimbledon stock is solid brick Victorian and Edwardian terrace and villa, much of it extended at the rear and converted in the loft. As across south west London, the productive defect is the junction between the original house and a later side return or rear extension: shallow flashings, low upstands and ponding outlets on flat roofs, showing up internally on a first floor wall well away from the entry point.',
    'Morden and the interwar estates are cavity walled with functioning damp proof courses and airbricks under suspended timber floors. Damp there is almost invariably bridging: ground raised by successive drives and patios above the course, or blocked underfloor ventilation. Neither justifies the chemical injection that is regularly proposed for them.',
    'Along the Wandle valley the ground is lower, historically industrial, and drainage is older. Made ground from former industrial use behaves unpredictably, and the original clay drainage under these streets is at the end of its life. A displaced drain under a solid floor gives persistent localised damp that no wall treatment will touch.',
  ],
  common: [
    'Flashings and upstands where a side return or rear extension meets original brickwork',
    'Ground raised above the damp proof course on interwar Morden and Mitcham stock',
    'Blocked airbricks and musty suspended timber ground floors',
    'Displaced and root damaged clay drains under solid floors along the valley',
    'Loft conversions that removed the roof ventilation path without replacing it',
    'Second opinions on injection quotes for cavity walled interwar houses',
  ],
  coverage:
    'We survey across the borough, from Wimbledon and Raynes Park through Mitcham to Morden and Colliers Wood.',
  places: ['Wimbledon', 'Raynes Park', 'Morden', 'Mitcham', 'Colliers Wood', 'Wimbledon Park', 'South Wimbledon', 'Motspur Park', 'Pollards Hill'],
  districts: ['SW19', 'SW20', 'CR4', 'SM4'],
  faq: [
    {
      q: 'Why does damp show up on a wall nowhere near the leak?',
      a:
        'Because water travels through a building along whatever path is available, and it only becomes visible when it reaches a surface it can wet. Entering at a roof junction, it may run along a joist, down a cavity or across a lintel before appearing on a wall a floor below and several feet sideways. That is why a survey that only examines the stained wall can tell you the wall is wet but not why. The diagnosis works backwards from the stain to the entry point.'
    },
    {
      q: 'Is a persistent damp patch on a solid floor always a rising problem?',
      a:
        'No, and on this borough\'s older streets it is frequently a drain. Clay drainage laid a century ago cracks and displaces, particularly where there are mature trees or made ground, and a leak beneath a solid floor produces a localised damp patch that stays put and responds to nothing done to the walls. It is worth lifting the covers and checking the runs before anyone specifies a floor treatment over a live leak.'
    },
  ],
  nearby: ['sutton', 'wandsworth']
};
