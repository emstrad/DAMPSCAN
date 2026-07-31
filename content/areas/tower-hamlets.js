/* Tower Hamlets. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'tower-hamlets',
  site: 'ati',
  name: 'Tower Hamlets',
  title: 'Damp Surveys in Tower Hamlets | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Tower Hamlets, E1, E2, E3 and E14. Reports for leaseholders, landlords, agents and disrepair cases.',
  h1: 'Independent damp surveys in Tower Hamlets',
  intro:
    'Tower Hamlets holds early Georgian silk weavers houses, dense Victorian terraces, an enormous quantity of post-war council housing and the newest residential towers in the country, within a couple of miles of each other. Almost nothing about diagnosing damp in one of those transfers to another.',
  stock: [
    'The Spitalfields and Whitechapel Georgian houses are among the oldest domestic buildings still in ordinary use in London. Solid brick, lime mortar, timber floors built into the walls, and often a top floor weavers loft with very large windows. They depend on breathing, and a great many have been through unsympathetic refurbishment with gypsum plaster and cement pointing. Decay in timbers built into a wall that can no longer dry is the usual finding, and it is structural.',
    'The post-war blocks and estates, which house a large share of the borough, fail at cold bridges and joints: mould in bands at slab level, at window reveals and in corners, following the structure rather than the room. In a disrepair context that distinction decides the case, so the report has to record the pattern against the building rather than simply confirm that mould exists.',
    'The Docklands towers are the newest problem and in some ways the least well understood. Highly airtight envelopes, mechanical ventilation with heat recovery, floor to ceiling glazing and single aspect layouts. When the ventilation is unbalanced, uncommissioned or switched off because it is noisy, moisture has nowhere to go and mould appears in a two year old flat. That is a building performance defect, not occupant behaviour, and it needs measuring to prove.',
  ],
  common: [
    'Timber decay in Georgian houses refurbished with gypsum plaster and cement pointing',
    'Mould banding at slabs and reveals in post-war blocks, following the structure',
    'Housing disrepair reports needing evidence that separates defect from occupation',
    'New tower flats with mechanical ventilation that was never balanced or has been disabled',
    'Leaks entering a converted building at roof or parapet level and appearing several floors down',
    'Pre purchase surveys on listed Georgian stock where invasive investigation is restricted',
  ],
  coverage:
    'We survey across the borough, from Spitalfields and Whitechapel out through Bow and Poplar to the Isle of Dogs.',
  places: ['Whitechapel', 'Spitalfields', 'Bethnal Green', 'Bow', 'Poplar', 'Canary Wharf', 'Limehouse', 'Mile End', 'Isle of Dogs'],
  districts: ['E1', 'E2', 'E3', 'E14'],
  faq: [
    {
      q: 'Our flat is two years old and has mould. How is that possible?',
      a:
        'Very easily, and it is usually a ventilation failure rather than anything to do with how you live. A modern flat is built airtight, so it depends entirely on mechanical ventilation to remove moisture. If that system was never commissioned, was set to a token rate, has crushed or disconnected ducting, or has been turned off because of noise, the moisture a household generates stays in the flat. We measure the actual air flow against what the design required, which is the evidence a developer, freeholder or warranty provider will respond to.'
    },
    {
      q: 'Is a report from you usable in a disrepair claim?',
      a:
        'Yes, and it is written on the assumption that it will be read by somebody looking for holes in it. That means calibrated readings recorded by location, the mould pattern mapped against the structure, ventilation performance measured rather than described, and the external condition that explains the entry point. We carry out no remedial work, so we have no interest in what the remedy turns out to be, which is the point of instructing us rather than a contractor.'
    },
  ],
  nearby: ['hackney', 'newham']
};
