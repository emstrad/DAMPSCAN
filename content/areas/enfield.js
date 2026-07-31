/* Enfield. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'enfield',
  site: 'ati',
  name: 'Enfield',
  title: 'Damp Surveys in Enfield | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Enfield, EN1, EN2, EN3, N9, N13, N14, N18 and N21. Reports for owners, landlords and buyers.',
  h1: 'Independent damp surveys in Enfield',
  intro:
    'Enfield falls from the high ground at Enfield Chase down to the Lea valley in the east, and the water table falls with it. A house at the top and a house at the bottom have different problems, and the eastern side of the borough sits on ground that was market garden and flood plain within living memory.',
  stock: [
    'The eastern edge, through Edmonton and Ponders End, is low lying with a high water table and a lot of post-war and estate housing. Solid floors here are more likely to be affected by ground water than anywhere else in north London, and cellars where they exist are frequently wet as a matter of geology rather than defect. Distinguishing groundwater from a defect matters, because one is managed and the other is repaired.',
    'The Edwardian terraces through Palmers Green and Winchmore Hill are solid brick with rear closet wings, largely converted to flats. The pattern is the borough\'s most common: shared valley gutters, rear extension roofs at the end of their life, and bathroom extracts ducted into roof voids during refits. Water enters high and appears low, in a flat that owns none of the defect.',
    'The interwar and post-war stock that fills most of the rest is cavity walled with a working damp proof course, and it fails the way that stock fails everywhere: bridged courses from raised drives, blocked airbricks and sealed up ventilation after window replacement. The New River threading through the borough is a further reason to look carefully at ground and surface water where properties back onto it.',
  ],
  common: [
    'Ground water affecting solid floors and cellars on the low lying eastern side',
    'Shared valley gutters and ageing extension roofs in converted Edwardian terraces',
    'Bridged damp proof courses on interwar semis after successive drives and paths',
    'Ventilation sealed up during window replacement, with condensation following',
    'Blocked airbricks and musty suspended ground floors',
    'Surface and ground water where properties back onto the New River or the valley floor',
  ],
  coverage:
    'We survey across the borough, from Enfield Town and Winchmore Hill down through Palmers Green to Edmonton and Ponders End.',
  places: ['Enfield Town', 'Palmers Green', 'Winchmore Hill', 'Edmonton', 'Southgate', 'Ponders End', 'Cockfosters', 'Oakwood', 'Bush Hill Park'],
  districts: ['EN1', 'EN2', 'EN3', 'N9', 'N13', 'N14', 'N18', 'N21'],
  faq: [
    {
      q: 'We are low lying and the floor is damp. Is that just the water table?',
      a:
        'It might be, and it should be established rather than assumed, because the two look identical from inside. Ground water damp varies with rainfall and season and tends to be fairly even across a floor or a below ground wall. A defect, such as a fractured drain, a bridged wall or surface water running at the building, is more localised and often directional. We survey the internal pattern and the external drainage before saying which, because the two cost very different amounts to deal with.'
    },
    {
      q: 'We replaced the windows and now there is condensation. Is that connected?',
      a:
        'Almost certainly. Original windows leaked air continuously, which ventilated the house whether anyone intended it or not. Replacing them removes that, and if the new units have no trickle vents, or the vents are closed, the moisture a household generates has nowhere to go. It is one of the most common causes of sudden condensation in otherwise sound houses, and the answer is controlled ventilation rather than anything applied to the walls.'
    },
  ],
  nearby: ['barnet', 'haringey']
};
