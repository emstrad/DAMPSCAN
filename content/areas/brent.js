/* Brent. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'brent',
  site: 'ati',
  name: 'Brent',
  title: 'Damp Surveys in Brent | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Brent, NW2, NW6, NW9, NW10, HA0 and HA9. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Brent',
  intro:
    'Brent is where Victorian London stops and Metroland begins, and the two halves of the borough behave completely differently. Kilburn and Willesden are dense Victorian terrace converted into flats. Wembley, Kingsbury and Preston are interwar semis with cavity walls and working damp proof courses. The same diagnosis will not fit both.',
  stock: [
    'The Victorian half is solid brick, subdivided, and dependent on shared roofs, stacks and rear extensions that no single owner controls. The recurring finding is water entering high in the building and appearing in a flat that owns none of the defect, which turns a repair into a negotiation. Rear closet wings with shared valley gutters are the usual source.',
    'The interwar half is a different world. Cavity walls, a slate or bitumen damp proof course that generally still works, airbricks feeding a void under a suspended timber floor. Damp in one of these houses is almost never rising, and when it appears at low level the cause is normally that the drive, path or patio has been built up above the damp proof course over the decades. That is a spade and a drainage channel, not a chemical treatment.',
    'Retrofit cavity wall insulation is widespread across the Metroland stock and is a genuine cause worth checking rather than assuming. Fill that has slumped leaves the top of the wall cold, and fill that bridges the cavity carries water from the outer leaf to the inner one. The signature is damp on the most weather exposed elevation appearing after driving rain rather than continuously.',
  ],
  common: [
    'Water entering a converted Victorian house high up and appearing in the flat below',
    'Ground levels built up above the damp proof course on interwar semis',
    'Slumped or bridging retrofit cavity wall insulation on exposed elevations',
    'Blocked or buried airbricks starving the void under a suspended timber floor',
    'Second opinions where injection has been recommended on a cavity walled house',
    'Chimney breast staining after a stack was capped without ventilation',
  ],
  coverage:
    'We survey across the borough, from Kilburn and Willesden out through Wembley and Kingsbury to Harlesden and Neasden.',
  places: ['Wembley', 'Willesden', 'Kilburn', 'Harlesden', 'Kingsbury', 'Neasden', 'Queens Park', 'Cricklewood', 'Preston'],
  districts: ['NW2', 'NW6', 'NW9', 'NW10', 'HA0', 'HA9'],
  faq: [
    {
      q: 'Can a 1930s semi have rising damp?',
      a:
        'It is possible and it is uncommon, because houses of that age were built with a physical damp proof course that usually still works. Far more often in this borough the course has been bridged: the drive, path or patio has been resurfaced repeatedly over eighty years until the ground sits above it, so water crosses the barrier instead of being stopped by it. The symptoms look identical from inside. The remedies do not, and one costs a great deal more than the other.'
    },
    {
      q: 'Could our cavity wall insulation be causing the damp?',
      a:
        'It can be, and it should be checked rather than assumed either way. Retrofit fill can settle over time and leave the upper part of the wall uninsulated, or bridge the cavity so water crosses from the outer leaf to the inner one. The pattern is telling: damp on the elevation that takes the weather, appearing after driving rain and drying between, rather than constant damp at low level. We inspect for it directly and the report says what we found.'
    },
  ],
  nearby: ['harrow', 'ealing']
};
