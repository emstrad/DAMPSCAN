/* Air Conditioning Installation, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "air-conditioning-installation",
  site: 'ac',
  name: "Air Conditioning Installation",
  title: "Air Conditioning Installation | London and the South East | CoolRight",
  metaDescription:
    "Wall-mounted split air conditioning installed by F-Gas registered engineers across London and the South East. Free quote visit, fixed written price, warranty registered for you.",
  h1: "Air conditioning installation, priced properly and fitted to spec",
  intro:
    "A single wall-mounted split is the most common air conditioning installation in a British home: one indoor unit, one outdoor condenser, and a small core drilled through the wall between them. Fitted well it is quiet, unobtrusive and surprisingly cheap to run. Fitted badly it drips, rattles, cools one corner of the room and costs more to run every year it stays in.",
  sections: [
    {
      h2: "What usually goes wrong",
      paras: [
        "Almost every callout we attend on somebody else's system traces back to the installation rather than the equipment. The unit was chosen from the room's floor area rather than its heat load, so it runs flat out on the hottest afternoon and never quite gets there. The condensate was routed uphill, or with too little fall, so within two summers the tray backs up and water finds the plasterboard. The pipe run was never pressure tested, so the charge slowly leaks away and the system is quietly working harder every month.",
        "None of these are visible on the day. They show up in the second or third year, by which point the installer is difficult to find and the manufacturer warranty was never registered anyway."
      ]
    },
    {
      h2: "What we do instead",
      paras: [
        "We work out the heat load from the glazing, the orientation, the construction and how many people use the room, and we select the unit to match that rather than to match a budget. We agree the indoor and outdoor positions with you on site before anything is cut, because the position of the condenser is the decision your neighbours will remember.",
        "The pipework is brazed under a nitrogen purge, pressure tested, then vacuumed down and held to prove it is tight before any refrigerant goes near it. The condensate falls are checked with a level rather than by eye. The commissioning readings are written down and handed to you, and the manufacturer warranty is registered in your name, which on most of the equipment we fit runs to seven years."
      ]
    },
    {
      h2: "What it is often confused with",
      paras: [
        "A portable unit and a fixed split are not the same product. A portable dumps its heat through a hose in a window that has to stay open, which is why it never gets a bedroom properly cool on a hot night. A through-wall monobloc avoids the outdoor unit but is noticeably louder inside, because the compressor is in the room with you.",
        "Air conditioning is also confused with ventilation. Cooling a sealed room does not make the air in it fresh, and if your real problem is condensation or stale air, extract ventilation or heat recovery is the right answer and we will say so rather than sell you cooling."
      ]
    },
    {
      h2: "What moves the price",
      paras: [
        "The number of rooms, the capacity of the unit, how far the indoor unit is from a sensible condenser position, and how much making good the route needs. A ground floor room with the condenser directly outside is the cheapest install we do. A third-floor bedroom in a period house, with the pipe route boxed through a stairwell and the condenser on a flat roof reached by ladder, is a different job with a different price.",
        "Access matters more than most people expect, and so does the electrical supply: a spare way in the consumer unit is straightforward, a new circuit run across the house is not."
      ]
    }
  ],
  ctaHeading: "Have the heat load worked out, not guessed",
  ctaBody:
    "We size from what the room actually gains, not its floor area, and quote the unit, the pipe route, the condensate fall and the making good as one fixed figure.",
  faq: [
    { q: "How long does an installation take?", a: "A single split in a straightforward room is usually a day. Awkward pipe routes, upper floors and anything needing scaffold or a lift take longer, and we say which yours is when we quote rather than afterwards." },
    { q: "Will it be noisy?", a: "Indoors, quieter than a fridge on its lowest setting. Outdoors is the one worth thinking about, because the condenser sits near somebody: we site it for the neighbour as well as for you, and tell you the sound level before it goes in." },
    { q: "Does it heat as well as cool?", a: "Every system we fit does both. Run in reverse it is an air to air heat pump, and in a room you already heat with electricity it is the cheapest heat you can buy." }
  ],
  related: [],
  reading: []
};
