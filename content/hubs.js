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
  /* CoolRight. No areas hub: the business covers a region rather than writing
     a page per district, and a hub over nothing is worse than no hub. */
  ac: {
    services: {
      title: 'Air Conditioning, Heating & Ventilation | CoolRight',
      metaDescription:
        'Installation, repairs, servicing, multi-split, heat pumps, commercial systems and ventilation across London and the South East. What each job involves and what moves its price.',
      h1: 'What we install, and what we tell you not to',
      intro:
        'Almost every callout we attend on somebody else\'s system traces back to the installation rather than the equipment. A unit sized from a room\'s floor area instead of its heat load, condensate routed with too little fall, a pipe run nobody pressure tested. None of it shows on the day it is handed over.',
      body: [
        'Each page below covers one job on its own terms: what usually goes wrong, what we do instead, what it is most often confused with, and what moves the figure. The ventilation page exists largely to say that cooling does not fix condensation, which is the most common reason we are asked to quote for the wrong thing.',
        'Every job is quoted after a visit. A price given blind over the phone is a guess that gets corrected upwards later, and we would rather look first.'
      ]
    },
    guides: {
      title: 'Air Conditioning Guides | CoolRight',
      metaDescription:
        'What air conditioning costs and why, how to compare two quotes, and which problems cooling does not solve.',
      h1: 'Read this before you accept a quote',
      intro:
        'The questions people ask before spending money on cooling are mostly about price, and they are hard to answer well because every install is a building rather than a product.',
      body: [
        'These guides answer them as honestly as a quoted trade can: what actually moves the figure, which lines should appear in a quote, and what their absence means.',
        'One of them is about a problem cooling does not solve. Condensation, stale air and overheating are three faults with three different answers, and only one of them is air conditioning.'
      ]
    }
  },
  /* Verge Roofing. No areas hub yet: the regional pages have not been carried
     across, so the nav points at /roofing-in only once they exist. */
  roofing: {
    services: {
      title: 'Roofing Services | Verge Roofing',
      metaDescription:
        'Re-roofs, repairs, flat roofing, leadwork, chimneys and guttering across London and the South East. What each job involves and what moves its price.',
      h1: 'What we do, and when we tell you not to',
      intro:
        'Roofing is sold on fear more than any other trade. A roof is the one part of a house nobody can see, the quote arrives after somebody has been up a ladder alone, and the person who found the fault is the person selling the cure. That arrangement pays for a lot of roofs that did not need replacing.',
      body: [
        'Each page below covers one job on its own terms: what it actually involves, what it is most often confused with, and what moves the figure up or down. Several of them spend their length explaining how to tell when you do not need the work at all.',
        'We quote every job rather than publishing a rate card, because a roof is a building and not a product. What we will do is tell you what is included, what is not, and what would be discussed if we open up and find something neither of us could see.'
      ]
    },
    guides: {
      title: 'Roofing Guides | Verge Roofing',
      metaDescription:
        'What roofing work costs and why, how to read a roofing quote, and how to tell a roof that needs replacing from one that needs a repair.',
      h1: 'Read this before you accept a roofing quote',
      intro:
        'Almost every expensive mistake in roofing is made in the week before the work starts, while somebody is holding two quotes that do not describe the same job and has no way to compare them.',
      body: [
        'These guides are about that week. What the figures usually fall between and why they move, which lines should be in a quote and what their absence means, and how to tell nail fatigue from a slipped tile.',
        'Two of them argue against buying work. That is deliberate: we would rather write the page that says your roof has ten years left in it and do the job when it does not.'
      ]
    }
  },
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
    },
    guides: {
      title: 'Damp, Rot & Woodworm Guides | DampScan',
      metaDescription:
        'Plain answers to the questions people ask before booking a damp survey: what treatment costs, when it is not needed, and how to read a quote.',
      h1: 'Read this before you pay for treatment',
      intro:
        'Most of the money wasted on damp and timber in this region is spent before anyone has established what is wrong. These guides are written for the point before that, when you are holding a quote or a valuation comment and want to know what it should mean.',
      body: [
        'We carry out the remedial work, which is exactly why these pages say when it is not needed. A firm that treats a historic woodworm infestation or sprays a whole house for one soft joist end has earned an invoice and nothing else, and we would rather write the report that says so.',
        'Each guide gives the figures quotes tend to fall in, the questions that separate a fair scope from a padded one, and the cases where the right answer is a repair, a repair to the water, or nothing at all.'
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
    },
    guides: {
      title: 'Guides to Damp & Timber Quotes | ATi Damp Survey',
      metaDescription:
        'How to read a damp, rot or woodworm quote in London: what it must establish, what the work typically costs, and when the right answer is to refuse it.',
      h1: 'What a quote has to establish before the figure means anything',
      intro:
        'People come to us holding a quote, a valuation comment or a lender\'s retention letter, and the question is rarely whether the timber or the wall is affected. It is whether the work proposed matches what is actually there, and the quote itself cannot tell you that.',
      body: [
        'These guides set out, subject by subject, what a competent scope has to state, the ranges warranted work tends to cost across London, and the specific cases where the correct response is no. They are written by a practice that treats nothing and tenders for nothing, so nothing in them is an argument for work we would be paid to do.',
        'Where a guide leaves you unsure which case you are in, that is what the survey is for, and it costs a small fraction of the quote you are checking.'
      ]
    }
  }
};
