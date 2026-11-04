/**
 * The shared framing on the "damp proofing in <place>" pages, per brand.
 *
 * These pages answer the search people actually type ("damp proofing
 * sittingbourne") honestly: neither brand sells damp proofing, so the page is
 * about getting the cause found before paying anybody for it, what proper
 * damp proofing looks like, and how to tell when a quote goes too far.
 *
 * Three versions per section for DampScan's Kent towns and two for ATi's
 * London boroughs, chosen by scripts/variants.js so no two pages share all
 * their framing. The voices differ on purpose: DampScan talks about Kent
 * houses and the driveway conversation; ATi about London flats, leases,
 * freeholders and purchases. The place's own name and fabric are written in.
 */

const dampscan = {
  cost: [
    (t) => `Our survey fees are published on the prices page and fixed before we visit. Set against a damp proofing job on a ${t.name} house, which typically runs to several times that once plaster removal and making good are included, the survey is small. When it shows that a wall needs a gutter repair rather than an injected course, it pays for itself several times over.`,
    (t) => `Damp proofing is priced per metre of wall plus replastering, and on an older ${t.name} house that adds up quickly. The survey is a fixed fee, published on our prices page, and its job is to make sure you only pay a contractor for the metres that need it, if any.`,
    (t) => `Think of the survey as the cheapest part of the job. A fixed published fee, against the cost of hacking off, treating and replastering walls in a ${t.name} home, and against the cost of doing that twice when the first treatment did not address the cause.`
  ],
  types: [
    (t) => ({
      h: 'The kinds of damp proofing, and what each one is for',
      paras: [
        `"Damp proofing" covers several different jobs. A chemical damp proof course is a cream or fluid injected into a mortar course to stop moisture rising from the ground. A physical course is a membrane or slate cut into the wall, slower and more disruptive. Tanking is a waterproof coating or render that holds water back on a wall below ground. A drained membrane lets water reach the wall and carries it away to a channel and pump.`,
        `Each answers one fault. None of them fixes rain coming through ${t.material} or brick, a gutter overflowing down a corner, or condensation on a cold wall, and those three account for most of the damp we are asked about in ${t.name}. Replastering is often sold alongside, and on old solid walls the choice of plaster matters as much as anything injected.`
      ]
    }),
    (t) => ({
      h: 'Injection, tanking, membranes: what they are for',
      paras: [
        `Injection is for rising damp: groundwater drawn up a wall that has no working course. Tanking and cavity drain membranes are for walls below ground that hold back soil and water, such as cellars and basements. Salt resistant replastering is for walls where years of damp have left salts in the old plaster. Ventilation is for condensation. A quote that applies one of them to the wrong problem will fail however well it is installed.`,
        `In ${t.name} the commonest mismatch we see is injection and a cement based replaster on a wall whose real trouble is outside: open joints, raised ground or a leaking downpipe. Fix those and the wall often dries without anything being injected at all.`
      ]
    }),
    (t) => ({
      h: 'A short guide to damp proofing methods',
      paras: [
        `Chemical injection puts a water repellent barrier into the base of a wall. Electro osmotic and other proprietary systems make similar claims by different means. Membranes and tanking hold or drain water on below ground walls. Breathable or salt resistant plasters deal with what years of damp leave behind. They are tools, and the skill is in knowing which, if any, the wall needs.`,
        `Old ${t.name} walls built in ${t.material} or soft brick were never meant to be sealed. They take a little water and lose it again, and many damp problems in them start the day somebody stopped them losing it. The right damp proofing for such a wall is often the work that lets it breathe again.`
      ]
    })
  ],
  after: [
    (t) => `After the survey you have the cause in writing, a list of what needs doing in order, and what does not. If damp proofing is part of it, the report specifies the walls, the height and the finish, so the quotes you collect in ${t.name} are for the same job. If it is not, you have the evidence to say no to the quote you were given.`,
    (t) => `What you do with the report is up to you. Most people fix the outside faults first, which are usually the cheapest, and give the wall a season to dry. Some take the specification to two or three ${t.name} contractors. Some send it back to the firm that quoted, which often changes the quote.`,
    (t) => `The report is yours to use as you like: to compare quotes, to put to a seller or landlord, or simply to know. We take no commission and recommend no contractor, so you choose who does any work in ${t.name}, and we will read their quote against the report if you ask.`
  ],
  why: [
    (t) => `Most of the walls we are asked to look at in ${t.name} after a damp proofing quote do not need a new damp proof course. They need the water dealt with at its source: a path lowered, a gutter cleared, ${t.material} repointed in the right mortar, or a fan that actually extracts. Injecting a wall that is wet for another reason costs real money and fixes nothing, and the tide mark returns once the new plaster dries out.`,
    (t) => `Damp proofing is the answer to one specific fault, a missing or failed damp proof course, and that fault is far rarer in ${t.name} than the quotes suggest. Before anyone drills a wall, somebody with nothing to sell should establish why it is wet. That is the whole of what we do. We carry out no treatment, so the survey is not a route to a sale.`,
    (t) => `A free damp survey in ${t.name} is usually a sales visit with a meter. The meter reads high on a wall that is wet for any reason, and on salts in old plaster even when the wall is dry, so a high reading proves very little. An independent survey finds the cause, and only the cause tells you whether damp proofing is the remedy at all.`
  ],
  proper: [
    (t) => ({
      h: 'What proper damp proofing should look like',
      list: [
        'A written diagnosis first, with readings and photographs, saying why the wall is wet',
        'External causes fixed before or alongside any internal work: ground levels, gutters, pointing, render',
        `A damp proof course only where one is missing or has genuinely failed, at the right height for the ${t.name} house in question`,
        'Salt contaminated plaster removed and replaced with a suitable breathable or salt resistant finish, not sealed over',
        'Drying time allowed before decoration, because a wall that has been wet for years does not dry in a week',
        'A guarantee that names the walls treated and the cause addressed, from a firm that will still be there'
      ]
    }),
    (t) => ({
      h: 'Damp proofing done properly, in the right order',
      list: [
        'Find the cause: measure, look outside, rule the alternatives in or out',
        'Fix the cheap external faults first and give the wall time to respond',
        `Only then, if a ${t.material} or brick wall is still wet at low level with no working course, consider a new damp proof course`,
        'Replaster with materials that suit the wall: lime on old solid walls, never cement on soft brick or stone',
        'Ventilate and heat so the wall can dry, and check it again after a season',
        'Keep the paperwork: diagnosis, specification, guarantee and the readings after'
      ]
    }),
    (t) => ({
      h: 'The signs of a damp proofing job worth paying for',
      list: [
        'The contractor can tell you the cause in a sentence and show you the evidence',
        `The quote mentions what is happening outside the ${t.name} house, not only inside`,
        'Plaster removal is limited to where salts actually are, with a height that matches the readings',
        'Materials are named and suit the wall, rather than a standard system applied to every house',
        'The guarantee is insurance backed or otherwise protected, and states exactly what it covers',
        'Nobody pressed you to sign on the day'
      ]
    })
  ],
  oversold: [
    (t) => ({
      h: 'How to avoid being oversold',
      list: [
        'Never sign on the day of a free survey. A genuine problem will still be there next week',
        'Ask what else could cause the readings, and how each alternative was ruled out',
        'Ask for the readings in writing, with where they were taken',
        'Be wary of whole house treatment for damp found on one wall',
        'Be wary of tanking or a membrane on an above ground wall that is wet from outside',
        `Get an independent survey on any ${t.name} job above a few hundred pounds; it often costs less than the plaster you would lose`
      ]
    }),
    (t) => ({
      h: 'Questions to put to anyone quoting',
      list: [
        'Why is this wall wet, and what is the evidence?',
        'Have you checked the ground level, gutters and pointing outside, and what did you find?',
        'Would the damp stop if those were fixed, and how do you know it would not?',
        'Why this height of replastering, and why this material?',
        `What exactly does the guarantee cover if the damp comes back in this ${t.name} house?`,
        'Can I have the survey in writing before I decide?'
      ]
    }),
    (t) => ({
      h: 'Red flags in a damp proofing quote',
      list: [
        'A diagnosis of rising damp from a single meter reading',
        'No mention of anything outside the house',
        'Injection recommended on internal walls, chimney breasts or walls above ground floor',
        'A discount that expires today',
        'Treatment of woodworm or rot in every timber "as a precaution"',
        `A quote for a ${t.name} period house that would be identical for a 1990s semi`
      ]
    })
  ],
  dpc: [
    (t) => `There are walls in ${t.name} that do need a damp proof course. A solid wall built without one, or with a slate or bitumen course that has cracked or been cut through, that is wet at low level with nothing outside to explain it and with the readings falling off with height, is a reasonable candidate. When we find that, the report says so and specifies where and how high, so you can get comparable quotes.`,
    (t) => `Genuine rising damp exists, and when the survey finds it the report specifies the remedy plainly. The test is not a meter reading but a pattern: damp highest at the base of the wall, falling with height, present on walls with no external fault, and present in summer as well as winter. In ${t.name} we find that pattern on a minority of the walls we are asked about.`,
    (t) => `We are not against damp proofing. We are against it being the default. When a ${t.name} wall has no working course, sits on damp ground and stays wet after the outside has been put right, a damp proof course and suitable replastering is the right job, and the report will say that and specify it.`
  ],
  cta: [
    (t) => `An independent survey before you pay for damp proofing in ${t.name}. Fixed fee, same day reply, written report the next day.`,
    (t) => `Get the cause in writing before anyone drills a wall. We sell no treatment and cover ${t.name} and the villages around it.`,
    (t) => `Holding a damp proofing quote? Book a survey and we will tell you whether it matches what is actually wrong with your ${t.name} home.`
  ]
};

const ati = {
  lease: [
    (t) => `In ${t.name}, a large share of homes are flats, and damp proofing quotes are often given to a leaseholder for a problem that belongs to the building. Before paying, check whether the water is coming through the roof, the external walls, the front area or a shared drain, because under most leases those are the freeholder's to repair. Our report states the source and the route, with the evidence a managing agent needs.`,
    (t) => `If you are a landlord in ${t.name}, remember that the hazard is the damp and mould, not the absence of a damp proof course. Removing the cause is what deals with it, and that is often ventilation, heating, rainwater or a leak. If you are buying, a report before exchange tells you whether a damp proofing recommendation in the homebuyer survey is justified, and what the honest scope of work is.`
  ],
  cost: [
    (t) => `The survey fee is published and fixed before the visit. In ${t.name}, where replastering and making good in a period flat is expensive and disruptive, establishing whether the work is needed before it starts is the economical step.`,
    (t) => `Set the fixed survey fee against the cost of injection, replastering and redecoration in a ${t.name} property, and against the cost of repeating it when the cause was elsewhere. The comparison usually makes the decision.`
  ],
  types: [
    (t) => ({
      h: 'What the different damp proofing treatments are for',
      paras: [
        `Injection is meant for rising damp in a wall with no working course. Tanking and cavity drain membranes are for below ground walls, which in ${t.name} usually means a lower ground floor or a cellar. Salt resistant replastering deals with contamination left by long term damp. Ventilation and heating deal with condensation. Each is valid for its own fault and useless for the others.`,
        `London's solid walled terraces were built to breathe. Sealing one with cement render or tanking above ground tends to push moisture somewhere else in the building, frequently into the flat next door or the floor above.`
      ]
    }),
    (t) => ({
      h: 'Damp proofing methods, briefly',
      paras: [
        `A chemical damp proof course, a physical course, a waterproof render, a drained membrane, a breathable plaster: each is sold as damp proofing, and each answers a different question. The survey's job is to establish which question the ${t.name} wall is actually asking.`,
        `In converted buildings the answer is often outside the flat altogether: a communal gutter, a front area drain, a parapet or a neighbour's raised garden. A damp proofing system inside the flat cannot fix any of those.`
      ]
    })
  ],
  after: [
    (t) => `The report gives you the cause, the responsibility and a specification. In ${t.name} that often means a letter to a freeholder or managing agent with the evidence attached, before any work inside the flat is considered.`,
    (t) => `After the survey you hold an independent record. Use it to obtain comparable quotes in ${t.name}, to negotiate a purchase, or to require a landlord or freeholder to act. We do no remedial work and recommend no contractor.`
  ],
  why: [
    (t) => `A great deal of the damp proofing sold in ${t.name} is sold to a wall that is wet for another reason: a lightwell or patio above the old course, a defective gutter on a party parapet, a bathroom extract ducted into a void, or condensation in a flat that has lost its air changes. We do not sell damp proofing or any other remedial work, so the survey has one job, which is to say which of those it is.`,
    (t) => `In ${t.name} the question is rarely whether a damp proof course has failed. It is who is responsible for the fault that is wetting the wall, and what will actually stop it. That might be a freeholder, a neighbour or a managing agent rather than you. An independent report answers both, and we carry out no remedial work, so the answer is not shaped by a sale.`
  ],
  proper: [
    (t) => ({
      h: 'What proper damp proofing involves in a London building',
      list: [
        'A diagnosis in writing, with readings, before any specification',
        'External and communal faults identified and assigned: parapets, gutters, lightwells, shared drains',
        `A new damp proof course only on a ${t.name} wall that genuinely lacks a working one at low level`,
        'Breathable or salt resistant replastering chosen for the wall, not a default system',
        'Consent considered where the building is listed or in a conservation area',
        'A record of what was done and why, which a future buyer\'s surveyor will ask for'
      ]
    }),
    (t) => ({
      h: 'The right order for damp proofing work',
      list: [
        'Establish the cause independently',
        'Resolve anything the freeholder or a neighbour is responsible for',
        'Fix water entry and ground level faults, then allow the wall to dry',
        `Only then specify internal works in the ${t.name} flat or house, in materials that suit solid walls`,
        'Check that ventilation and heating allow the wall to stay dry',
        'Keep the diagnosis and the guarantee together for the conveyancing file'
      ]
    })
  ],
  oversold: [
    (t) => ({
      h: 'Avoiding an unnecessary damp proofing bill',
      list: [
        'Treat a free survey as a sales visit and do not sign on the day',
        'Ask how condensation, rainwater and ground level were excluded',
        'Ask whether any of the cause sits in the common parts and who should pay',
        `Be cautious of tanking an above ground wall in a ${t.name} conversion`,
        'Ask for the readings, their locations and the height of plaster removal in writing',
        'If a purchase depends on it, get the report before exchange, not after'
      ]
    }),
    (t) => ({
      h: 'Warning signs in a damp proofing quote',
      list: [
        'Rising damp diagnosed on an upper floor, or on a party wall with no ground contact',
        'No inspection of the lightwell, front area, rear yard or parapet',
        'A blanket timber treatment added to a damp quote',
        'A guarantee that does not say which walls, or what happens if the cause was elsewhere',
        `A price for a ${t.name} terrace with no reference to its solid walls or its lime plaster`,
        'Pressure to agree before a buyer\'s or lender\'s deadline'
      ]
    })
  ],
  dpc: [
    (t) => `Some ${t.name} walls do need a damp proof course: a solid wall with no course, or one that has been bridged internally by a solid floor, that remains wet at low level once every external source has been eliminated. Where we find that, the report specifies it plainly, with the height and finish, so you can obtain like for like quotes.`,
    (t) => `We are not opposed to damp proofing, only to it being sold as the answer before the question has been asked. Where the readings, the pattern and the building all point to a missing or failed course in a ${t.name} property, the report recommends one and says how it should be done.`
  ],
  cta: [
    (t) => `An independent survey before any damp proofing in ${t.name}. We do no remedial work. Written report the next day.`,
    (t) => `Get the cause, and who is responsible for it, in writing before you pay for damp proofing in ${t.name}.`
  ]
};

export const PROOFING_COPY = { dampscan, ati };
/* why, proper, oversold, dpc, cta, types, after, cost */
export const PROOFING_SECTIONS = 8;
