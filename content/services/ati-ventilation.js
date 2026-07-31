/* Ventilation, ati. Written from this site's position, not shared with the other.
   See scripts/service-template.js for why the pair are two documents. */
export default {
  slug: 'ventilation',
  site: 'ati',
  name: 'Ventilation',
  title: 'Independent Ventilation Assessments | ATi Damp Survey',
  metaDescription:
    'Independent ventilation assessments across London, with measured flow rates. Reports for landlords, leaseholders, disrepair claims and new build defects.',
  h1: 'Ventilation: measured, against what the design required',
  intro:
    'Almost every mould dispute in London comes down to one testable question that almost nobody tests: does the ventilation actually move the air it was supposed to move? We measure it, compare it to the requirement, and put the numbers in writing. That single measurement resolves more arguments than any other thing in a damp report.',
  signsHeading: 'Why measurement matters more than description',
  signs: [
    'A fan rated for a flow rate frequently achieves a fraction of it once installed',
    'Long or flexible ducting, bends, crushed runs and blocked terminals all reduce it further',
    'A fan ducted into a roof void removes moisture from the room and deposits it in the roof',
    'Modern airtight flats have no incidental leakage to fall back on when the system fails',
    '"There is a fan in the bathroom" is a description, not evidence that ventilation is provided',
  ],
  sections: [
    {
      h2: 'Where this comes up in London',
      paras: [
        'New build and recent conversions, where mechanical ventilation was specified, installed and never commissioned. Uncommissioned systems are common enough to be the default assumption rather than the exception, and a flat two or three years old with mould is very often a commissioning failure the developer or warranty provider is still answerable for.',
        'Housing disrepair, where whether ventilation is provided is a question of fact that the parties usually argue about in adjectives. A measured flow rate against a stated requirement converts that into something a tribunal or a solicitor can act on.',
        'Leasehold flats where a communal extract system serves multiple properties, and an individual leaseholder has no ability to inspect or maintain the part that has failed. Establishing that the fault is in the communal system rather than the flat is what shifts the responsibility.',
      ]
    },
    {
      h2: 'What we do',
      paras: [
        'Measure the actual extract flow rate at each wet room terminal and compare it with the requirement for that room. Trace the duct route so far as it can be traced, and establish whether it terminates at outside air or into a void, which is a distinction that decides where the moisture is actually going.',
        'Record background ventilation provision: trickle vents present, absent, blocked or closed. Record surface temperatures, air temperature and relative humidity, so the dew point conditions the surfaces are being asked to cope with are on the record alongside the ventilation shortfall.',
        'Where a whole house or communal system is involved, establish what it is, whether it is running, and whether it has ever been balanced. A system that has been switched off at the isolator is a surprisingly common finding and an unusually easy one to demonstrate.',
      ]
    },
    {
      h2: 'What the report gives you',
      paras: [
        'Numbers rather than opinions: the measured flow, the required flow, the shortfall, and the conditions that shortfall produces. Photographs of the terminals, ducting and any defect found. A conclusion on whether ventilation is being provided as required, which is the question everything else hangs on.',
        'ATi installs nothing and recommends no contractors, so there is no commercial interest in whether a system is found adequate or not. That is the point of instructing us for a report that will be read by somebody with an interest in the answer.',
      ]
    },
  ],
  ctaHeading: 'Get the ventilation measured',
  ctaBody:
    'Measured flow rates against requirement, duct routes traced, and a written report within 24 hours of the visit. Put your postcode in the form and we will confirm cover and fee the same day.',
  faq: [
    {
      q: 'What flow rate should a bathroom fan achieve?',
      a:
        'Building regulations set minimum extract rates by room type, with bathrooms and kitchens the two that matter most for moisture. Rather than quote a figure that changes with the edition and with whether extract is intermittent or continuous, we record the requirement applicable to the property and the flow we actually measured, side by side. What matters for a dispute is the comparison, and that it was measured rather than estimated.'
    },
    {
      q: 'Our flat is new and the developer says the ventilation is fine. Can that be tested?',
      a:
        'Yes, and it is worth doing, because uncommissioned systems are extremely common. Commissioning means measuring and recording the flow rates after installation, and where that was never carried out there is no evidence the system ever performed as designed. A measured shortfall in a property still within its warranty period is a defect the developer or the warranty provider is answerable for, and the measurement is what makes it actionable.'
    },
    {
      q: 'The fan is in a communal system we cannot access. Does that matter?',
      a:
        'It matters a great deal and it strengthens rather than weakens your position. If the extract serving your flat depends on communal plant or ductwork you have no right to inspect or maintain, a failure in that system is not something you can be held responsible for. Establishing that the shortfall originates outside your demise is exactly the sort of thing an independent report is instructed to do.'
    },
  ],
  related: ['condensation-and-mould', 'damp-surveys', 'penetrating-damp']
};
