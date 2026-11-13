# DampScan staff area and sites: the rules

Read this before changing anything. It records how the four businesses run
today and the owners' decisions behind it. A change must keep every rule
here unless the owner (Scott) asks for a different one in so many words; when
he does, update this file in the same change. `test/guardrails.test.js`
enforces the mechanical ones in CI.

## The businesses
- **DampScan** (dampscan.co.uk, Kent): damp survey and report only,
  independent, no remedial work sold. Public address is "East Malling, Kent
  ME19" only; never publish the street (service-area Google profile).
- **ATi Damp Survey** (atidampsurvey.co.uk, London). Runs Google Ads.
- Neither damp site mentions or links to the other (the owner's choice,
  6 Nov 2026: a caller doubted they were separate). No "sister practice",
  no shared email (DampScan shows none; its contact is a "Send us a message"
  link to the form, and its backup email goes from the server only), page
  roots carry a code (data-site s1, s2) so the shared files name neither
  brand, and on each host the other's raw files are not found (middleware.js).
- **Verge Roofing** (vergeroofing.com) and **CoolRight** (coolright.co.uk):
  quoted trades, their own pipelines. Each business keeps its own workflow;
  never merge pipelines.
- Never touch, merge with or send to Surveymate. Resend is Surveymate's;
  nothing here sends email through it unless the owner says otherwise.
- Enquiry alerts are ntfy plus the installed staff app's own notification
  (both for every enquiry; Settings lists whose phones have it on). The email
  is only a backup copy through FormSubmit: everything on the form (the
  agent on its own lines), then a short UPDATE email for a time picked or a
  survey chosen after Book. Microsoft 365 sending
  (`lib/m365-email.js`) is off because the GoDaddy-run tenant refuses it;
  LEAD_EMAIL_M365=on turns it back on.
- Nothing is ever sent to a customer automatically: messages are words with
  tap-to-send links, emails are drafts the person checks and sends.
  The one exception the owners chose (11 Nov 2026): customer texts through
  Twilio (`lib/texts.js`, `lib/text-words.js`, `lib/text-pick.js`,
  `lib/text-nudges.js`), seven steps, each worded for the situation as it
  goes (the owner's rules, 13 Nov 2026): 1 enquiry received (no time picked;
  a time asked for, only with Book it straight away off; or the estate agent
  letting us in; with the time picker on it waits ten minutes and is dropped
  if they booked online meanwhile, whose booked text goes at once; once a
  week per number), and a half-finished form with a mobile gets one polite
  "can we help?" ten minutes after they stop (held while still typing,
  dropped once they finish or book, once a month per number, never a sales
  text, a landline makes no to-do), 2 booked with the deposit link ("we've
  confirmed it with your estate agent" when the agent has the keys), with one
  deposit reminder two days after booking while the survey is over a day
  away, 3 payment received (a deposit or part, paid in full, before or after
  the visit; from Revolut, a matched transfer or a tick by hand), 4 the survey
  morning at 7 (asking for the deposit when unpaid, the agent letting us in
  said; none if booked or moved that day; no evening-before text), 5 report
  ready (balance due, or ready to view when paid), with one reminder three
  days on while the balance is owed, 6 your report once paid, 7 survey moved
  ("as you asked" for the time they asked for on their page, or agreed with
  their agent). Reminders are queued by the hourly run between 10am and 6pm.
  Dates read "today" and "tomorrow" where they are.
  Never on a cancellation, never to an estate agent. One outbox: a text from a
  staff change waits two minutes (an undo or second change cancels or
  replaces it), one the customer caused goes at once; each is checked again
  and worded just before it goes, once per survey, kind and moment; a change
  to a payment or report more than two days old never texts. Sent from the
  brand name (TWILIO_FROM_ATI, TWILIO_FROM_DAMPSCAN); customers cannot reply,
  so each text is friendly and, once booked, points to their own page (pay,
  on my way, message us, ask to move) instead of a phone number (the owner's
  choice, 13 Nov 2026); the enquiry texts, with no page yet, give the number. Off until SMS_AUTO=on with
  TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN; while off the outbox keeps what
  would have gone, and SMS_TEST_TO sends everything to one test number. The
  Texts page (managers, in the Companies sheet and the + menu), one company at
  a time, shows what is waiting (edit, send now, stop), what went and whether
  it arrived (Twilio's signed receipts; a failure is a to-do), and the wording
  per kind in the order a customer gets them, each opening as it lands on a
  phone (filled with an example) with its words and fill-ins beneath. A customer with
  no mobile (a landline or email only) gets no text; the owners get one to-do
  to email or call them instead. Length is no worry (the owner: a clear text pays
  for itself); the
  page link in a text is the short form (/m/<token>, middleware.js rewrites it
  to my.html). The go-live audit's rules (11 Nov 2026): no text between 21:00
  and 07:00 (it waits; SMS_QUIET_HOURS=off only in tests); the morning text
  goes from any hourly run 7 until noon, once a day, never once the visit has
  begun or for a time still with the agent; a booked text is held while the
  estate agent confirms and goes once they have; a rebooking is texted, a
  booked text still waiting carries a quick move; the report texts go once per
  survey ("your report" whenever the balance comes after "ready"); a text
  stopped on the Texts page stays stopped; the agent's own number is never
  texted; Twilio refusing a text is a to-do; any staff request sends texts
  whose two minutes are up. Every survey counted as texted for its money once,
  before switching on. test/journey-dryrun.test.js runs one customer from booking to
  report with a pretend Revolut and Twilio; keep it passing.

## People and access (enforced on the server)
- Managers: Scott and Tom. Tom (manages ATi, DampScan) has his own login;
  Scott uses the owners' code. Surveyors: scott, tom, ben, ronnie.
- Work level, everywhere (Ronnie and Ben, the owner's choice 6 Nov 2026):
  the surveyors' staff area (`public/staff/worker.js`, `lib/worker-view.js`).
  Today lists only their own jobs (surveyed by them or assigned to them),
  their holds and their to-dos, never the company's money sections; the
  phone's bottom bar is Today, My hours, + (centred), Route and Search
  (Route is `day.html` as "My route": their own surveys in order with the
  drive from home, between each and home again, `lib/day-route.js`); the +
  menu is only Turn on notifications, Refresh and Sign out; no company
  tabs or pages (anything else sends them to Today). They never see money,
  but every customer's contact details are open to them, so a survey handed
  over at short notice can be reached before it is reassigned. They may
  only mark Surveyed and Report sent (on their own surveys, never a money
  step), attach a report and tap On my way; their Report sent ("Report done")
  never reaches the customer: it is submitted for an owner to check, with one
  owners' to-do and an alert, and goes only when a manager presses Report
  ready (`lib/report-check.js`, the owner's choice, 13 Nov 2026); ChatGPT read-only
  plus those marks; no owners' alerts, only their own diary (below).
- Every filter lives on the server (`lib/figures.js`, `lib/work-only.js`),
  never only in the page. A work-level person reads only what their own pages
  use (`allowedRead`): every company route (money and rates, customers,
  enquiries, insights, Scheduling, the bank) refuses them. Their search hits
  are Call and Email chips, since they have no company pages.

## Hard technical limits
- Vercel Hobby: at most 12 files under `api/`. New endpoints go into an
  existing dispatcher (`api/admin/[action].js`, `api/cron/[task].js`).
- Vercel crons run once a day only (06:30 digest run, 17:00 evening run,
  London time all year). Each is listed twice in vercel.json, once per UTC
  hour (05:30 and 06:30, 16:00 and 17:00, with ?utc=H on the path), and the
  handler skips the one that is not London's hour (`lib/routes/cron/london-hour.js`).
  The evening route check is sent once per surveyor and day (route_sent).
  Anything hourly goes through `.github/workflows/report-due.yml`, which runs
  only in the VERTISE-DEV/DAMPSCAN mirror, where CRON_SECRET is kept.
- `db/schema.sql` is re-applied on every merge: every statement idempotent
  (`if not exists`, `on conflict`, guarded `do` blocks). Add new tables to the
  list in `test/migrate.test.js`.
- The repo is public: no secrets, keys or tokens in code, ever. Use env vars.
- Never store raw IPs (hash with IP_SALT).

## Writing code
- British English. No em dashes anywhere (CI checks). Files under 300 lines;
  split into a sibling module instead. Comments say why, not what. Match the
  surrounding style: plain DOM in `public/staff`, no framework, no build step.
- No model names in commits, PRs or code.
- Motion is shared site wide (`public/assets/motion.css`, imported by
  header.css and the staff shell.css): quick ease-out transitions, a press on
  taps, choices settle, pop-ups rise, steps slide in, nothing when the device
  asks for reduced motion. Keep new motion there, short (under 300 ms).
- Every staff page must work on iPhone, iPad and desktop: no sideways scroll,
  dialogs inside the viewport, 44px tap targets, 16px inputs.
  The websites too. `public/assets/fit.css` (imported with motion.css) keeps
  every field inside its box, iOS date and time fields included. Every pop-up
  fits the visible screen (dvh, not vh, for iOS) and scrolls inside itself.
  The booking form has no buyer box and no "report needed by" (removed by the
  owner). It is one small question per screen, nothing to scroll: you (name,
  email, postcode), the problem, the property (address typed by hand, no
  address finder, then "Phone number", optional with no hint text), "Who will
  let us in?" (damp sites: Me or The estate agent, a sliding two-way switch;
  the agent's name, phone and optional email
  only for the agent, kept in the enquiry notes, and the time picker skipped
  since the time is confirmed with the agent), then photos, a note and a
  previous survey, all optional. Phone boxes take only digits, spaces and a
  leading +, and must be a UK number of the right length (11 digits).
- Run `TEST_DATABASE_URL=postgresql://dampscan:dampscan@127.0.0.1:5432/dampscan npm test`
  (mass failures mean local Postgres died: `service postgresql restart`),
  `npm run build:check`, and the em dash check before pushing.
- Ship through a PR to main, wait for CI to pass, then merge. Never merge red.

## How every page is built (locked in by the owner, 28 Oct 2026)
Everything new, and every change, follows these. `test/guardrails.test.js`
checks the mechanical ones.
- Urgent first. Each screen leads with what needs doing now (Needs you now,
  the one next step, Nobody in touch yet); everything else is one tap away
  in a folded line. Nothing important is ever hidden, only folded.
- No explaining paragraphs. Headings and labels say enough; an empty state is
  a few words ("All matched."). Only a where-it-lives pointer or a warning
  before a change may stay (at most four on staff pages, guardrail-counted).
- Calm and compact: contacts and maps as one row of small chips; the number
  or email written small beneath; dark theme fields everywhere.
- One customer, one journey. Every page reads the same stage (`lib/journey.js`)
  and offers the real next steps (Move to: New, Contacted, Waiting, Gone cold,
  Booked, Not going ahead; Unbook). Nothing about a customer is ever deleted
  by a step; it is moved, closed with a reason, or cancelled, and logged in
  their history. A new feature joins this journey rather than starting its own.
- One card per customer everywhere (the job pop-up and the Scheduling card),
  never a new kind of card.
- Never a coloured stripe on one edge of a card or box (a thick top or side
  border in an accent colour), anywhere on the sites or the staff area (the
  owner's hard no). Flag a card with its whole outline or a small tag.
- Shared look: motion.css and fit.css on every page; anything marked hidden
  stays hidden (no empty pills); 44px taps, 16px inputs, pop-ups inside the
  visible screen; checked at phone size before shipping.
- Nothing reaches a customer by itself (see The businesses).

## Alerts (staff app, texts, ntfy being retired)
- The owner is retiring ntfy (31 Oct 2026). Every alert ntfy got goes to the
  installed staff app too (`lib/notify.js`): to the owners' code and the
  managers of that business only, never a work-level person; an owner in
  APP_DIARY_ONLY (default Ben) hears only their own diary. Each surveyor's
  diary (booked, moved, taken off, cancelled, pencilled or requested, and the
  evening route check) goes to whoever signs in under that first name
  (`pushToSurveyor`, lib/push.js). Routine staff changes stay quiet. A to-do
  set for one person buzzes only them. Removing NTFY_TOPIC (and the
  NTFY_TOPIC_<NAME> feeds) in Vercel switches ntfy off; nothing else changes.
- Alert texts to the owners (`lib/staff-sms.js`, Scott and Tom, ALERT_SMS_TO
  with the Twilio details): a new website enquiry, a time picked online, and
  from a customer's page a message (who, never their words) or a move asked
  for, only; with the customer's number to tap (the owner's choice) and a link to
  their card; never a street. ntfy and the app still go too.
  Everything else stays in the app and the morning summary.
- Customer details in alert text: first name and postcode district only.
- Off by the owner's choice: the 06:30 "Good morning" digest push
  (`MORNING_DIGEST=on` restores) and the evening "Tomorrow" push
  (`EVENING_DIARY=on`).
- Change alerts say only what happened ("Booked Kim for Tue 20 Oct at
  09:00."); title is the business, plus a colleague's first name when it was
  them. Never "Owners", never "via ChatGPT". Changes to one job within a
  minute are one alert (per-job ntfy sequence id, 1 minute delay).
- Change alerts are kept in the app (the notifications row, for catch-up and
  the digest) and only pushed to ntfy with ACTIVITY_PUSH=on, to protect the
  ntfy daily limit for enquiries. After a 429, pushes below priority 4 are
  skipped for a minute; priority 4 and up are always tried.
- On: new enquiries (a damp one opens its Scheduling card; one untouched two
  hours in working hours is nudged once, `lib/enquiry-nudge.js`), report overdue (24h after survey end, with Report sent
  button), survey not paid in full (morning after, with Paid/Deposit
  buttons), overdue invoices, half-finished forms, to-dos, competitor watch.
- Alert buttons use signed, 3-day tickets (`lib/quick-action.js`).
- ntfy.sh's free tier has a daily message limit (anonymous: per sending IP,
  shared on Vercel); past it every push is refused with 429. Each refusal's
  reason is kept (notifications.push_error) and shown in Settings, "Are alerts
  getting through?". NTFY_TOKEN (an ntfy account, paid tier for headroom)
  takes the limit off the shared IP.
- Each surveyor's own feed (`lib/surveyor-alerts.js`): the owners (Scott,
  Tom) keep the main topic with everything; NTFY_TOPIC_BEN, NTFY_TOPIC_RONNIE
  (and NTFY_TOPIC_TOM if wanted) only hear their diary: booked for them,
  moved, taken off them, cancelled, and times pencilled or requested for
  them. Hooked once in lib/activity.js, so every route and ChatGPT count;
  surveyor_told stops repeats. First name and district, never money.

## Staff area behaviour the owners chose
- Today is a vertical week timeline; jobs without a confirmed date sit in
  "Not booked in yet", never on today. Below it only: Collect deposit,
  Collect paid in full, Send survey report (and CoolRight warranties).
- A damp survey whose day has passed with nothing paid is under Collect paid
  in full even while still "booked".
- Timeline cards show survey type and surveyor; cards show phone and email.
- To-do list: newest first by when it came in, each with how long it has
  been waiting.
  Above it, "Customers who need something" (`public/staff/todo-clients.js`):
  everything outstanding from lib/work.js gathered into one card per
  customer, late first, with Call and Open.
- Survey cards show a small report countdown (24h from survey end, red when
  over) until the report is ticked sent. Survey end is the start plus the rate
  card's minutes on site (an untimed survey ends with its day); the board,
  Today, Reports and the overdue alert all use this one deadline (lib/surveys.js).
- Jobs page: totals are ATi and DampScan surveys only; earnings count surveys
  whose day has come; booked ahead, paid and still to pay shown apart. The
  hand form and the plain list of every job are folded away (ChatGPT books
  jobs now); the tab is "Money and rates". Clients is the "Customers" tab:
  everyone first (then upcoming, past), repeat customers tagged, and a damp
  customer opens the one customer card.
- Leads stays the marketing view (failed forms, landing pages, sources) and
  is joined to the work: each enquiry shows "Where now" (its stage, opening
  the customer), the old Stage column is "Form" (Sent or Partial), and "What
  enquiries turned into" (`lib/lead-outcomes.js`) gives enquiries, booked,
  paid and (managers) money by landing page and by source, phone callers
  apart. A part-finished ATi or DampScan form has "Book them": it becomes a
  full enquiry in New on Scheduling (noted in its history) and its card opens.
  It no longer waits for anyone (the owners' choice, 10 Nov 2026): step 1 is
  saved quietly on the server the moment it is filled in (no email, no alert;
  the finished form replaces that draft), and a form left half done for half
  an hour becomes a Scheduling card in New by itself, flagged "Didn't finish
  the form", with one alert (`lib/partial-cards.js`: when Scheduling loads,
  hourly, on each new form and the daily runs). Not when the same visit, email
  or phone finished the form or is already booked. Leads still reads it as
  Partial, and it never counts as a website booking.
- Insights opens with all time: total earned, what every enquiry booked
  would have made, and what every unique visitor booked would have made,
  both at the average job won (managers only, `lib/potential.js`).
- Records page celebrates all-time damp stats; money only for managers.
- One list, one next step per customer (the owners' choice, 10 Nov 2026,
  `lib/next-contact.js`): every call, email or text logged (Scheduling card,
  ChatGPT's log_call, filed emails, the inbox scan) sets when to get back to
  them: two working days by default, or Tomorrow, Next week, a date or No
  follow-up (the Chase choice beside the log box). An email from them is "Reply to their
  email", due today; one from us waits two working days. Due ones are the "Get
  back to" group in lib/work.js (so the To-do list, "Customers who need
  something" and Today), Scheduling's "Needs you now" and a board flag. Booking
  clears it. A to-do can sit on an enquiry (todos.lead_id): shown on its
  Scheduling card with tick boxes and an add box, found by ChatGPT's add_todo
  from the customer's words, and moved onto the job when booked. Owners see
  every follow-up.
- To-dos linked to a customer show as a small "N to-dos" tag on the timeline
  and board cards, and as a list with tick boxes and an add box in the Today
  pop-up and the client card (`public/staff/job-todos.js`).
- Reports page (ATi & DampScan): every survey done and not reported, oldest
  first, with countdown, upload, Report ready (texts 5 or 6 after the two
  minutes; their page unlocks it once paid in full), Hold (managers: locked on
  their page and no texts until let go, then the ready text goes if it never
  did), "Draft email in ChatGPT" and Report sent. The job pop-up has the same
  in its Report section (`public/staff/pop-report.js`; surveyors upload and
  tick Report sent, Ready and Hold are the managers'). Report ready is refused
  until the file is uploaded, and counts as reported everywhere (stage,
  countdown, overdue alert, Reports list once paid) (the owner's review,
  13 Nov 2026).
- Client card shows "What has happened" (`lib/timeline.js`) and offers to link
  the same person's unlinked website enquiry (`lib/duplicates.js`).
- Friday morning: one alert for work done over a week ago and not paid.
- My hours (`lib/hours-store.js`) is a calendar: tap the days (or Weekdays,
  Weekends), then tap the hours (All day, Morning, Afternoon, Evening, Not
  available, My usual week, or any from and to) and they save at once. Below,
  the usual week is one tap per weekday and fills every future week; a day set
  on the calendar keeps what was picked (the usual week can be learnt from
  what they have been setting). A day with no hours means not available. Free times are
  one hour starts from two days ahead, never inside the drive to or from a
  booked survey, never on a day with an untimed booked survey, never a time
  an enquiry holds. The booking form is always filled in; picking a time is
  only offered at the end, and only once the owners switch it on after the
  Lab. The Lab (owners only) previews that picker for any postcode and the
  survey quiz (ATi and DampScan share one price list).
- The website time picker (`lib/web-booking.js`, `public/assets/book-times.js`,
  through `api/lead.js` op times/pick) uses the same best-fit engine as the
  phone: the customer's postcode, real drive, no hop over 75 minutes, two
  days' notice, nothing after a buyer's deadline, surveyor never shown. The
  customer picks a day first (every day with a free time, in order), then
  sees every free on-the-hour start that day (`dayTimes`). Patches
  (`lib/patches.js`): Tom covers London, Ben and Ronnie Kent (Bexley's DA
  districts are London, Dartford's are Kent); a time goes to the patch
  surveyor first, then whoever else can reach it, else it is not offered.
  Brands do not matter. The day's limit is only hours, survey length and
  drive. Booked straight away (the owner's choice, 13 Nov 2026, Lab switch
  instant_booking, `lib/instant-book.js`): the customer chooses the survey
  first ("not sure" still gives the size, booked as a damp survey of that
  size), is offered only times that fit that survey's real length and extras,
  and the time tapped is booked there and then through the same path as
  Scheduling's Book it in (surveyor told, booked text with the deposit link);
  never a request, and a time taken a moment before shows the fresh times.
  With the switch off, picks stay requests (the customer is told it is not
  booked until we call to confirm); the team confirms, decides who goes and
  sends the deposit by hand. The Lab shows the same. The form is saved before any
  of this, so leaving part way loses nothing and makes no second enquiry.
  Time first (least friction), then, with the Lab's survey quiz switch on,
  "What do you need?": damp survey, damp and timber, or not sure; then the
  size and add-ons, each with a small (i) saying what it is. A damp survey is
  always booked and checks are only ever added to one, never sold on their
  own (the owners' choice, 8 Nov 2026). Priced on the server from the one list, kept on the enquiry
  (survey_choice), shown on the Scheduling card and preselected when booking.
- One price list (`content/prices.js`, the owners' 13 Sept 2026 list with the
  size bands): damp £215, £295, from £375, from £450; damp and timber £310,
  £445 (the two larger bands assume +£150, "from"); invasive, camera and
  cavity checks added to a survey. The prices pages, the website's
  survey step and the Lab quiz all use it (test/prices.test.js). The prices
  page is kept simple: one table by size (damp, damp and timber), one table
  of extra checks added to a survey, and everything wordy folded
  away in tap-to-open sections. Minutes on
  site: 60, 120, 150, 180, set once on the rate card. The rate card also has
  damp and timber at each size (dt- keys), and the Scheduling booking form's
  Survey list shows each with its price. A pick is a request: checked again, held as a
  pencilled hold (chased after 48 hours) and alerted; the team confirms it on Scheduling.
- Survey length per survey type is on the rate card (Minutes on site,
  default 60) and every drive check uses it. Staff best times after a
  buyer's deadline are marked and listed last.
- Never two cards for one customer (the owners' choice, 10 Nov 2026). One
  rule, `lib/same-person.js`, for every way in (website form, half-finished
  form, + New customer, ChatGPT): the same email, the same phone (spaces, +44
  ignored), or, on half the details, the same first name at the same
  postcode, within one business. A second form folds the earlier open
  enquiry into the new one (`lib/merge-dupes.js`): its history, times wanted
  and hold move over, and any detail the new one lacks (phone, email,
  postcode, address) is filled in; the old one closes as a duplicate. A
  half-finished form, or a customer ChatGPT finds again, is merged into the
  existing card the same way (missing details filled, the history says so),
  or noted on their job card.
- Scheduling is the one overview for ATi and DampScan (Today and Surveys stay
  as they are): a week strip, the chosen day lane by surveyor (`lib/dispatch.js`:
  hours, surveys with the drive to the next, holds, free starts to tap or drop
  a card on), the To book board, and After the visit (surveyed not paid; paid,
  report to send). A survey opens the same job pop-up as Today.
- No map on Scheduling (the owners found it clutter). Each card to book shows the times to offer, best first, with why
  (`lib/best-fit.js`): who has hours, who is already near that day, then the
  start adding least driving, snug after the survey before; no drive over 75
  minutes between surveys; fresh days (nothing booked) after nearby ones.
- Home areas (`lib/homes.js`, area only, never a street): Ben and Ronnie
  West Malling, Tom Shooter's Hill. The first survey counts the drive from
  home and the last the drive back (up to two hours), shown on the day lane
  ; on an empty day the surveyor living nearer comes first.
- Every Scheduling card shows where contact stands at the top (the latest
  call, email, text or note with who and when, or how long it has waited with
  nobody in touch) and the times wanted; after a log the card is brought into
  view. An enquiry can be closed from its card with a reason (it stays on the
  Leads page).
- "+ New customer" on Scheduling (`lib/sched-create.js`): a caller becomes an
  enquiry card (source "phone") in Contacted with what they said, then their
  card opens with times to offer; the same phone or email already open is
  offered back first. Phone callers never count as website bookings in the
  Leads figures, and their channel reads "Phone call". The booking form has Today and Tomorrow, and a clash
  about missing hours links to that surveyor's My hours.
- One stage per damp customer (`lib/journey.js`): New, Contacted, Waiting for
  time, Pencilled, Booked, Surveyed, Report to send (paid, report owed), Report sent
  (not paid yet, on After the visit until paid in full), Paid (or Closed, Cancelled),
  worked out one way for every page; the job pop-up shows it. To-dos that the
  facts look to have overtaken (deposit, booking, report, payment) are never
  cleared on their own: the job pop-up asks "These look done now. Clear them?"
  and ChatGPT gets todosLookDone and asks before complete_todo (the owners'
  choice).
- Scheduling has a forgiving search (`public/staff/sched-search.js`) over the
  customers on the board: name, postcode, phone, email, address, message;
  typos and spacing forgiven; a result opens the customer card.
- Scheduling's board cards are compact: name, address, phone (tap to call),
  one status line (brand and the latest contact, or how long nobody has been in
  touch) and short flags (pencilled, best time, times wanted, agent, deadline).
  Everything else is in the card that opens on tap, kept clean and simple
  (the owner's choice, 10 Nov 2026): the name with brand, stage and times
  wanted beneath, a close cross; the one next step (or a quiet "Next contact"
  line); a hold or same-person to decide; Call, Text, WhatsApp and Email
  chips; a big "Book it in" with the best three times (why given once); one
  log box (what happened, when to chase, what was said); the to-dos (add box
  folded); then three folded lines: Their details (address, choice, problem,
  message, photos, times wanted, estate agent), Move or close (Move to,
  including Booked, then Not going ahead with a reason, never by mistake)
  and Everything so far (`public/staff/sched-card.js`, `sched-detail.js`).
- Tapping a Scheduling card opens the customer card (`public/staff/sched-card.js`):
  the basic details, times to offer, an add-to-history box, and everything so
  far newest first (`lib/correspondence.js`): calls, texts, notes, times
  wanted, emails in full, what the team did, and the survey's own facts
  (deposit, payments, paid in full, visit, report) from `lib/timeline.js`. An
  email with no subject is named by its first words. Emails are filed whole by
  ChatGPT's log_email (inbox sweep or pasted in). The same history, with its
  add box, is in the job pop-up (`public/staff/pop-history.js`, managers, as
  "History and notes": the job's note for the surveyor pinned at its top with
  its own Save, so there is no separate Notes box; surveyors keep theirs), and
  that pop-up is the one customer card everywhere: Today, Scheduling, Surveys,
  To-do, Reports (tap the name) and Clients (damp customers; "Edit details"
  still opens the client dialog). The automatic texts sit in the same history
  (sent, delivered, waiting, not sent, stopped, each with its words), with
  Report ready and On my way; with texts on there is no "Messages to send",
  only "Message by hand" for what texts never cover (asking the estate agent
  for a time; ATi's remedial quote offer). Every staff message about a move or
  a tick that texts the customer says so ("gets a text in 2 minutes: Undo
  stops it"), and an Undo back to the time they were told texts nothing. A
  live damp survey is never deleted (the server refuses; Not going ahead
  instead): only a cancelled one with no money on it.
- Scheduling (`lib/scheduling.js`, managers only) shows the whole enquiry
  (address, problem, message, photos). Every damp enquiry starts
  in New enquiry, moves to Contacted when a call, email or text is logged,
  then Waiting for time (times they want noted), then Booked into the normal
  flow. Any stage can be skipped. Booking checks the surveyor's My hours and
  their booked surveys, and only goes ahead anyway when the person says so.
- Pencilled times (`lib/pencils.js`): a time offered and not confirmed shows
  grey on Today and the week, is off the free list and never lets go by
  itself (the owners' choice, 11 Nov 2026): 48 hours with no yes makes it held
  until let go, with one to-do to chase them; a hold whose time has come goes
  back to Waiting with a to-do. Two customers may hold the same time; both
  show, flagged, and the first booked bumps the other back with a to-do.
  Book it in (and Move to: Booked) on a pencilled card starts with the
  pencilled day, time and surveyor filled in.
- Who's free (top of Scheduling, "Who's free?" on Today for managers):
  every surveyor's open starts for two weeks, grouped by day and person, for
  answering the phone. Same rules as the free list, booked and pencilled out;
  with the caller's postcode it uses real travel.
- Travel time (`lib/travel.js`, `lib/travel-guard.js`, `lib/road-times.js`):
  a survey is its rate card minutes plus 30 per extra (surveyMinutes, used by
  every check: the drive either side and inside their hours; the timings
  audit, 13 Nov 2026, found the checks assumed an hour) plus the drive to the
  next. The drive is the real road time (OSRM table, OSRM_URL, cached in
  drive_times) plus daytime traffic (+50% London, +30% in and out, +20%
  elsewhere) and 10 minutes to park; with no road time an estimate tuned
  against real roads; from postcodes (postcodes.io, cached in postcode_geo; an
  hour when unknown). Every way of booking a damp survey
  refuses a time inside it with the reason unless told to go ahead (force).
- Holds for a buyer waiting on the estate agent never lapse; someone lets them
  go by hand. A hold notes who pencilled it; pencilling a time someone else
  pencilled in the last ten minutes says so. A hold whose hours were removed
  or that a survey was booked over goes back with a to-do, unless it was
  pencilled anyway. The board flags the same person on two cards.
- Inbox scan (`lib/mail-scan.js`, hourly with report-due): reads sender,
  recipients, subject and preview (Graph Mail.Read, one mailbox), keeps only the
  subject on its one matching card (or a booked job's history; a new address
  by postcode); ambiguous ones are left for the ChatGPT sweep.
- Evening route check (`lib/route-check.js`, 17:00 run): each surveyor's day
  tomorrow in order with drives from home, between surveys and home again,
  to their own feed; a time too tight, a hop over 75 minutes, no time, no
  postcode or outside their hours is called out, and only those problems go
  to the owners.
- A survey cancelled, moved or handed over offers its gap to the customers
  still waiting who fit it best (`lib/cancel-fill.js`), one owners' alert.
- Every card's Move to offers every next step: New (enquiries), Contacted,
  Waiting for time, Gone cold (went quiet; folded at the end of the board, to
  try later), Booked, and Not going ahead (a reason; an enquiry closes, a job
  card is cancelled, never deleted). ChatGPT's move_on_board takes cold too.
- Estate agents on Scheduling: an enquiry keeps its agent too (leads.estate_agent_id,
  saved from the website form's agent line as the enquiry arrives, and for
  older enquiries the next time Scheduling loads, `agentFromLead`); the customer card
  shows the agent with Call agent and Email agent, and a folded box to add,
  change or remove one; booking carries the agent onto the job; the board
  card flags "Agent: name".
- One carry-over for every way of booking an enquiry (`lib/lead-booked.js`:
  Scheduling, the job pop-up, ChatGPT): the estate agent, the price of extras
  chosen online, the hold taken off, others on that time bumped. The job
  pop-up books an undated survey the Scheduling way (who is going, My hours,
  the pencilled time filled in). Enquiries being worked (Contacted, Waiting,
  Gone cold, held, or just put back) never age off the board; new ones after
  60 days. A repeat form carries the agent, survey choice and photos, and
  folds into an undated job card instead of making a second card. Not going
  ahead can be undone (Bring back to Scheduling). Unbook clears an old hold.
- The Scheduling booking form shows the extras from the one price list
  (`public/staff/sched-extras.js`, `lib/book-extras.js`), ticked with what the
  customer chose online, and the total (survey plus extras), which can be
  typed over. However a survey is booked, its extras are kept on the job
  (jobs.extras), written on its note ("Extras: ...") for the surveyor, and
  add 30 minutes on site each (EXTRA_MINUTES, jobs.extra_minutes) to every
  drive check, free time, day lane, route and report deadline. Changing the
  survey's size keeps the extras on top. The surveyor's fee stays the
  survey's (the owners' choice).
- A booked survey's type and price can be changed after booking
  (`lib/survey-change.js`, managers): the job pop-up's folded "Change survey
  or price" and ChatGPT's set_survey. A rate card survey sets its price and
  the surveyor's fee; a price in pounds overrides the price alone. Logged in
  the customer's history with what it was before.
- A booked survey can be unbooked from the job pop-up (Unbook, under the date):
  off the diary but never deleted; the card goes back to Scheduling, Waiting
  for time, with a note, and the surveyor and the gap are told.
- Kept uncluttered (the owner's choice): contacts and maps are one row of
  small chips, empty sections say nothing, ready messages and extra times
  are folded, and no staff page has explaining paragraphs under its
  headings (headings and labels say enough; empty states are a few words).
  Urgent first: Scheduling opens with "Needs you now" (a time picked online
  to confirm, a hold about to need a chase, a new enquiry untouched two hours); the
  job pop-up opens with its one next step (book, confirm the time, deposit,
  report, balance) and folds Notes, Enquiry, Photos, Messages, a changed date
  and History; the customer card leads with "Nobody in touch yet".
- Customer portal (`lib/portal.js`, `lib/portal-view.js`, `public/my.html`,
  `portal.js`, `portal-parts.js`, through `api/quote.js` doc=portal), ATi and
  DampScan: one private link per survey, 12 months from when it was made, a new
  one replacing the old. In each site's own palette (data-site s1, s2) and
  mark, sent by the server so the shared files name neither brand; only "Damp
  Surveying Limited" as the company. One state at a time, urgent first
  (requested, waiting, agent, deposit, booked, writing, ready, report,
  cancelled), worked out on the server from real payments (job_payments or
  the ticks): deposit 50%, in full, or any amount from the deposit up; the
  report unlocks only on the full balance and downloads only after the
  property postcode is typed (five wrong tries in 30 minutes lock it and make
  a to-do). Bank transfer shows a reference of their first name and the
  survey number (KIM0042) as the hero, with copy buttons; nobody ticks "I've
  sent it". No "before we arrive", no report due date (the owners' choice).
  An agent booking says access is being arranged with the agent. Refunds: a
  cancellation 48 hours or more before the survey is a full refund, later the
  deposit is kept (jobs.cancelled_at, set by trigger however it is cancelled).
  Paid on the page is the larger of the money recorded (payments, matched bank
  lines) and what the ticks stood for when made (jobs.tick_deposit_pence,
  tick_paid_pence), never today's price, so a tick and the transfer it was for
  count once and a price rise asks for the difference. The bank feed never
  matches Revolut paying in a card payment already recorded, and its paid
  ticks count card money too. Payments only while something is owed on a live
  survey; a payment still processing keeps confirming; a Revolut notice we
  could not check answers 500 so Revolut sends it again, and the hourly run
  sweeps open orders. A report emailed with no file shows done once paid.
  Hourly money checks (`lib/money-todos.js`) make one owners' to-do each and
  never move money: a cancellation owing money back, an overpayment, and a
  survey booked 48 hours (jobs.booked_at) with no deposit (chase; the booking
  stays). A card payment is refunded from the job pop-up (managers, after a
  confirm, through Revolut, never more than was paid by card); a bank one is
  sent back from the bank app.
  An expired link asks for a new one (a to-do and an alert, once a day); we
  send it. Every open, postcode try, download and request is logged
  (portal_events, hashed IP only). The Google review link (REVIEW_URL_DAMPSCAN,
  REVIEW_URL_ATI) shows to everyone paid and reported, never only to happy
  customers. Paying online (`lib/revolut-pay.js`): one "Pay" button (with
  Apple Pay on Apple devices) opens Revolut's own secure page for Apple Pay,
  Google Pay, card or Revolut Pay; our server makes the order for the amount
  chosen, checked on the server (at least what is due now, at most the
  balance); a payment is recorded only when Revolut itself says the order is
  complete (its notice only means "look at order X", checked with our key,
  also when the customer comes back first), once (job_payments.external_ref),
  ticking deposit or paid in full, texting at once and alerting the team;
  coming back shows Confirming, then paid, or "Nothing was taken" with Try
  again. Off until REVOLUT_MERCHANT_KEY is in Vercel (PAY_ONLINE=off hides it,
  REVOLUT_SANDBOX=on tests); Settings, Online payments, "Connect Revolut
  payments" registers Revolut's notices (owners). Bank transfer stays below
  as the free way: the bank feed (lib/bank) matches a transfer by the page's
  reference (KIM0042 typed exactly settles it, its number alone nearly so),
  then by amount and name, a tie left for a person; a matched transfer counts
  on the page and texts the customer. The bank feed runs hourly with
  report-due, so a transfer shows within the hour. From the page (`lib/portal-asks.js`, `public/assets/portal-asks.js`), all
  requests, never a change: Message us (on the card's history, an app alert
  and an owners' text, five a day), Ask to move (a booked survey more than a
  day away, the surveyors' real free times from the website picker's engine,
  never who; a to-do, an alert and an owners' text; the job pop-up shows it and
  the team moves it, which texts 7), and Add photos before the visit (through
  /api/upload, only paths it made, onto the enquiry or jobs.customer_files).
  On my way: the surveyor taps it on the day in the job pop-up (their own
  surveys too); the page shows it two minutes later (Undo before then), for
  four hours, never a text. Receipts: every payment in has its own (Payments
  fold), issued in the customer's name for the property, from Damp Surveying
  Limited trading as the brand with the company's details from Settings; on
  screen, with Print or save as PDF. The job pop-up (managers) has Copy and
  Text their page link (words to tap, never sent) and how often it was
  opened. Revolut's fee on a card payment is kept when it reports one
  (job_payments.fee_pence). A tick that texts the customer (deposit, paid in
  full, report sent) says so, "texts Kim in 2 min", and its Undo stops it.
- Attachments open on screen, never as a download first (the owners' choice,
  11 Nov 2026, `public/assets/viewer.js`, loaded by staff ui.js and the
  customer page): every attachment, report and full-size photo link opens a
  pop-up to swipe across its neighbours; photos fit the screen and PDFs are
  drawn page by page (pdf.js from cdnjs, loaded only when a PDF opens) to
  scroll through, iPhone included. Download stays in the pop-up's top bar.
  Files are fetched and shown from memory, so the attachment route keeps
  sending them as downloads. The viewer is a modal dialog of its own, so it
  opens over the job pop-up and swipes there too. The customer's report opens the same way after
  the postcode check.
- Ronnie alone gets the Send to car button.
- The phone's bottom bar: Today, Scheduling (damp managers only), +, Companies,
  Search (surveyors have their own, above). No Money button (the owner's choice); the bank stays in the
  Companies tabs.
  Settings is in the Companies sheet (the cog at the end of the company row
  runs off a phone's screen) and in the + menu with Texts (the owner's ask,
  13 Nov 2026), and Settings opens with Notifications. The + menu (phone bar
  and the tablet and desktop header alike, the same lit tile turning to a
  cross) is only New survey or enquiry (damp), To-do list, Texts, Settings,
  then Turn on notifications, Refresh and Sign out; no new to-do, no add a
  cost, no new Verge or CoolRight work (the owner's choice, 13 Nov 2026). The
  header holds only the logo: Turn on notifications, Refresh and Sign out are at the
  end of the + menu (and the switch also in Settings, which says when the
  server's push keys are missing).

- Settings, "Ready to switch on" (owners, `lib/readiness.js`): each thing
  the texts, online payments, bank feed, receipts, reviews, scheduled runs
  (cron_beats, `lib/heartbeat.js`: hourly, morning, evening) and alerts still
  need, as done, to do or worth a look (test mode on); set or not, never a value.
- Company details (Settings, owners only, `lib/company-details.js`): Damp
  Surveying Limited's company number, registered office, directors, HMRC
  references, Government Gateway user ID, filing dates, bank and insurance,
  for the owners and ChatGPT (company_details). Fixed fields only; never a
  password, PIN or security answer (the server refuses them).

## ChatGPT connector (`/api/admin/mcp`)
- "Strictly ChatGPT, no extra parts on the site" for assistant features.
- Tools take the customer's words (name and/or postcode), never job numbers.
  The version hash follows the tool list; tell the owner to refresh the
  connector after any tool change. Keep `lib/mcp/guide-tools.js` (every tool
  listed) and the instructions in `lib/routes/admin/mcp.js` in step.
- Every answer about an ATi or DampScan customer carries `scheduler` (stage
  and where it sits on Scheduling, `whereNow` in lib/journey.js), and a
  change's sentence ends "Now: ..."; move_on_board puts an unbooked customer
  in New, Contacted, Waiting for time or Gone cold, unbooks a booked survey,
  or closes a customer as not going ahead (through the Scheduling route, so
  ChatGPT and the page always do the same thing); set_estate_agent takes an
  enquiry too. create_job with a lead_id runs the same carry-over as Scheduling.
- Changes read back and wait for a yes. A failed change goes on the caller's
  to-do list. The owners' exception (10 Nov 2026): in an inbox sweep, filing a
  customer's email (log_email) and adding anyone new as a Scheduling card
  (add_enquiry, `lib/mcp/add-enquiry.js`) happen straight away, at all costs:
  no surveyor needed (chosen when a time is booked), the brand from the
  postcode's patch, a card from an email even with no postcode yet. create_job
  for a damp survey with no surveyor or day makes the card instead of failing,
  and update_client corrects an enquiry with no job.
- Finding a customer is forgiving everywhere (`lib/find-words.js`: the phone's
  Search, ChatGPT, the enquiry finder): each word in the name, email, phone
  (+44 or spaces), postcode or address, best match wins, a surname an enquiry
  never stored forgiven. Every search hit has Call and Email; an enquiry hit
  opens its Scheduling card.

## SEO
- Town pages use the place names people type, for both "damp survey" and
  "damp proofing" where relevant. Do not add prices to titles. DampScan sells
  survey and report only, so its pages never promise remedial work.
