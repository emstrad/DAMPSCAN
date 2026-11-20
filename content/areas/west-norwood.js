/* West Norwood, Tulse Hill and Gipsy Hill. Housing stock notes are the point of
   this file: the shared framing around them lives in scripts/area-template.js. */
export default {
  slug: 'west-norwood',
  site: 'ati',
  name: 'West Norwood',
  metaDescription:
    'Independent damp and timber surveys in West Norwood, Tulse Hill and Gipsy Hill, SE27. Hillside houses, conversions and estates, clearly reported.',
  h1: 'Independent damp surveys in West Norwood',
  intro:
    'West Norwood sits in a valley between steep hills: Tulse Hill and Knights Hill on one side, the Norwood ridge rising to Gipsy Hill and Crystal Palace on the other. The houses climb those slopes, from Victorian villas and terraces to interwar semis and post war estates. Almost every damp problem here starts with the same question: which way does the ground fall, and where does the water go?',
  stock: [
    'Much of the Victorian housing was built as the railway arrived, on streets that run straight up and down the hills. On a slope, one end of a terrace has its floor at garden level and the other is partly dug in, so the same house type can be dry at one end of the street and damp at the other. Rear walls retaining a garden, front walls below a pavement and party walls with next door a step higher all bring water in from the side.',
    'The valley floor follows the line of the River Effra, which rises on the Norwood hills and now runs in culverts and sewers under the streets. The ground is London clay, which holds water at the surface after heavy rain and moves with the seasons. On the lower streets water from the hills collects at the backs of houses, and clay movement opens cracks in older brickwork that then let rain in.',
    'Larger Victorian and Edwardian houses along the main roads and on the upper slopes are mostly divided into flats, with all the usual shared roof, gutter and stack problems of a conversion. There are also council estates, interwar and post war, on Tulse Hill and around Knights Hill, where cold walls and windows and poor extract give mould in bedrooms and kitchens.',
  ],
  common: [
    'Water coming in sideways through rear walls that hold back a sloping garden',
    'Damp at the uphill end of a terrace where the floor is below the ground outside',
    'Surface water from the hills gathering against houses on the valley floor',
    'Clay movement cracks letting rain into exposed brickwork and render',
    'Leaks between flats through shared roofs, gutters and stacks in big converted houses',
    'Condensation and mould on cold walls in estate flats with weak extraction',
  ],
  coverage:
    'We survey across SE27, from Tulse Hill and Knights Hill through West Norwood to the slopes of Gipsy Hill and the Norwood ridge.',
  places: ['West Norwood', 'Tulse Hill', 'Gipsy Hill', 'Knights Hill', 'Upper Norwood', 'West Dulwich', 'Crown Point', 'Streatham'],
  districts: ['SE27'],
  towns: [
    { name: 'West Norwood', text: 'Victorian terraces and villas around Norwood Road and the cemetery, many converted, on the valley floor. Water collecting at rear walls and clay movement cracks are typical.' },
    { name: 'Tulse Hill', text: 'Steep streets of Victorian and Edwardian houses and council estates on the hill. Retained gardens and dug in floors give side water, and the estates see condensation and cold walls.' },
    { name: 'Gipsy Hill and the Norwood ridge', text: 'Large Victorian houses and later flats on the steep slopes towards Crystal Palace. Basements and lower ground rooms cut into the hill, and big exposed roofs and walls catching the weather.' }
  ],
  faq: [
    {
      q: 'Our lower ground floor on Gipsy Hill is damp along the back wall. What causes that?',
      a:
        'On a steep slope the back wall is usually holding up the garden, so water reaches it from the side after rain. A damp proof course cannot stop that. We measure the levels inside and out and take readings across the wall, so the report shows the pattern and sets out what is needed for the room to be used as it is.'
    },
    {
      q: 'Is the old River Effra the reason our West Norwood house is damp?',
      a:
        'Unlikely on its own. The river now runs in culverts and sewers, and damp in a house above ground is almost always from rain, surface water, drainage or the ground outside the wall. We check those first, and the report says plainly what we found.'
    },
    { q: 'One end of our terrace is damp and the other is not. Why?', a: 'On a slope the floor at one end is often below the ground outside. We record the levels so the report shows where the wall is bridged and why.' },
    { q: 'Do you survey converted flats in SE27?', a: 'Yes. Damp in one flat often comes from a shared roof, gutter or stack, and we trace it back to the part of the building it comes through.' },
    { q: 'Can you survey for a purchase in West Norwood?', a: 'Yes. Buyers often call us after a mortgage survey flags damp. The report explains the cause and what is needed, so any contractor can price it before exchange.' }
  ],
  nearby: ['lambeth', 'croydon']
};
