/* Multi-Split Systems, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "multi-split-systems",
  site: 'ac',
  name: "Multi-Split Systems",
  title: "Multi-Split Air Conditioning Systems | London and the South East | CoolRight",
  metaDescription:
    "Multi-split systems serving two to five rooms from one outdoor unit. Sized on simultaneous load, installed and commissioned by F-Gas registered engineers across the South East.",
  h1: "Multi-split air conditioning: several rooms, one outdoor unit",
  intro:
    "A multi-split runs two to five indoor units from a single outdoor condenser. For a whole house, or a flat where roof and balcony space is limited and a condenser per room is out of the question, it is usually the right answer and sometimes the only one a freeholder will agree to.",
  sections: [
    {
      h2: "Why sizing matters more here",
      paras: [
        "On a single split the sum is simple: one room, one load, one unit. On a multi-split it is not, because the rooms are rarely all in use at once. Add the room totals together and you buy an outdoor unit far larger than the house will ever ask for, which costs more, takes more space and, counter-intuitively, runs less efficiently because it spends its life cycling at the bottom of its range.",
        "We calculate the simultaneous load instead: what the house actually demands at the same moment, on the worst afternoon of the year, given how the rooms are used. Bedrooms that only run overnight and an office that only runs on weekdays do not add up the way a spreadsheet of floor areas suggests."
      ]
    },
    {
      h2: "The constraints that decide the design",
      paras: [
        "Every indoor unit needs a refrigerant pair and a condensate route back to somewhere it can drain, and on a multi-split those runs all converge on one position. In a flat that usually means a service void, a boxed corner or a run through a cupboard, and the honest answer is sometimes that the fifth room cannot be served neatly and would be better with its own small system.",
        "Branch boxes and pipe lengths have manufacturer limits. Exceed them and the system is out of warranty whether or not it appears to work, which is one of the more common problems we find on systems installed by somebody else."
      ]
    },
    {
      h2: "What it is often confused with",
      paras: [
        "A multi-split is not a VRF system. VRF is the commercial equivalent, with far more indoor units, more sophisticated control and a price to match, and it is the right specification for an office floor rather than a four-bedroom house. Being sold VRF for a home is unusual; being sold a multi-split for a building that really needs VRF is not.",
        "It is also not the same as several single splits. Several singles give you independent systems and independent failure, at the cost of a condenser for each. Where there is space, and particularly where one room is used very differently from the others, that can be the better buy, and we will say so."
      ]
    },
    {
      h2: "What moves the price",
      paras: [
        "The number of indoor units, the total pipe run, and how much of that run can be concealed. The capacity of the outdoor unit follows from the simultaneous load rather than from the number of rooms, so two houses with four bedrooms each can need noticeably different equipment.",
        "Access to the condenser position is the other large factor: a balcony reached through the flat is straightforward, a flat roof reached by scaffold is not, and consents from a freeholder or a managing agent take time we would rather build into the programme than discover halfway through."
      ]
    }
  ],
  ctaHeading: "Have the whole system designed at once",
  ctaBody:
    "Several rooms on one outdoor unit only works if the sizing and the pipe runs are designed together. We survey the lot and quote one figure.",
  faq: [
    { q: "How many rooms can one outdoor unit serve?", a: "Commonly two to five, depending on the unit and the total load. What decides it is the combined demand and the pipe runs, not the number of rooms on a plan." },
    { q: "Can every room have its own temperature?", a: "Each indoor unit is controlled separately, within a limit: rooms on one outdoor unit share a mode, so one cannot heat while another cools unless the system is designed for it. We tell you which you are buying." },
    { q: "Is it cheaper than separate systems?", a: "Usually, and not always. One condenser, one set of consents and one install is normally less than three of each, but a long pipe route to a distant room can undo that. It is worth pricing both ways, which we do." }
  ],
  related: [],
  reading: []
};
