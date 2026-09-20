/* Air Conditioning Repairs and Regas, CoolRight. Carried over from the standalone repo with its copy
   unchanged, reshaped to the fields the shared templates read: sections were
   {h, p} there and are {h2, paras} here. The questions are new: CoolRight kept
   nine site-wide ones, which would have become seven copies of one FAQPage
   across these pages, so those moved to the home page and each service
   answers what is actually asked about it. */
export default {
  slug: "air-conditioning-repairs",
  site: 'ac',
  name: "Air Conditioning Repairs and Regas",
  title: "Air Conditioning Repair and Regas | London and the South East | CoolRight",
  metaDescription:
    "Not cooling, leaking, tripping out or noisy. Leak detection, component replacement and recharge to the correct weighed-in charge, by F-Gas registered engineers.",
  h1: "Air conditioning repairs: diagnosed before it is quoted",
  intro:
    "Not cooling, leaking water, tripping the breaker, showing a fault code, or noisy in a way it never used to be. Those five cover most of what people ring us about, and they have very different causes and very different costs. We diagnose before we quote, because a price given over the phone for a fault nobody has looked at is a guess that gets corrected upwards later.",
  sections: [
    {
      h2: "Why a regas on its own is the wrong answer",
      paras: [
        "A sealed refrigerant circuit does not consume refrigerant. If a system is low, it has a leak. Topping it up gets you a working system for a season and the same phone call next year, at which point you have paid twice and vented refrigerant into the atmosphere in between.",
        "So we find the leak: pressure testing, electronic detection, and dye where the circuit needs it. Then we repair the joint or replace the component, pull a proper vacuum, and recharge to the weighed-in charge the manufacturer specifies rather than to a gauge reading and a guess."
      ]
    },
    {
      h2: "The faults we see most",
      paras: [
        "Blocked condensate drains, which present as water down the wall rather than as a cooling problem at all. Fouled coils, which present as poor performance and are a cleaning job rather than a repair. Failed capacitors and contactors, which are cheap parts and a short visit. Control boards, which are neither.",
        "Compressor failure is the one that changes the conversation, because on most domestic equipment the part and the labour together approach the cost of a new system with a fresh warranty."
      ]
    },
    {
      h2: "When we will tell you not to repair it",
      paras: [
        "If the equipment runs on R22, it cannot lawfully be topped up with that refrigerant at all, and a so-called drop-in replacement is a compromise on a system already past its life. If the compressor has failed on a unit over about ten years old, or if the original installation is poor enough that we cannot warrant our own repair on top of it, we will say that a replacement is the better spend.",
        "We would rather lose a repair and be trusted with the replacement than take four hundred pounds for work we expect to fail."
      ]
    },
    {
      h2: "What moves the price",
      paras: [
        "Whether the fault is diagnosed on the first visit, which it usually is, and whether the part is a stock item or a manufacturer order. Intermittent faults cost more because they take longer to pin down, and an honest engineer will tell you that before starting rather than after.",
        "Access is a factor again: a condenser on a flat roof or a high wall needs the right access equipment, and that is priced in rather than sprung on you afterwards."
      ]
    }
  ],
  ctaHeading: "Get the fault found before anything is replaced",
  ctaBody:
    "A system low on refrigerant is a system with a leak. We find it, price the repair, and tell you plainly when the honest answer is that the unit is not worth it.",
  faq: [
    { q: "Can you just regas it?", a: "We can, and on its own it is money thrown away. Refrigerant is in a sealed circuit and does not get used up, so a system that is low has a leak. Topping it up without finding that leak means paying again next summer, and venting refrigerant is an offence besides." },
    { q: "How do you find a leak?", a: "Pressure test first, then electronic detection and, where needed, ultraviolet dye. It is slower than guessing and it is the only way to quote a repair rather than an experiment." },
    { q: "When is a repair not worth it?", a: "Old systems on discontinued refrigerant, corroded coils, and compressors that have run low on charge for a long time. We will tell you when the repair costs a meaningful share of a replacement that would run cheaper." }
  ],
  related: [],
  reading: []
};
