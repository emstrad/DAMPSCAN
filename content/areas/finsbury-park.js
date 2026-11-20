/* Finsbury Park, Stroud Green and the Harringay edge. Housing stock notes are
   the point of this file: the shared framing around them lives in
   scripts/area-template.js. */
export default {
  slug: 'finsbury-park',
  site: 'ati',
  name: 'Finsbury Park',
  metaDescription:
    'Independent damp and timber surveys in Finsbury Park, Stroud Green and the Harringay edge, N4. Written reports for buyers, owners and leaseholders.',
  h1: 'Independent damp surveys in Finsbury Park',
  intro:
    'Finsbury Park sits where three boroughs meet, and the housing changes every few streets: tall late Victorian terraces climbing the hill to Stroud Green, the tighter streets off Blackstock Road, the edge of the Harringay grid along Green Lanes, and large estates towards Manor House. Almost all of the older houses are now flats, and that is where most of the damp questions start.',
  stock: [
    'Stroud Green was built up quickly in the last decades of the nineteenth century on the slope rising towards Crouch Hill. The houses are three storeys or more with a deep rear wing, and many back gardens sit higher than the floor of the rear rooms because the streets were cut into the hill. A ground floor flat at the back of one of these houses is often below the garden on one side, and the rear wall behaves more like a retaining wall than a house wall.',
    'The terraces near the station and along Blackstock Road and Stroud Green Road include a lot of flats over shops. Flat roofs over the rear of the shop, a back yard covered over years ago and a parapet gutter shared along the parade are typical sources of water for the flat above. The shop and the flat often have different owners, which is why the cause needs pinning down in writing.',
    'Towards Manor House and Woodberry Down the stock turns to post war council blocks, some still standing and many replaced by the newer flats of the regeneration around the reservoirs. The older blocks show cold corners and mould where the structure carries heat out; the newer ones are well insulated and airtight, so when the mechanical ventilation is switched off or blocked, condensation builds quickly.',
  ],
  common: [
    'Damp on the rear wall of a ground floor flat where the garden is higher than the floor inside',
    'Water from a flat roof or parapet over a shop showing in the flat above',
    'Leaks between flats in a converted terrace, through a shared stack or a bathroom above',
    'Condensation in new airtight flats where the ventilation unit has been turned off',
    'Cold corners and mould banding in older post war blocks near Manor House',
    'Decay in suspended timber floors where an extension has blocked the old airbricks',
  ],
  coverage:
    'We survey around the park on all sides, up through Stroud Green to Crouch Hill and across to the Harringay ladder and Manor House.',
  places: ['Finsbury Park', 'Stroud Green', 'Crouch Hill', 'Harringay', 'Manor House', 'Woodberry Down', 'Blackstock Road', 'Green Lanes'],
  districts: ['N4'],
  towns: [
    { name: 'Stroud Green', text: 'Tall late Victorian terraces on the slope towards Crouch Hill, almost all converted. Raised rear gardens push water into the back of the ground floor flats, and deep rear wings bring valley gutters and old extension roofs.' },
    { name: 'Around the station and Blackstock Road', text: 'Busy parades with flats above shops, and terraces behind them. Shop roofs, covered yards and shared parade gutters are the usual sources of damp in the flats upstairs.' },
    { name: 'Harringay edge and Manor House', text: 'The terraced grid off Green Lanes, two storeys and mostly split into upper and lower flats, then post war and new blocks towards Woodberry Down. Shared gutters on the terraces, condensation in the blocks.' }
  ],
  faq: [
    {
      q: 'The back bedroom of our Stroud Green ground floor flat is damp. The garden is higher than the floor. Is that the cause?',
      a:
        'It is the first thing we check. Where ground outside is higher than the floor inside, water reaches the wall sideways, and no damp proof course was ever meant to stop that. We measure levels inside and out and take readings across the wall, so the report shows whether the damp follows the ground line. It then sets out what is needed for the wall to stay dry.'
    },
    {
      q: 'Our flat is over a shop and the ceiling is stained. Who is responsible?',
      a:
        'That depends on where the water is coming from and on the leases. We trace the route, whether it is the shop\'s roof, a parade gutter or something inside your own flat, and record it with photographs and readings. That is what the freeholder or the shop owner will need to see.'
    },
    { q: 'Our new build flat near Woodberry Down has mould. Is it a defect?', a: 'Sometimes. We check the ventilation unit, the extract rates and the surface temperatures, and record whether the mould sits where the building is cold or where the air is wet.' },
    { q: 'Do you survey for buyers in N4?', a: 'Yes, often after a mortgage survey has flagged damp. The report is written so that any contractor can price what is needed.' },
    { q: 'Can you survey a whole converted house for the freeholder?', a: 'Yes. Surveying every flat at once usually shows where the shared defects are and which damp belongs to which flat.' }
  ],
  nearby: ['islington', 'haringey']
};
