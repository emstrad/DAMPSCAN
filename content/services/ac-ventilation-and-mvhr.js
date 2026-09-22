/* Ventilation and MVHR, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "ventilation-and-mvhr",
  site: 'ac',
  name: "Ventilation and MVHR",
  title: "Ventilation, Extract and MVHR Installation | London and the South East | CoolRight",
  metaDescription:
    "Extract ventilation, positive input ventilation and whole-house MVHR installed and commissioned across London and the South East by CoolRight.",
  h1: "Ventilation and heat recovery: the problem cooling does not solve",
  intro:
    "Cooling a sealed room does not make the air in it fresh. Stale air, condensation on the windows every morning, and humidity that never quite goes are ventilation problems, and no amount of air conditioning fixes them. They are worth separating out before anybody spends money, because the two are routinely confused and the wrong one is expensive.",
  sections: [
    {
      h2: "Extract, positive input and heat recovery",
      paras: [
        "Extract ventilation pulls damp air out at the source, which is the right answer in a bathroom or a kitchen and often the cheapest fix in the building. Positive input ventilation does the opposite, gently pushing filtered air in from a loft unit so the damp air is displaced through the gaps in the fabric, and it suits an older house with a condensation problem and no obvious single source.",
        "Mechanical ventilation with heat recovery, MVHR, is the whole-house version: continuous balanced supply and extract through ducts, with a heat exchanger recovering most of the warmth from the air on its way out. It belongs in an airtight building, which is why it is standard in new-build and awkward to retrofit into a draughty Victorian terrace."
      ]
    },
    {
      h2: "Which problem you actually have",
      paras: [
        "Condensation on cold surfaces in winter, black mould in corners and around window reveals, and a house that smells closed up are ventilation symptoms. A room that is simply too hot in summer is a cooling problem. A wall that is wet at low level all year round is neither, and is a damp problem that wants a surveyor rather than an air conditioning engineer.",
        "Where a property has both a damp problem and a comfort problem, we will tell you which to solve first. It is usually the damp, because ventilation designed around a wall that is still wet is designed around the wrong building."
      ]
    },
    {
      h2: "Commissioning is the part people skip",
      paras: [
        "An MVHR system that has never been commissioned is a set of ducts and a fan making noise. The flow rates have to be measured and balanced room by room against the design figures, and the readings recorded, or the system delivers neither the air change rates it was specified for nor the heat recovery it was bought for.",
        "Duct design matters as much: flexible duct pulled tight round a bend costs you more airflow than any fan upgrade will give back. We design the routes, install rigid where it matters, and commission with a meter rather than by listening to it."
      ]
    },
    {
      h2: "What moves the price",
      paras: [
        "For extract, almost nothing: it is a unit, a duct run and making good. For MVHR, the number of rooms, how much of the duct route is accessible, and whether the ceilings are coming down anyway. Retrofitting into a finished house is mostly a building job with a ventilation unit at the end of it, and the honest quote reflects that."
      ]
    }
  ],
  ctaHeading: "Work out which problem you actually have",
  ctaBody:
    "Condensation, stale air and overheating are three different faults with three different answers, and cooling only solves one of them.",
  faq: [
    { q: "Will air conditioning fix my condensation?", a: "No, and it is the most common thing we are asked to do for the wrong reason. Condensation is a moisture and ventilation problem. Cooling a surface can make it worse, and the answer is extract, positive input or heat recovery depending on the house." },
    { q: "What is MVHR and do I need it?", a: "Mechanical ventilation with heat recovery changes the air continuously and keeps most of the warmth while doing it. It suits airtight and well insulated homes. In a draughty Victorian house it is usually the wrong spend." },
    { q: "Why does commissioning matter?", a: "Because an uncommissioned system moves the wrong amount of air and nobody can tell by looking. Measured flow rates at every terminal, recorded, is the difference between a ventilation system and some ducting." }
  ],
  related: [],
  reading: []
};
