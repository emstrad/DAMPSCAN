/* Southwark. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'southwark',
  site: 'ati',
  name: 'Southwark',
  title: 'Damp Surveys in Southwark | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Southwark, SE1, SE5, SE15, SE16, SE17 and SE22. Written, evidence-based reports with nothing to sell.',
  h1: 'Independent damp surveys in Southwark',
  intro:
    'Southwark runs from riverside warehouse conversions at Bankside through Georgian and Victorian terraces in Walworth and Camberwell to some of the largest post-war estates in Europe. The borough is also one of the most active in London for housing disrepair, and a good share of our work here is producing the evidence those cases turn on.',
  stock: [
    'The warehouse and wharf conversions along the river are heavy masonry structures never designed to be heated and occupied. Very thick brick walls that were dry because they were ventilated and unheated now have insulation and plasterboard against them, and the moisture profile of the wall has changed completely. Where the conversion detailed that well it performs; where it did not, the result is interstitial condensation behind the lining, which is invisible until the timber battens fail.',
    'The Victorian terraces in Peckham, Camberwell and Walworth are solid brick, largely converted to flats, and old enough that the first generation of conversion work is now failing. Flat roofs over rear extensions at the end of their life, boxed in stacks, and rear closet wings with shared valley gutters produce most of the water. It typically appears in a flat that owns none of the defect.',
    'The large estates fail predictably at cold bridges and at joints in system built panels, and the mould follows the structure in bands and corners. Because Southwark has a high volume of disrepair claims, the distinction between a building defect and condensation from occupation is often the entire dispute, and it is what our reports are written to establish with measurements rather than opinion.',
  ],
  common: [
    'Interstitial condensation behind insulated linings in warehouse and wharf conversions',
    'Failed flat roofs over rear extensions in converted Victorian houses',
    'Shared valley gutters between closet wings overflowing into both properties',
    'Mould banding at slabs, reveals and panel joints in post-war estate housing',
    'Housing disrepair reports that will stand up to the other side\'s scrutiny',
    'Timber decay behind linings where a wall has been wet for years without showing',
  ],
  coverage:
    'We survey across the borough, from Bankside and Bermondsey out through Camberwell and Peckham to Dulwich.',
  places: ['Bermondsey', 'Peckham', 'Camberwell', 'Walworth', 'Dulwich', 'Rotherhithe', 'Elephant and Castle', 'Nunhead', 'Bankside'],
  districts: ['SE1', 'SE5', 'SE15', 'SE16', 'SE17', 'SE21', 'SE22'],
  faq: [
    {
      q: 'What is interstitial condensation and why does it matter in a warehouse conversion?',
      a:
        'It is condensation forming inside the build up of a wall rather than on its surface, where warm moist air reaches a cold layer behind the plasterboard. It matters because there is nothing to see: the room looks fine while the battens, insulation and any embedded timber behind the lining get progressively wetter. In converted warehouses, where a thick masonry wall that used to be cold and ventilated is now lined and heated, it is a common and under diagnosed failure. Finding it means understanding the build up, not just reading the surface.'
    },
    {
      q: 'Our landlord blames condensation. Does that end the argument?',
      a:
        'No, because condensation is a symptom rather than a cause. Moisture condenses where a surface is below the dew point of the air, and a surface can be cold because of a cold bridge, a panel joint or missing insulation, all of which are defects. Ventilation that does not work is also a defect. Our report measures surface conditions, records where the mould actually is relative to the structure, and tests whether the ventilation performs, which is what distinguishes the two.'
    },
  ],
  nearby: ['lewisham', 'lambeth']
};
