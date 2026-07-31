/* Westminster. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'westminster',
  site: 'ati',
  name: 'Westminster',
  title: 'Damp Surveys in Westminster | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Westminster, W1, SW1, W2 and NW8. Reports for owners, leaseholders, buyers and solicitors.',
  h1: 'Independent damp surveys in Westminster',
  intro:
    'Westminster is stucco, mansion block and vault, most of it listed or in a conservation area, and almost none of it able to accept the standard damp remedy. What can be done to these buildings is tightly constrained, so the value of a survey here is in being told what will actually be permitted as well as what is wrong.',
  stock: [
    'The Georgian and Regency terraces are solid brick behind a lime stucco skin. Stucco is the weatherproofing layer, not decoration, and it needs maintaining as such. Once it cracks or hollows, water gets behind and is then held against the brick by the very render that was meant to keep it out. Repainting a blown section in a modern impermeable masonry paint, which happens on a five year cycle across the borough, seals the moisture in and accelerates the damage underneath.',
    'Almost every one of these houses has vaults running under the pavement, built as coal stores and now used as plant rooms, gyms and utility space. A vault is below the water table in places, under a public highway nobody controls, and its roof is the pavement itself. Water entering through a failed pavement light or a cracked vault roof is a recurring and expensive problem, and the responsibility for the highway above complicates every repair.',
    'The mansion blocks bring shared parapets, valley gutters, lightwells and long communal stacks. Water entering at roof level appears several floors down and often several flats along, which turns a maintenance question into a service charge dispute. Establishing the actual path of the water is usually the whole reason we are instructed.',
  ],
  common: [
    'Blown or cracked stucco holding water against brick, sealed further by impermeable masonry paint',
    'Water into pavement vaults through failed pavement lights and cracked vault roofs',
    'Mansion block leaks entering at parapet level and presenting several floors below',
    'Listed building constraints ruling out the external repair that was recommended',
    'Lower ground and vault level timber decay where a wall has been persistently wet',
    'Service charge and dilapidations disputes needing an independent view of the defect',
  ],
  coverage:
    'We survey across the City of Westminster, from Pimlico and Belgravia up through Mayfair and Marylebone to St John\'s Wood and Maida Vale.',
  places: ['Marylebone', 'Mayfair', 'Pimlico', 'Belgravia', 'Bayswater', 'Maida Vale', 'St John\'s Wood', 'Victoria', 'Soho'],
  districts: ['W1', 'W2', 'W9', 'SW1', 'NW8'],
  faq: [
    {
      q: 'Who is responsible for a damp vault under the pavement?',
      a:
        'It is one of the more tangled questions in this borough and it turns on where the water is entering. The vault itself is normally part of your demise or freehold, but its roof is the public highway and the pavement lights in it are often the local authority\'s to maintain. Our report records the entry point precisely, which is what determines who you are asking to repair it. Without that, these arguments run for years.'
    },
    {
      q: 'Our building is listed. Will you recommend work we cannot get consent for?',
      a:
        'No. A report that specifies external wall insulation or replacement windows on a listed terrace is worthless, however accurate the diagnosis. We survey knowing the constraint and concentrate on what can be delivered: lime based repairs to render and pointing, drainage and rainwater goods, internal breathable finishes, ventilation and heating. Where consent will be needed, we say so and say for what.'
    },
  ],
  nearby: ['kensington-and-chelsea', 'camden']
};
