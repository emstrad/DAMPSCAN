/* Lewisham. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'lewisham',
  site: 'ati',
  name: 'Lewisham',
  title: 'Damp Surveys in Lewisham | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Lewisham, SE4, SE6, SE12, SE13 and SE23. Reports for owners, leaseholders, landlords and disrepair cases.',
  h1: 'Independent damp surveys in Lewisham',
  intro:
    'Lewisham is Victorian terraces interrupted by war damage and rebuilt in whatever the period after favoured, so a single street can run from 1880 brick to 1950s system build to 1980s infill. Each generation has a different failure mode, and the borough has a high volume of disrepair work where the distinction between a defect and condensation is the entire question.',
  stock: [
    'The Victorian terraces are solid brick with rear closet wings and slate roofs, mostly converted to flats. The closet wing is the weak point: a narrow two storey rear projection with a valley or parapet gutter alongside it, often shared with the neighbour, and frequently the last part of the building anyone maintains. A blocked shared valley overflows into both houses at once, which is also why neither owner is quick to accept it is theirs.',
    'The post-war rebuilds include a good deal of system build and large panel construction. These fail predictably at the joints and at cold bridges: mould in a band along the slab, at window reveals and in corners, in patterns that follow the structure rather than the room. Where a housing disrepair claim is running, that distinction is the case, and a report that records surface temperatures and readings against the structure is what settles it.',
    'The more recent infill and conversions bring sealed, well insulated envelopes with ventilation that was specified on paper and not commissioned in practice. An airtight flat with a trickle vent taped over and an extract that moves almost nothing will grow mould however it is heated. That is a building performance failure and should be reported as one rather than being written off as lifestyle.',
  ],
  common: [
    'Shared valley or parapet gutters between Victorian closet wings, overflowing into both houses',
    'Mould banding at slabs, reveals and corners in post-war blocks, following the structure rather than the room',
    'Housing disrepair reports that need to distinguish a building defect from occupation, with readings to back it',
    'Sealed modern flats with ventilation that was never commissioned or has been disabled',
    'Timber decay in closet wing floors and roofs after years of slow overflow',
    'Damp appearing in a converted flat from a defect in a part of the building it does not own',
  ],
  coverage:
    'We survey across the borough and the neighbouring streets, from New Cross and Deptford out to Sydenham and Grove Park.',
  places: ['Lewisham', 'Brockley', 'Catford', 'Forest Hill', 'Sydenham', 'Deptford', 'New Cross', 'Blackheath', 'Grove Park'],
  districts: ['SE4', 'SE6', 'SE8', 'SE12', 'SE13', 'SE14', 'SE23', 'SE26'],
  faq: [
    {
      q: 'We are bringing a disrepair claim. What does an independent report need to show?',
      a:
        'It needs to establish, with evidence rather than assertion, that there is a defect in the building and that the damp follows from it. That means calibrated moisture readings across the affected surfaces, the pattern of the mould recorded against the structure, the condition and performance of any ventilation, and the external condition that explains the entry point. We carry out no remedial work, so we have no interest in what the remedy turns out to be, which is the point of instructing us rather than a contractor.'
    },
    {
      q: 'Our landlord says we need to open the windows more. Is that a fair answer?',
      a:
        'Sometimes it is part of the picture, and on its own it is rarely the whole one. If a surface is cold enough, moisture will condense on it at humidity levels that occur in any occupied home, and no reasonable amount of window opening will change that. If an extract fan moves too little air, or discharges into a void, ventilation is not being provided regardless of behaviour. We measure both, and the report says which factors are actually driving it.'
    },
  ],
  nearby: ['wandsworth', 'bromley']
};
