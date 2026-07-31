/* Haringey. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'haringey',
  site: 'ati',
  name: 'Haringey',
  title: 'Damp Surveys in Haringey | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Haringey, N4, N8, N15, N17 and N22. Written reports for owners, leaseholders, landlords and agents.',
  h1: 'Independent damp surveys in Haringey',
  intro:
    'Haringey is largely late Victorian and Edwardian terrace, built on a slope running down from Highgate and Muswell Hill to the Lea valley. That fall matters: what happens to a house at the top of the hill is not what happens to one at the bottom, and the damp diagnoses follow the ground rather than the postcode.',
  stock: [
    'The Harringay ladder and the streets around it are tight rows of two storey terraces with rear closet wings and shared rear access. Almost all are converted into two flats. The pattern is familiar and very consistent: shared valley gutters between the closet wings, rear extension roofs at the end of their life, and stacks boxed in during bathroom refits. Water entering high in the house arrives in the lower flat, which owns none of it.',
    'On the higher ground at Muswell Hill and Crouch End the houses are larger Edwardian villas, often with tile hung or rendered upper elevations. Tile hanging fails invisibly: a few slipped or cracked tiles put water onto battens that rot, and the first sign inside is a damp patch upstairs with a respectable looking elevation outside. It needs inspecting close up rather than from the pavement.',
    'Down towards Tottenham and the Lea valley the ground is flatter and wetter, and there is a much higher proportion of post-war and estate housing. Cold bridging and ventilation are the dominant issues there, along with the usual bridged damp proof courses on the interwar stock. The borough genuinely needs three different diagnostic approaches within four miles.',
  ],
  common: [
    'Shared valley gutters and ageing extension roofs in converted Victorian terraces',
    'Slipped or cracked hanging tiles on Edwardian villas, invisible from ground level',
    'Cold bridging and mould banding in post-war and estate housing towards the valley',
    'Bathroom extracts ducted into a roof void rather than to outside air',
    'Bridged damp proof courses on interwar stock after successive path and drive works',
    'Leaks that cross between flats in a converted house, and the disputes that follow',
  ],
  coverage:
    'We survey across the borough, from Highgate and Muswell Hill down through Harringay and Wood Green to Tottenham.',
  places: ['Crouch End', 'Muswell Hill', 'Harringay', 'Wood Green', 'Tottenham', 'Hornsey', 'Finsbury Park', 'Highgate', 'Seven Sisters'],
  districts: ['N4', 'N6', 'N8', 'N10', 'N15', 'N17', 'N22'],
  faq: [
    {
      q: 'The damp is in our flat but the leak seems to be upstairs. What now?',
      a:
        'This is the most common situation in the borough\'s converted terraces, and an independent report is what moves it forward. We establish where the water is entering, what route it takes through the structure and which part of the building it passes through, with readings and photographs. That turns a dispute between two leaseholders into a documented defect with a repairing obligation attached to it, which is what a freeholder or an insurer will actually act on.'
    },
    {
      q: 'How can you tell tile hanging is the problem without stripping it?',
      a:
        'Close up inspection of the elevation, which means access equipment rather than looking up from the garden, combined with internal readings that show where the water is arriving and in what pattern. Slipped, cracked and frost damaged tiles are perfectly visible once you are at them. Where the felt and battens behind are in question, that needs a small area lifted, and the report specifies exactly where rather than recommending the whole elevation comes off.'
    },
  ],
  nearby: ['islington', 'hackney']
};
