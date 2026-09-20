/* Air Conditioning Servicing, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "air-conditioning-servicing",
  site: 'ac',
  name: "Air Conditioning Servicing",
  title: "Air Conditioning Servicing and Maintenance Plans | CoolRight",
  metaDescription:
    "Annual and six-monthly air conditioning servicing across London and the South East. Filter and coil cleaning, drain treatment, refrigerant and electrical checks, readings recorded.",
  h1: "Air conditioning servicing, before the hottest day of the year finds the fault",
  intro:
    "An air conditioning system that is never serviced does not fail suddenly. It loses efficiency quietly for several years, costs a little more to run every season, and then stops on the hottest day of the year, which is also the day every engineer in the region is already booked.",
  sections: [
    {
      h2: "What actually degrades",
      paras: [
        "Filters block, which starves the coil of air and drops both output and efficiency. The indoor coil fouls with dust and, in a kitchen or a salon, with grease, which insulates the surface that is supposed to be exchanging heat. The condensate tray grows biofilm, which is what produces the smell people notice before anything else, and eventually blocks the drain.",
        "The refrigerant charge drifts too. A system does not use refrigerant, so a system that is low has a leak, and running undercharged is hard on the compressor, which is the expensive part."
      ]
    },
    {
      h2: "What a service visit covers",
      paras: [
        "Filters cleaned or replaced, indoor and outdoor coils cleaned properly rather than wiped, the condensate tray and drain cleared and treated, the electrical connections checked and tightened, and the refrigerant circuit checked for leaks. Then we take performance readings, write them down, and keep them.",
        "The readings are the part that pays for itself. One set of numbers is a snapshot; three years of them show decline while it is still cheap to fix, which is the difference between a filter clean and a compressor."
      ]
    },
    {
      h2: "How often, and why the interval differs",
      paras: [
        "Annually for a domestic system, six-monthly for a commercial one that runs hard, and six-monthly for anything in a kitchen, a salon, a gym or a comms room where the air is dirtier or the consequence of failure is larger.",
        "Most manufacturer warranties require documented servicing. A system that has never been serviced has, in practice, no warranty left, which people usually discover at the point they need it."
      ]
    },
    {
      h2: "Plans, and what a plan is not",
      paras: [
        "A maintenance plan with us means scheduled visits, the records kept for you, and priority on the diary when something does go wrong. It is not an insurance policy and we do not pretend it is one: parts and repairs are quoted when they are needed, and the plan covers the servicing rather than every possible failure.",
        "We service systems we did not install, with one caveat: if we find something in the original installation we cannot warrant, we will tell you plainly, price putting it right separately, and leave the decision with you."
      ]
    }
  ],
  ctaHeading: "Book the service before the hot spell",
  ctaBody:
    "Filters, coils, condensate and charge, checked and recorded. Systems above the F-Gas thresholds get their statutory leak check and the logbook entry that proves it.",
  faq: [
    { q: "How often does it need servicing?", a: "Annually for a domestic split in normal use, and more often where the system runs year round, sits in a dusty place or serves a comms room. The interval is about the duty it does, not the calendar." },
    { q: "Is a leak check a legal requirement?", a: "Above certain refrigerant charges, yes, and it is the operator of the equipment who carries that duty rather than the engineer. We tell you which side of the threshold your system falls and keep the record either way." },
    { q: "Does servicing keep the warranty?", a: "Usually it is the condition of it. Most manufacturers require documented annual servicing, and a warranty claim on a system with no service history is the claim that gets declined." }
  ],
  related: [],
  reading: []
};
