/* Waltham Forest. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'waltham-forest',
  site: 'ati',
  name: 'Waltham Forest',
  title: 'Damp Surveys in Waltham Forest | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Waltham Forest, E4, E10, E11 and E17. Written reports for owners, leaseholders and landlords.',
  h1: 'Independent damp surveys in Waltham Forest',
  intro:
    'Waltham Forest has a housing type that barely exists outside it: the Warner flat. Purpose built Victorian and Edwardian maisonette pairs, thousands of them across Walthamstow and Leyton, each half with its own front door and a shared structure. They were built as flats rather than converted into them, and they fail in ways that a converted house does not.',
  stock: [
    'A Warner pair splits a building horizontally with the upper flat holding the roof and the lower one holding the ground. The rainwater goods, the roof and often the rear addition are shared in practice even where the leases divide them on paper. When a valley or rear addition roof fails, it is the lower flat that gets the damp and the upper flat that owns the defect, and the leases are frequently unclear about which. Establishing the physical path is what settles it.',
    'The wider Victorian terraced grid through Walthamstow and Leyton is conventional solid brick, densely built, with rear closet wings and shared passageways. Ground levels in the rear yards have risen with successive resurfacing on a great many of them, bridging otherwise sound damp proof courses.',
    'Chingford, at the northern end, is a different borough in effect: interwar semis with cavity walls, gardens backing onto the forest and Lea valley, and the usual interwar failures of raised ground and blocked airbricks. Proximity to Epping Forest also means mature trees, leaf fall and gutters that block every autumn without fail.',
  ],
  common: [
    'Warner flat pairs where a shared roof or rear addition defect lands on the lower flat',
    'Leases that do not clearly allocate a shared roof, valley or rear addition',
    'Raised rear yards bridging the damp proof course on Victorian terraces',
    'Gutters and valleys blocked by leaf fall near the forest and the Lea valley',
    'Interwar semis in Chingford with ground built up above the damp proof course',
    'Timber decay in rear addition floors and roofs after years of slow overflow',
  ],
  coverage:
    'We survey across the borough, from Leyton and Leytonstone up through Walthamstow to Chingford.',
  places: ['Walthamstow', 'Leyton', 'Leytonstone', 'Chingford', 'Highams Park', 'Wood Street', 'Blackhorse Road', 'Upper Walthamstow', 'Whipps Cross'],
  districts: ['E4', 'E10', 'E11', 'E17'],
  faq: [
    {
      q: 'We are in a Warner flat and the damp is coming from above. Whose repair is it?',
      a:
        'It depends on the lease and on exactly where the water is entering, which is why the physical diagnosis has to come first. Roofs, valleys and shared rear additions are commonly the freeholder\'s or shared between the two flats, but Warner leases vary and many are ambiguous. Our report records the entry point and the route the water takes, so the conversation becomes about a documented defect and who is obliged to fix it, rather than about which neighbour is at fault.'
    },
    {
      q: 'The gutters block every autumn. Is that really enough to cause damp?',
      a:
        'Comfortably, yes. An overflowing gutter puts a continuous sheet of water down a wall in exactly the spot where it can find pointing defects, and it does so during the wettest months when the wall has least chance of drying. Near the forest and the valley it is a predictable annual event rather than bad luck. A great many damp diagnoses in this borough end in cleared gutters and repointing rather than anything applied to the inside of the wall.'
    },
  ],
  nearby: ['redbridge', 'newham']
};
