/* Condensation and Mould, dampscan. Written from this site's position, not shared with the other.
   See scripts/service-template.js for why the pair are two documents. */
export default {
  slug: 'condensation-and-mould',
  site: 'dampscan',
  name: 'Condensation and Mould',
  title: 'Condensation & Mould Surveys | DampScan',
  metaDescription:
    'Condensation and mould diagnosed properly across Kent and the South East. Cold surfaces and failed ventilation are building faults, not lifestyle.',
  h1: 'Condensation and mould: a building problem, not a lifestyle one',
  intro:
    'Every household puts several litres of water into the air each day, and every building is expected to deal with it. When mould appears, the useful question is which part of that arrangement has failed: a surface that is too cold, ventilation that moves too little air, or heating that never gets the fabric above the temperature at which moisture condenses on it.',
  signsHeading: 'What tells you it is condensation rather than ingress',
  signs: [
    'Black spot mould on cold surfaces: external corners, window reveals, behind furniture on outside walls',
    'Worse in winter and in the rooms that are heated least',
    'Streaming windows in the morning, particularly in bedrooms',
    'Mould in cupboards and wardrobes against an external wall, where air does not circulate',
    'Musty smell without any staining that has a defined edge or a direction',
  ],
  sections: [
    {
      h2: 'Cold surfaces, and why they are usually a defect',
      paras: [
        'Moisture condenses where a surface is below the dew point of the air in the room. A surface can be cold for reasons that have nothing to do with how a house is used: a cold bridge at a concrete slab or a window reveal, a lintel with no insulation over it, an uninsulated section of wall behind a chimney breast, or cavity insulation that has slumped and left the top of the wall bare.',
        'The tell is geometry. Mould that runs in a neat band along a slab, a reveal or a lintel is following the structure and is telling you about the building. Mould distributed evenly around a room, or concentrated where air cannot circulate, is telling you about ventilation and heating instead. Both are worth measuring rather than guessing at.',
      ]
    },
    {
      h2: 'Ventilation that does not ventilate',
      paras: [
        'The most common finding we make is an extract fan that moves far less air than its label claims, or that discharges into a roof void rather than to outside. A fan ducted into a loft moves the moisture out of the bathroom and into the roof, where it condenses on the underside of the felt and drips back onto the ceiling below. It is then diagnosed as a roof leak.',
        'The second most common is replacement windows fitted without trickle vents, or with the vents closed. Original windows leaked air continuously and ventilated the house whether anybody intended it or not. Removing that without providing controlled ventilation in its place is one of the most reliable ways to turn a dry house into a damp one, and it happens across the South East every year.',
      ]
    },
    {
      h2: 'What actually fixes it',
      paras: [
        'Ventilation sized and commissioned properly, which means humidity sensing extract in the kitchen and bathroom ducted to outside air, trickle ventilation in habitable rooms, and in some houses a whole house system such as positive input ventilation where the layout suits it. What does not work is a fan that is quiet because it is not moving anything.',
        'Then the cold surfaces, treated where they are: insulating a lintel or a reveal, dealing with slumped cavity fill, or improving the thermal performance of a specific cold spot rather than the whole envelope. And heating that runs steadily enough to keep fabric temperatures up rather than in short bursts, because a cold wall reheated once a day will collect moisture every night in between.',
        'DampScan carries out ventilation installation and the associated works where that is what the survey found, under an insured workmanship guarantee. Where the answer is simply a fan that needs reducting to outside, we will tell you that too.',
      ]
    },
  ],
  ctaHeading: 'Get the mould diagnosed rather than wiped off',
  ctaBody:
    'Surface temperature and humidity readings, measured ventilation performance, and a written report within 24 hours of the visit setting out what is actually driving it.',
  faq: [
    {
      q: 'We have been told to open the windows more. Is that the answer?',
      a:
        'It is part of the picture and it is rarely all of it. If a surface is cold enough, moisture will condense on it at humidity levels that occur in any normally occupied home, and no reasonable amount of window opening changes that. If an extract fan moves a fraction of the air it should, ventilation is not being provided regardless of behaviour. Both are measurable, and the measurements are what separate a genuine ventilation shortfall from advice to live differently.'
    },
    {
      q: 'Is mould a health risk?',
      a:
        'It can be, particularly for people with asthma or other respiratory conditions, and for the very young and the elderly. That is why it is worth treating as a building fault to be fixed rather than a cosmetic problem to be wiped down. Cleaning the surface removes what is visible and does nothing about the conditions that grew it, which is why it comes back in the same place each winter.'
    },
    {
      q: 'Will positive input ventilation solve it?',
      a:
        'Sometimes, and it is not a universal answer. It works by gently introducing filtered air from the loft to dilute and displace moist air, which suits a house with a reasonably open layout and a loft to mount it in. It suits a flat, a house with a converted loft, or a property with severe cold bridging much less well. The system has to match the building, which is why we survey before recommending one rather than recommending one by default.'
    },
  ],
  related: ['ventilation', 'penetrating-damp', 'damp-surveys']
};
