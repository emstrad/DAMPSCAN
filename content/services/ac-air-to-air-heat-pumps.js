/* Heating and Air to Air Heat Pumps, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "air-to-air-heat-pumps",
  site: 'ac',
  name: "Heating and Air to Air Heat Pumps",
  title: "Air to Air Heat Pumps and Air Conditioning Heating | CoolRight",
  metaDescription:
    "Modern inverter air conditioning is a reversible air to air heat pump. Sized for the heating load as well as the cooling load, installed across London and the South East.",
  h1: "Air to air heat pumps: the cheapest way to heat a room you already own",
  intro:
    "Every inverter air conditioning system we install is a reversible air to air heat pump. Run in reverse it takes heat from outside, even on a cold day, and moves it into the room. Because it is moving heat rather than making it, it delivers roughly three to four units of heat for every unit of electricity, where a panel heater delivers one. A great many of our clients come to us for cooling and end up using the system mostly in winter.",
  sections: [
    {
      h2: "Where it makes obvious sense",
      paras: [
        "A loft conversion, a garden room, a glazed extension or a single cold bedroom at the end of a long heating run. These are the rooms a wet central heating system serves worst, and extending pipework to them is disruptive and expensive. A heat pump serving that one room costs far less to install than the equivalent radiator run and far less to run than the electric heater it replaces.",
        "It also suits a flat with electric heating and no gas, where the comparison is not against a boiler at all but against panel heaters running at full price."
      ]
    },
    {
      h2: "Where it is not the answer",
      paras: [
        "A whole house with an efficient gas boiler and decent radiators is a harder case, and we will tell you if the sums do not work. Air to air heat pumps also do not heat water, so you still need something for hot water, and they do not currently attract the grant funding that air to water systems do under the Boiler Upgrade Scheme.",
        "A poorly insulated room is a poor candidate whatever heats it. If the honest answer is that your money is better spent on loft insulation and draught proofing first, that is what we will say when we visit."
      ]
    },
    {
      h2: "Sizing for two seasons rather than one",
      paras: [
        "A unit sized purely for cooling is often undersized for heating, because a room loses more heat on a cold January night than it gains on a hot July afternoon. Capacity also falls as the outside temperature drops, so the figure on the box is not the figure you get in the weather that matters.",
        "We size for both loads, specify equipment rated for low ambient heating where the room needs it, and set the controls up so the system is genuinely usable year round rather than something that gets switched on for two weeks in August."
      ]
    },
    {
      h2: "What moves the price",
      paras: [
        "Mostly the same things as any other install: capacity, pipe run, condenser position and making good. Equipment rated to keep its output in genuinely cold weather costs more than equipment that is not, and for a room you intend to heat all winter that is money well spent.",
        "We give indicative running costs for whatever we propose, based on how you actually intend to use it rather than on a best case, because a running cost quoted from the specification sheet is not a running cost anybody experiences."
      ]
    }
  ],
  ctaHeading: "Find out whether it suits your room",
  ctaBody:
    "We look at what the room loses in winter as well as what it gains in summer, and say plainly where a heat pump is the wrong answer.",
  faq: [
    { q: "Is it cheaper than my electric heaters?", a: "Considerably. A heat pump moves heat rather than making it, so it delivers several units of heat per unit of electricity. Against panel heaters or an immersion-fed system the difference is large and immediate." },
    { q: "Does it work when it is freezing outside?", a: "Yes, with less output than on a mild day. Sizing for winter rather than for summer is the whole trick, and it is the thing most often got wrong by somebody selling cooling." },
    { q: "Will it replace my central heating?", a: "For one room or an extension, often. For a whole house it is a different conversation and frequently not the right one, and we will say so rather than sell you seven indoor units." }
  ],
  related: [],
  reading: []
};
