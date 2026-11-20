/* Tottenham, Seven Sisters and Bruce Grove. Housing stock notes are the point
   of this file: the shared framing around them lives in scripts/area-template.js. */
export default {
  slug: 'tottenham',
  site: 'ati',
  name: 'Tottenham',
  metaDescription:
    'Independent damp and timber surveys in Tottenham, Seven Sisters and Bruce Grove, N15 and N17. Clear written reports for owners, tenants and landlords.',
  h1: 'Independent damp surveys in Tottenham',
  intro:
    'Tottenham sits on the flat ground of the Lea valley, with the river and the marshes along its eastern side. Most of its housing is Victorian and Edwardian terraced streets built as the railways arrived, with older buildings along the High Road, an early garden suburb estate and some large post war estates. Low, level ground and a lot of hard paving shape the damp we find here.',
  stock: [
    'The typical Tottenham house is a two storey terrace from around 1880 to 1910, often with a bay at the front, a narrow rear wing and a small yard. Over the years most yards have been concreted or paved, frequently up to or above the level of the damp proof course, and the rear wing walls take the splashback and run off from every downpour. Gullies and old clay drains on this flat ground clear slowly, so water sits against the walls longer than it would on a slope.',
    'The High Road is a conservation area with some of the oldest buildings in the area, including Georgian houses and earlier ones near Bruce Castle and Tottenham Green, many now with shops below and flats above. North of White Hart Lane, the Tower Gardens estate was among the first cottage estates built by the London County Council, in a garden suburb style with its own conservation area. Those cottages have solid walls and suspended floors, and small changes such as a raised path or blocked airbrick matter.',
    'The post war estates include Broadwater Farm, built around 1970 with concrete deck access blocks, parts of which are being rebuilt. Concrete frames and panels carry cold to the inside at floor edges, window heads and corners, and mould gathers there in a recognisable pattern. In a tenancy, the question is usually whether the mould comes from the building or from how the home is used, and that is a question for measurement.',
  ],
  common: [
    'Concreted rear yards bridging the damp proof course on Victorian terraces',
    'Slow draining gullies on flat ground leaving water against the back wall',
    'Flats above shops on the High Road damp from rear flat roofs and parapets',
    'Rot in suspended timber floors where airbricks have been covered by paths or extensions',
    'Mould at slab edges, corners and window heads in concrete estate blocks',
    'Disrepair disputes over whether mould is condensation from use or a building defect',
  ],
  coverage:
    'We survey across N15 and N17, from Seven Sisters and South Tottenham up the High Road through Bruce Grove to White Hart Lane and Northumberland Park.',
  places: ['Seven Sisters', 'Bruce Grove', 'Tottenham Hale', 'Tottenham Green', 'South Tottenham', 'West Green', 'White Hart Lane', 'Northumberland Park', 'Page Green'],
  districts: ['N15', 'N17'],
  towns: [
    { name: 'Seven Sisters and South Tottenham', text: 'Long Victorian terraced streets, many split into flats, with the parades of the High Road and Seven Sisters Road. Paved yards, rear wings and shared stacks account for most of the damp.' },
    { name: 'Bruce Grove and Tottenham Green', text: 'The oldest part of Tottenham along the High Road, with Georgian and earlier buildings in a conservation area, flats over shops and terraces behind. Old solid walls, cement repairs and rear flat roofs are the usual sources.' },
    { name: 'White Hart Lane and Northumberland Park', text: 'The Tower Gardens cottage estate, Edwardian terraces and post war estates towards the Lea. Blocked airbricks and raised paths on the cottages, cold structure and condensation in the blocks.' }
  ],
  faq: [
    {
      q: 'Our Tottenham terrace has damp along the bottom of the kitchen wall. Is it rising damp?',
      a:
        'It might be, but on these streets the more common cause is a yard paved up to or over the damp proof course, a leaking downpipe or a gully that does not clear. We check the outside levels and drainage against the readings inside before anything else. The report then says what is causing it and what is needed, so any contractor can price it.'
    },
    {
      q: 'I rent my flat and the landlord says the mould is condensation. Can you help?',
      a:
        'Yes. We measure humidity, surface temperatures and the performance of any extract fans, and record where the mould is in relation to the structure. Condensation forms on cold surfaces, and a surface can be cold because of a building defect. The report sets out which it is, with evidence either side can check.'
    },
    { q: 'Do you survey cottages on the Tower Gardens estate?', a: 'Yes. They have solid walls and timber floors, so we look closely at airbricks, path levels and any cement render or pointing that stops the walls drying.' },
    { q: 'Does being near the River Lea mean groundwater damp?', a: 'Rarely in a house above ground. Damp in a ground floor is usually from rain, drainage or ground levels, and we check those first. Cellars are different and we survey those too.' },
    { q: 'Can you survey a flat above a shop on the High Road?', a: 'Yes. We trace water from shop roofs, parapets and shared gutters and record whose part of the building it comes through.' }
  ],
  nearby: ['haringey', 'enfield']
};
