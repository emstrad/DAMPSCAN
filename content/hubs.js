/**
 * The two hub pages per site.
 *
 * A hub exists so the nav can point at a real URL instead of an anchor, and so
 * the sixty-four detail pages sit under something rather than hanging off a
 * link list at the bottom of the home page. That only works if the hub is worth
 * reading in its own right, so each one says something true about the set it
 * introduces rather than announcing that a list follows.
 */
export const hubs = {
  dampscan: {
    services: {
      title: 'Damp, Mould & Timber Services | DampScan',
      metaDescription:
        'What we survey and treat across Kent and the South East: rising and penetrating damp, condensation, mould, rot, woodworm, ventilation and basements.',
      h1: 'What we survey, and what we put right',
      intro:
        'Water gets into buildings in a small number of ways and they are confused with each other constantly. Rising damp gets diagnosed where a gully is blocked. Condensation gets treated as penetrating damp and comes straight back. A wall gets tanked when the problem was above it all along.',
      body: [
        'Each page below covers one of those faults on its own terms: what it actually looks like on a wall, what separates it from the two things it is most often mistaken for, and what a proportionate repair involves. They are written to be read before you commit to anything, including by us.',
        'If you are not sure which one describes your property, that is normal and it is what the survey is for. The diagnosis comes first and the quote follows it, never the other way round.'
      ]
    },
    areas: {
      title: 'Areas We Cover | Damp Surveys in Kent & the South East',
      metaDescription:
        'Damp, mould and timber surveys across Kent, Surrey, Sussex and the South East. Local guides to the housing stock in each district we cover.',
      h1: 'Where we work, and what the housing does there',
      intro:
        'A damp survey is mostly a question about a building, and buildings in one place have more in common with each other than with buildings anywhere else. Ragstone in the Weald, chalk under the Downs, brick earth along the Thames, and estates thrown up in every decade since.',
      body: [
        'Each page below is about that district rather than about us: what was built there and when, what that construction does when it gets wet, and the failures we are called out to most often within it.',
        'Properties inside Greater London are surveyed by our sister practice, ATi Damp Survey, which carries out no remedial work at all. If your postcode falls inside London we will say so and pass you across rather than travel to it.'
      ]
    }
  },
  ati: {
    services: {
      title: 'Damp & Timber Survey Services | ATi Damp Survey',
      metaDescription:
        'What we inspect and report on across London: rising and penetrating damp, condensation, mould, timber decay, rot, ventilation and basements.',
      h1: 'What we inspect, and what the report will say about it',
      intro:
        'Most people arrive here already holding a quote. The question is rarely whether the wall is wet, which is usually obvious, but whether the work being proposed matches the reason it is wet.',
      body: [
        'Each page below sets out one defect: what establishes it as that defect rather than another, what evidence a report should carry to support the conclusion, and what a proportionate repair looks like.',
        'We undertake no remedial work of any kind. That is the whole basis of the practice, and the reason these pages describe repairs we will never be paid to carry out.'
      ]
    },
    areas: {
      title: 'London Coverage | ATi Damp Survey',
      metaDescription:
        'Damp and timber surveys across every London borough. Local guides to the building stock, construction eras and failure patterns in each one.',
      h1: 'Every London borough, and how each one gets wet',
      intro:
        'London is not one building stock. A Camden stucco terrace, a Barking interwar semi, a Southwark postwar slab and a Richmond riverside cottage fail in entirely different ways, and the ground under them differs almost as much.',
      body: [
        'Each page below is about the borough itself: the eras it was built in, the details that fail in those eras, the postcode districts we work across, and the ground conditions underneath.',
        'We attend every borough in Greater London including the City. Outside the M25 our sister practice DampScan covers Kent and the wider South East.'
      ]
    }
  }
};
