/* Newham. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'newham',
  site: 'ati',
  name: 'Newham',
  title: 'Damp Surveys in Newham | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Newham, E6, E7, E12, E13, E15 and E16. Reports for landlords, agents, leaseholders and disrepair cases.',
  h1: 'Independent damp surveys in Newham',
  intro:
    'Newham was built for the docks and then substantially rebuilt after the war, so its terraces are interrupted by post-war infill in a way few other boroughs match. It also has one of the highest concentrations of private rented housing in the country, and a good share of our work here is producing reports that will be read by somebody other than the person who commissioned them.',
  stock: [
    'The surviving Victorian and Edwardian terraces are modest, solid walled and densely occupied. Many are now houses in multiple occupation, and the combination of high occupancy, limited heating and original single glazing produces genuine condensation risk on top of whatever the building itself is doing. Separating the two is the whole job: an overcrowded house with a working extract is a different problem from a house with a cold bridge and no ventilation at all.',
    'Post-war infill and estate housing fills the gaps left by bomb damage. System built and large panel blocks fail at joints and cold bridges, producing mould that runs along slabs and reveals in bands rather than spreading from a point. That geometry is the evidence: mould that traces the structure is telling you about the structure.',
    'Stratford and the Olympic fringe bring recent high density development with airtight envelopes and mechanical ventilation. Where those systems were never commissioned, or have been switched off, moisture accumulates in a building that cannot leak it away, and the result is mould in flats only a few years old. It is a performance failure and it is measurable.',
  ],
  common: [
    'Condensation risk in high occupancy houses, needing separation from building defects',
    'Mould banding at slabs, reveals and panel joints in post-war and system built blocks',
    'Housing disrepair reports written to be read by the other side',
    'Uncommissioned or disabled mechanical ventilation in recent high density flats',
    'Extract fans that move too little air, or discharge into a roof void',
    'Penetrating damp through failed rear extension roofs on older terraces',
  ],
  coverage:
    'We survey across the borough, from Stratford and West Ham out through East Ham and Forest Gate to Beckton and the Royal Docks.',
  places: ['Stratford', 'East Ham', 'Forest Gate', 'Plaistow', 'Canning Town', 'Beckton', 'Manor Park', 'Royal Docks', 'West Ham'],
  districts: ['E6', 'E7', 'E12', 'E13', 'E15', 'E16', 'E20'],
  faq: [
    {
      q: 'The property is overcrowded. Does that make the damp the tenant\'s fault?',
      a:
        'It is a factor and it is rarely the whole answer. More occupants means more moisture generated, but a building is expected to deal with the moisture normal occupation produces, and that is what ventilation is for. If the extract moves less air than it should, discharges into a void, or does not exist, the building is not doing its job whatever the occupancy. We measure air flow as well as moisture, so the report separates what the building is failing to do from what occupancy is adding.'
    },
    {
      q: 'We are a landlord. What use is an independent survey to us?',
      a:
        'A great deal, particularly before a claim rather than after one. It establishes the actual condition, distinguishes defects you are responsible for from those you are not, and gives you a costed picture of what needs doing. If a claim follows, you already hold a contemporaneous, independent report rather than commissioning one under pressure. We carry out no remedial work, which is what makes the report credible to the other side.'
    },
  ],
  nearby: ['tower-hamlets', 'waltham-forest']
};
