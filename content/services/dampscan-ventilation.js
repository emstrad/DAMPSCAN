/* Ventilation, dampscan. Written from this site's position, not shared with the other.
   See scripts/service-template.js for why the pair are two documents. */
export default {
  slug: 'ventilation',
  site: 'dampscan',
  name: 'Ventilation',
  title: 'Ventilation Surveys & Installation | DampScan',
  metaDescription:
    'Ventilation assessed, designed and installed across Kent and the South East. Most modern homes are over-sealed and under-ventilated.',
  h1: 'Ventilation: the reason so many sound houses are damp',
  intro:
    'Britain has spent forty years making homes airtight and rather less effort making them ventilated. Double glazing, draught proofing and insulation all removed the uncontrolled air leakage that used to dry a house out by accident. Where nothing replaced it, the moisture a household generates has nowhere to go, and mould appears in buildings with nothing structurally wrong with them.',
  signsHeading: 'Signs a house is under-ventilated',
  signs: [
    'Streaming windows in the morning, particularly in bedrooms',
    'Mould in cupboards, behind furniture and in external corners',
    'A bathroom that stays steamed up long after the fan has run',
    'Condensation appearing in the year after new windows or insulation were fitted',
    'A fan that is quiet, which is very often a fan that is moving almost nothing',
  ],
  sections: [
    {
      h2: 'What usually goes wrong',
      paras: [
        'Extract fans that do not extract. A fan rated for a flow rate rarely achieves it once it is fitted to a long duct with bends, a blocked external grille or a crushed flexible run in a loft. Measuring the actual flow at the grille against the requirement is a five minute job that is almost never done, and it is the most common single finding we make.',
        'Ducting into a void. A bathroom fan discharging into a loft moves the moisture out of the bathroom and deposits it on the underside of the roof felt, where it condenses and drips back through the ceiling. That is then diagnosed as a roof leak, and roofs get replaced over it.',
        'Windows replaced without trickle vents, or with the vents closed because of noise or draughts. The house lost its background ventilation in an afternoon and nobody noticed until the first cold snap.',
      ]
    },
    {
      h2: 'Designing the right system',
      paras: [
        'Intermittent extract in wet rooms, humidity sensing rather than switched, ducted in rigid duct on the shortest sensible run and terminating at outside air. That handles the moisture at the point it is generated, which is where it is cheapest to deal with.',
        'Background ventilation in habitable rooms, normally trickle vents, so replacement air can get in. An extract fan with nowhere to draw replacement air from is working against a sealed box and moves far less than its rating.',
        'Where the layout suits it, a whole house approach: positive input ventilation introducing filtered air from the loft to dilute and displace moist air, or mechanical ventilation with heat recovery in a well sealed property. Neither is a universal answer. A loft mounted unit is unsuitable in a flat or a converted loft, and heat recovery is wasted on a leaky house.',
      ]
    },
    {
      h2: 'Installation and commissioning',
      paras: [
        'Every system we install is sized for the property, ducted properly and commissioned, which means the flow rate is measured after installation and recorded rather than assumed. An uncommissioned system is a system nobody has checked, and a substantial proportion of the ones we inspect have never moved the air they were specified to move.',
        'The work is covered by an insured workmanship guarantee. Where a survey concludes that the existing fan simply needs reducting to outside, that is what the report will say, and it is a common outcome.',
      ]
    },
  ],
  ctaHeading: 'Have the ventilation measured, not assumed',
  ctaBody:
    'Measured flow rates against requirement, humidity and surface temperature readings, and a written report within 24 hours of the visit.',
  faq: [
    {
      q: 'How do I know if my extract fan is working?',
      a:
        'Not by whether it makes a noise, which is the usual test and a poor one. A fan can run loudly and move very little, and a good fan is often quiet. The reliable check is measuring the air flow at the grille with an anemometer and comparing it to the requirement for the room. Failing that, a sheet of tissue paper held to the grille should be held firmly in place rather than fluttering. If it falls, the fan is decorative.'
    },
    {
      q: 'Will a bigger fan solve it?',
      a:
        'Usually not on its own, because the limiting factor is rarely the fan. It is more often the duct: too long, too many bends, flexible rather than rigid, crushed in a loft, or terminating at a grille that is blocked. Fitting a more powerful unit onto the same bad duct achieves a little more noise and a little more air. Fixing the duct achieves the rated flow with the fan already there.'
    },
    {
      q: 'Does more ventilation mean a colder, more expensive house?',
      a:
        'Less than people expect, if it is done properly. Humidity sensing extract runs when it is needed rather than continuously, and trickle ventilation moves small volumes. Uncontrolled draughts through gaps are far more wasteful than designed ventilation, and a damp house is markedly more expensive to heat than a dry one because moist air and wet fabric both take more energy to warm. Controlling ventilation usually costs less than the damp it prevents.'
    },
  ],
  related: ['condensation-and-mould', 'damp-surveys', 'rising-damp']
};
