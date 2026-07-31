/* Hounslow. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'hounslow',
  site: 'ati',
  name: 'Hounslow',
  title: 'Damp Surveys in Hounslow | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Hounslow, TW3 to TW8, TW13, TW14 and W4. Written reports for owners, buyers and landlords.',
  h1: 'Independent damp surveys in Hounslow',
  intro:
    'Hounslow has one thing no other borough has to the same degree: tens of thousands of homes fitted with acoustic insulation and secondary glazing under the Heathrow noise schemes. Sealing a house against aircraft noise also seals it against air movement, and where ventilation was not added at the same time the result is condensation in a building that was previously fine.',
  stock: [
    'Noise insulation packages typically brought secondary glazing, sealed units and loft insulation. Each is sensible on its own; together they remove the uncontrolled air leakage that used to ventilate the house without anyone thinking about it. If trickle vents were not fitted, or have been closed, or an extract was not upgraded, the moisture a household generates stays inside. Mould in a house that has recently had this work is a ventilation problem and should be reported as one.',
    'The Chiswick and Brentford stock at the eastern end is Victorian and Edwardian terrace, solid brick, extended and converted, with the familiar side return junctions, closet wing gutters and raised rear ground levels. Some of it is close to the river and the Grand Union, with the ground water and flood considerations that brings.',
    'The rest of the borough, through Hounslow, Feltham and Heston, is interwar and post-war cavity walled housing, and the recurring findings are the standard ones for that stock: drives and patios built up above the damp proof course, blocked airbricks, and retrofit cavity fill that has slumped or bridged on the exposed elevations.',
  ],
  common: [
    'Noise insulation and secondary glazing that sealed the house without adding ventilation',
    'Trickle vents absent or closed after a glazing upgrade',
    'Side return and rear extension junctions letting water in on Victorian terraces',
    'Ground built up above the damp proof course on interwar and post-war housing',
    'Blocked airbricks and musty suspended timber ground floors',
    'Ground water and flood considerations near the river and the Grand Union',
  ],
  coverage:
    'We survey across the borough, from Chiswick and Brentford out through Isleworth and Hounslow to Feltham and Bedfont.',
  places: ['Chiswick', 'Brentford', 'Isleworth', 'Hounslow', 'Feltham', 'Heston', 'Osterley', 'Cranford', 'Bedfont'],
  districts: ['W4', 'TW3', 'TW4', 'TW5', 'TW7', 'TW8', 'TW13', 'TW14'],
  faq: [
    {
      q: 'We had noise insulation fitted and now the house has mould. Are they connected?',
      a:
        'Very probably. Secondary glazing, sealed units and loft insulation all reduce the uncontrolled air leakage that used to ventilate the house continuously. That leakage was wasteful but it was doing a job. Remove it without providing controlled ventilation in its place and the moisture from cooking, washing and breathing accumulates, condenses on the coldest surfaces and grows mould. It is a predictable and well documented consequence, and the remedy is ventilation rather than anything applied to the walls.'
    },
    {
      q: 'What sort of ventilation actually fixes it?',
      a:
        'Something that removes moist air at the point it is generated and provides replacement air elsewhere, sized and commissioned properly. In practice that usually means humidity sensing extract fans in the kitchen and bathroom that are ducted to outside air rather than into a void, plus trickle ventilation in habitable rooms, or a whole house system where the layout suits it. What does not work is a fan that moves less air than its label claims, which is the most common finding we make.'
    },
  ],
  nearby: ['richmond-upon-thames', 'hillingdon']
};
