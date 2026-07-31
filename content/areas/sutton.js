/* Sutton. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'sutton',
  site: 'ati',
  name: 'Sutton',
  title: 'Damp Surveys in Sutton | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Sutton, SM1 to SM7. Written reports for owners, buyers and landlords.',
  h1: 'Independent damp surveys in Sutton',
  intro:
    'Sutton sits on the chalk of the North Downs, and there is one local feature that genuinely changes the diagnosis: the springs. Carshalton and the Wandle head are fed by chalk springs, and the water table in that part of the borough rises and falls in a way that affects basements and solid floors quite unlike the rest of south London.',
  stock: [
    'Where the chalk aquifer is close to the surface, particularly around Carshalton and Beddington, the water table moves seasonally and can rise substantially after a wet winter. Basements and cellars that were dry for years become wet, and the cause is not a failure of anything. It has to be managed rather than repaired, and knowing that saves an owner from paying for waterproofing that will be overwhelmed anyway.',
    'On the higher chalk ground the pattern is the opposite: water moves through quickly, so damp is episodic and correlates with heavy rain. That points at surface water reaching the building, gullies and ground falls, rather than anything continuous, and the remedy is external drainage.',
    'The housing itself is mostly interwar and post-war semi and detached, cavity walled with functioning damp proof courses. As across the outer boroughs, decades of layered drives and patios have raised the ground above the course on a great many, and airbricks have been blocked by later extensions and conservatories. Both are commonly misread as rising damp.',
  ],
  common: [
    'Seasonal water table rise on the chalk springs affecting cellars and solid floors',
    'Episodic damp on higher chalk ground after heavy rain, from surface water reaching the wall',
    'Ground levels built up above the damp proof course on interwar and post-war housing',
    'Airbricks blocked by extensions, conservatories and patios',
    'Waterproofing quoted for a below ground space where the real issue is groundwater management',
    'Slumped or bridging retrofit cavity insulation on exposed elevations',
  ],
  coverage:
    'We survey across the borough, from Sutton and Cheam through Carshalton and Wallington to Worcester Park and Belmont.',
  places: ['Sutton', 'Carshalton', 'Wallington', 'Cheam', 'Worcester Park', 'Belmont', 'Hackbridge', 'Beddington', 'Rosehill'],
  districts: ['SM1', 'SM2', 'SM3', 'SM4', 'SM5', 'SM6', 'SM7'],
  faq: [
    {
      q: 'Our cellar is wet this winter and was dry last year. What changed?',
      a:
        'On this part of the chalk, most likely the water table. The aquifer beneath the borough responds to sustained rainfall over months rather than to individual storms, so after a wet winter groundwater levels can rise well above where they have sat for years. Nothing has failed. It needs managing, through drainage and pumping designed for the actual level rather than through waterproofing specified for a dry year, and it is worth knowing before committing to a tanking quote.'
    },
    {
      q: 'Should we tank the basement?',
      a:
        'Only once it is clear what the water is doing, because the right answer differs completely. Tanking a below ground room against occasional surface water is reasonable. Tanking against a seasonally rising water table, without drainage and pumping sized for it, transfers the pressure elsewhere and frequently fails. We establish which situation you are in first, and we carry out no remedial work, so we have nothing to gain from the more expensive answer.'
    },
  ],
  nearby: ['merton', 'kingston-upon-thames']
};
