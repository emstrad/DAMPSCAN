/* Highbury and Canonbury. Housing stock notes are the point of this file: the
   shared framing around them lives in scripts/area-template.js. */
export default {
  slug: 'highbury',
  site: 'ati',
  name: 'Highbury',
  metaDescription:
    'Independent damp and timber surveys in Highbury and Canonbury, N5. Big Victorian villas, Georgian squares and conversions, surveyed with nothing to sell.',
  h1: 'Independent damp surveys in Highbury',
  intro:
    'Highbury and Canonbury are quieter and leafier than the streets around Upper Street, and the houses are bigger: tall Victorian villas around Highbury Fields and Highbury New Park, Georgian squares in Canonbury, and a lot of three and four storey houses now split into flats. Big houses mean long roofs, deep basements and plenty of places for water to get in without anyone noticing for years.',
  stock: [
    'The mid Victorian villas off Highbury New Park, Highbury Hill and the streets near the Fields were built for one family and servants, with a semi basement under a raised ground floor reached by front steps. The steps, the bridge over the front area and the area walls themselves are where much of the damp starts: the stone or brick steps hold water against the house, the area gully silts up, and the vaults under the pavement or garden path stay wet all winter.',
    'Canonbury is older and more uniform: late Georgian and Regency terraces and squares in stock brick and stucco, with butterfly roofs hidden behind parapets and a central gutter running front to back through the roof space. That single gutter, and the outlet through the front parapet, is the weak point of the whole house. When it blocks, the water goes into the top floor ceiling or down inside the party wall, and the flat that finds it is often two floors below.',
    'The ground here is London clay, which shrinks in a dry summer and swells again in winter, and Highbury has a lot of large plane and lime trees. Old cracks reopen, render and pointing move, and a joint that was weathertight last year lets rain through the next. The conversions add their own pattern: bathrooms stacked in what were bedrooms, new soil pipes boxed into old walls, and extract fans run into floor voids because the facade could not be touched.',
  ],
  common: [
    'Wet vaults and front area walls under the steps of a raised ground floor villa',
    'A blocked central valley gutter behind a Georgian parapet showing as a stain floors below',
    'Damp in a semi basement flat where the front area gully or soakaway has silted up',
    'Cracks reopened by clay movement near big street and garden trees, letting rain into the wall',
    'Condensation and mould in converted flats with extract fans ducted into floor voids',
    'Rot in timber lintels and window boxes behind stucco that has cracked and held water',
  ],
  coverage:
    'We survey across Highbury and Canonbury, from Highbury Corner and the Fields up to Highbury Barn and across to Newington Green.',
  places: ['Highbury Fields', 'Highbury Corner', 'Highbury Barn', 'Highbury New Park', 'Canonbury', 'Drayton Park', 'Newington Green', 'Mildmay'],
  districts: ['N5', 'N1'],
  towns: [
    { name: 'Highbury Fields and Highbury Hill', text: 'Tall Victorian terraces and villas facing the open ground, most divided into flats. Front steps, areas and vaults feed damp into the semi basements, and the long rear walls catch the weather above lower extension roofs.' },
    { name: 'Canonbury', text: 'Georgian and Regency squares and terraces in conservation areas, with parapets, butterfly roofs and stucco. Central valley gutters and cracked stucco account for most of the water we find, often well away from where it shows.' },
    { name: 'Highbury New Park and Mildmay', text: 'Large detached and semi detached Victorian villas, many now flats, and later terraces towards Newington Green. Big roofs, bays and old cast iron rainwater goods are the usual sources, with clay movement opening cracks near mature trees.' }
  ],
  faq: [
    {
      q: 'Our semi basement flat in Highbury is damp under the front window. Is that rising damp?',
      a:
        'Usually not. The wall under the front window of a raised ground floor house sits against the front area and often behind the vaults under the steps. If the area gully is blocked, the paving falls towards the house or the vaults are wet, the wall takes water in from the side. We check those first, with readings at different heights and depths, so the report says which it is and why.'
    },
    {
      q: 'Water came through our top floor ceiling in Canonbury after heavy rain. Where from?',
      a:
        'In a Georgian house with a butterfly roof, the first suspect is the central valley gutter and its outlet through the parapet. Leaves, a failed lining or a blocked hopper send the water straight into the roof space. We trace the route and record it, so the freeholder or roofer knows exactly where to look.'
    },
    { q: 'Does the conservation area change what you recommend?', a: 'It changes what can be done to the front of the house, not the diagnosis. We write the report knowing that external changes may need consent, and say where that is likely.' },
    { q: 'Can clay movement cause damp?', a: 'Indirectly. Movement opens cracks in brickwork, render and pointing, and rain then gets in through them. The report notes cracking we see and whether it lines up with the damp.' },
    { q: 'Do you survey flats in the former Highbury stadium development and other newer blocks?', a: 'Yes. Newer blocks bring different faults, usually condensation, balcony and window details or plumbing leaks, and we survey for those in the same way.' },
    { q: 'We are buying a Highbury conversion. Can the report help before exchange?', a: 'Yes. We often survey for buyers whose mortgage survey mentioned damp. The report sets out the cause and what is needed, so any contractor can price it before you commit.' }
  ],
  nearby: ['islington', 'hackney']
};
