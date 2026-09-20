/* Commercial Air Conditioning, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "commercial-air-conditioning",
  site: 'ac',
  name: "Commercial Air Conditioning",
  title: "Commercial Air Conditioning Installation and Maintenance | CoolRight",
  metaDescription:
    "Offices, retail, hospitality, gyms and comms rooms across London and the South East. Out of hours installation, F-Gas leak checking and logging, priority breakdown response.",
  h1: "Commercial air conditioning, where downtime costs money",
  intro:
    "Offices, salons, restaurants, retail units, gyms, managed blocks, and the server and comms rooms that cannot be allowed to get warm at all. The equipment overlaps with domestic work, but the priorities do not: resilience, noise limits, consents, compliance, and working around the hours the business trades.",
  sections: [
    {
      h2: "F-Gas compliance is yours, not ours",
      paras: [
        "Systems above 5 tonnes of CO2 equivalent charge must be leak checked at set intervals, and the operator, which means you rather than your installer, has to keep the records. A failed inspection is a compliance problem rather than an inconvenience, and the fine is not the worst of it if an insurer takes an interest.",
        "We set the schedule up, carry out the checks, and keep the log in a state somebody can actually be shown. Where a system sits just over a threshold we will tell you, because it changes what the law asks of you every year afterwards."
      ]
    },
    {
      h2: "Working around trading hours",
      paras: [
        "A salon cannot close for works and a restaurant cannot lose a Friday. We quote the programme as well as the price: evenings, weekends, or a phased installation floor by floor, with the disruptive work, the core drilling and the power isolation, done when the floor is empty.",
        "That costs more in labour and we say so in the quote rather than burying it. It usually costs less than the trading it protects."
      ]
    },
    {
      h2: "Comms rooms and server rooms",
      paras: [
        "These are a different specification. The load is constant rather than seasonal, so the equipment runs all year including in January, when a standard split may not be able to reject heat at all without low ambient controls. Redundancy matters, because a single unit failing overnight in a locked room is a hardware loss rather than a warm morning.",
        "We specify for continuous duty, fit monitoring so a failure raises an alarm rather than being discovered, and where the room justifies it we propose two smaller units alternating rather than one large one."
      ]
    },
    {
      h2: "Consents, landlords and planning",
      paras: [
        "Most commercial installations need more than one permission: the landlord or managing agent for the plant position and the fabric penetrations, sometimes planning where the building is listed or in a conservation area, and almost always agreement on noise at the nearest residential window.",
        "We handle the technical side of those applications and give you the acoustic figures the council will ask for. What we will not do is fit a condenser in a position we expect to be made to move later."
      ]
    }
  ],
  ctaHeading: "Get the system surveyed and the compliance straight",
  ctaBody:
    "Programmed around your trading hours, with method statements, risk assessments and the F-Gas records the duty actually requires.",
  faq: [
    { q: "Whose responsibility is F-Gas compliance?", a: "The operator of the equipment, which is almost always you rather than your contractor. It means leak checks at intervals set by the charge, records kept, and only certified engineers working on the circuit. We keep the records; the duty stays yours." },
    { q: "Can the work happen outside trading hours?", a: "Yes, and it usually should. Evenings, weekends and phased programmes are normal on occupied sites, and quoted that way from the start rather than added later." },
    { q: "Do you cover comms and server rooms?", a: "Yes. They need cooling year round and fail differently from an office, so they want resilience, monitoring and a sensible service interval rather than the biggest unit that fits." }
  ],
  related: [],
  reading: []
};
