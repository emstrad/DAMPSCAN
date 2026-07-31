/* Greenwich. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'greenwich',
  site: 'ati',
  name: 'Greenwich',
  title: 'Damp Surveys in Greenwich | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Greenwich, SE3, SE7, SE9, SE10 and SE18. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Greenwich',
  intro:
    'Greenwich runs from a Georgian world heritage site at the river to Thamesmead on the marshes, and takes in Victorian Charlton and post-war Woolwich on the way. The ground changes as much as the buildings: chalk and gravel on the higher land at Blackheath, alluvial marsh at the eastern end.',
  stock: [
    'The Georgian and early Victorian houses around Greenwich town and the park are solid brick, often listed, with lower ground floors and vaults. The constraints are the same as central London: lime based repairs, breathable finishes, and no realistic prospect of consent for visible external alteration. What is different is the exposure to the river and the amount of below ground space in daily use.',
    'Thamesmead and the eastern marshland is a genuinely distinct problem. It is reclaimed low lying ground, and the estate housing built on it is largely concrete, much of it system built, with services and walkways at raised level. Cold bridging in concrete structures produces mould that traces the slabs and joints, and the water table beneath is high enough that ground floor and below ground spaces need looking at on their own terms.',
    'Between the two, Charlton and Eltham are conventional Victorian terrace and interwar semi, and they fail conventionally: bridged damp proof courses from raised ground, blocked airbricks, failed rear extension roofs and shared closet wing gutters. Woolwich adds a large amount of post-war and recent regeneration housing with the ventilation issues that come with airtight construction.',
  ],
  common: [
    'Listed Georgian stock needing lime based repairs and consentable recommendations',
    'Cold bridging in concrete and system built estate housing on the eastern marshland',
    'High water table affecting ground floors and below ground space near the river',
    'Bridged damp proof courses and blocked airbricks on interwar stock at Eltham and Charlton',
    'Airtight regeneration housing with uncommissioned or disabled ventilation',
    'Failed rear extension roofs and shared closet wing gutters in converted terraces',
  ],
  coverage:
    'We survey across the borough, from Greenwich and Blackheath out through Charlton and Woolwich to Eltham and Thamesmead.',
  places: ['Greenwich', 'Blackheath', 'Charlton', 'Woolwich', 'Eltham', 'Thamesmead', 'Plumstead', 'Kidbrooke', 'Abbey Wood'],
  districts: ['SE3', 'SE7', 'SE9', 'SE10', 'SE18', 'SE28'],
  faq: [
    {
      q: 'Our flat is in a concrete block and the mould follows straight lines. Why?',
      a:
        'Because it is following the structure rather than the room, which is the signature of cold bridging. Where a concrete slab or a panel joint passes through the insulation line, that strip of wall or ceiling is measurably colder than the surface either side of it, so moisture condenses there first and mould grows in a band. It is a building defect, not a consequence of how the flat is used, and the geometry of the mould is the evidence for that.'
    },
    {
      q: 'Does being close to the river make damp more likely?',
      a:
        'It changes what to look for rather than simply making it worse. Near the river the ground is lower, the water table is higher and below ground spaces are more exposed to it, so ground water genuinely is a factor for basements and solid floors in a way it is not on the higher ground at Blackheath. Above ground, exposure to wind driven rain off the water matters more than the water itself. Both are things we survey for rather than assume.'
    },
  ],
  nearby: ['bexley', 'lewisham']
};
