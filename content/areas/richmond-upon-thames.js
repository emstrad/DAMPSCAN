/* Richmond upon Thames. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'richmond-upon-thames',
  site: 'ati',
  name: 'Richmond upon Thames',
  title: 'Damp Surveys in Richmond upon Thames | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Richmond upon Thames, TW1, TW2, TW9 to TW11, SW13 and SW14. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Richmond upon Thames',
  intro:
    'Richmond is the only London borough on both banks of the Thames, and a great deal of its most valuable housing is Georgian, listed, and within the tidal flood plain. That combination, historic fabric plus periodic flooding, produces damp problems that need handling carefully and cannot be met with standard remedies.',
  stock: [
    'The Georgian and early Victorian riverside terraces are solid brick with lime mortar and, in many cases, basements or lower ground floors within reach of the tide. Tidal flooding at Twickenham, Strand on the Green and the Richmond riverside is a periodic event rather than a disaster, and the buildings have lived with it for two centuries. What they have not lived with well is modern reinstatement: cement render, gypsum plaster and impermeable paint applied after a flood prevent the wall from drying between events and make each one worse.',
    'Salt is the second consequence. Repeated wetting leaves hygroscopic salts in the masonry that keep meter readings high long after the wall is dry, so flood affected property here is regularly diagnosed as damp when the moisture reading is telling you about salt, not water. Interpretation matters more than measurement.',
    'Away from the river the stock is Victorian and Edwardian terrace and interwar semi through Twickenham, Whitton and Hampton, with the usual pattern of raised ground bridging damp proof courses and blocked airbricks. Conservation area coverage is extensive, so recommendations have to be capable of receiving consent.',
  ],
  common: [
    'Modern impermeable reinstatement preventing flood affected walls from drying between events',
    'Salt contamination giving high meter readings long after the masonry has dried',
    'Listed and conservation constraints ruling out standard external remedies',
    'Basements and lower ground floors within reach of the tide',
    'Ground raised above the damp proof course on the interwar stock away from the river',
    'Timber decay in ground floor structures repeatedly wetted and never properly dried',
  ],
  coverage:
    'We survey across the borough on both banks, from Barnes and Mortlake through Richmond and Twickenham to Hampton and Teddington.',
  places: ['Richmond', 'Twickenham', 'Teddington', 'Barnes', 'Mortlake', 'Kew', 'Hampton', 'East Sheen', 'Whitton'],
  districts: ['TW1', 'TW2', 'TW9', 'TW10', 'TW11', 'SW13', 'SW14'],
  faq: [
    {
      q: 'How should a period house be reinstated after a flood?',
      a:
        'Breathably, and slowly. The instinct is to seal and re plaster quickly, but cement render, gypsum plaster and impermeable paint on a lime built wall prevent it drying and guarantee the next flood is worse. Lime plasters and mineral paints let the wall release what it has taken in. Drying should be allowed to run its course before finishes go back, which takes months rather than weeks. Getting that sequence right is the difference between a house that recovers each time and one that degrades.'
    },
    {
      q: 'Is a high meter reading on a riverside house meaningful?',
      a:
        'Only with interpretation. Conductivity meters respond to salts as well as to water, and any masonry that has been repeatedly wetted by river water holds salts that draw moisture from the air. A dried out wall can read as high as a wet one. On this stretch of the river a bare reading proves very little on its own, and taking it at face value is how people are sold treatment for damp they do not have.'
    },
  ],
  nearby: ['kingston-upon-thames', 'hounslow']
};
