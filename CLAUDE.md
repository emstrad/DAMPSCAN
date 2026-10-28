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
- **Verge Roofing** (vergeroofing.com) and **CoolRight** (coolright.co.uk):
  quoted trades, their own pipelines. Each business keeps its own workflow;
  never merge pipelines.
- Never touch, merge with or send to Surveymate. Resend is Surveymate's;
  nothing here sends email through it unless the owner says otherwise.
- Enquiry alerts are ntfy plus the installed staff app's own notification
  (both for every enquiry; Settings lists whose phones have it on). The email
  is only a backup copy through FormSubmit. Microsoft 365 sending
  (`lib/m365-email.js`) is off because the GoDaddy-run tenant refuses it;
  LEAD_EMAIL_M365=on turns it back on.
- Nothing is ever sent to a customer automatically: messages are words with
  tap-to-send links, emails are drafts the person checks and sends.
  The one exception the owners chose: survey texts through Twilio
  (`lib/sms.js`), a booking confirmation and the evening-before reminder,
  built and off until SMS_AUTO=on with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
  and TWILIO_FROM set. A customer with no mobile (a landline or email
  only) gets no text; the owners get one to-do to email or call them instead.

## People and access (enforced on the server)
- Owners: Scott, Tom, Ben. Tom (manages ATi, DampScan) and Ben (manages
  ATi, DampScan, Verge) have their own logins; Scott uses the owners' code.
  Surveyors: scott, tom, ben, ronnie.
- Work level (Ronnie): sees all jobs in his businesses, never any money;
  may only mark Surveyed and Report sent and attach a report; contact details
  only on jobs he surveys or is assigned; ChatGPT read-only plus those marks;
  no owners' ntfy, only his own diary feed (below).
- Every filter lives on the server (`lib/figures.js`, `lib/work-only.js`),
  never only in the page.

## Hard technical limits
- Vercel Hobby: at most 12 files under `api/`. New endpoints go into an
  existing dispatcher (`api/admin/[action].js`, `api/cron/[task].js`).
- Vercel crons run once a day only (06:30 digest run, 17:00 evening run).
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
  owner). Damp sites have one tick box, "The estate agent needs to be
  contacted to arrange access": it asks for the agent's name, phone and email
  (kept in the enquiry notes) and skips the time picker, since the time is
  confirmed with the agent.
- Run `TEST_DATABASE_URL=postgresql://dampscan:dampscan@127.0.0.1:5432/dampscan npm test`
  (mass failures mean local Postgres died: `service postgresql restart`),
  `npm run build:check`, and the em dash check before pushing.
- Ship through a PR to main, wait for CI to pass, then merge. Never merge red.

## Alerts (ntfy)
- Customer details in alert text: first name and postcode district only.
- Off by the owner's choice: the 06:30 "Good morning" digest push
  (`MORNING_DIGEST=on` restores) and the evening "Tomorrow" push
  (`EVENING_DIARY=on`).
- Change alerts say only what happened ("Booked Kim for Tue 20 Oct at
  09:00."); title is the business, plus a colleague's first name when it was
  them. Never "Owners", never "via ChatGPT". Changes to one job within a
  minute are one alert (per-job ntfy sequence id, 1 minute delay).
- On: new enquiries (a damp one opens its Scheduling card; one untouched two
  hours in working hours is nudged once, `lib/enquiry-nudge.js`), report overdue (24h after survey end, with Report sent
  button), survey not paid in full (morning after, with Paid/Deposit
  buttons), overdue invoices, half-finished forms, to-dos, competitor watch.
- Alert buttons use signed, 3-day tickets (`lib/quick-action.js`).
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
  over) until the report is ticked sent.
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
  apart.
- Insights opens with all time: total earned, what every enquiry booked
  would have made, and what every unique visitor booked would have made,
  both at the average job won (managers only, `lib/potential.js`).
- Records page celebrates all-time damp stats; money only for managers.
- To-dos linked to a customer show as a small "N to-dos" tag on the timeline
  and board cards, and as a list with tick boxes and an add box in the Today
  pop-up and the client card (`public/staff/job-todos.js`).
- Reports page (ATi & DampScan): every survey done and not reported, oldest
  first, with countdown, upload, "Draft email in ChatGPT" and Report sent.
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
  drive. Picks stay requests (the customer is told it is not booked until we
  call to confirm); the team confirms, decides who goes and sends
  the deposit by hand. The Lab shows the same. The form is saved before any
  of this, so leaving part way loses nothing and makes no second enquiry.
  Time first (least friction), then, with the Lab's survey quiz switch on,
  "What do you need?": damp survey, damp and timber, a check on its own, or
  not sure; then the size and add-ons, each with a small (i) saying what it
  is. Priced on the server from the one list, kept on the enquiry
  (survey_choice), shown on the Scheduling card and preselected when booking.
- One price list (`content/prices.js`, the owners' 13 Sept 2026 list with the
  size bands): damp £215, £295, from £375, from £450; damp and timber £310,
  £445 (the two larger bands assume +£150, "from"); timber, invasive, camera
  and cavity on their own or with a survey. The prices pages, the website's
  survey step and the Lab quiz all use it (test/prices.test.js). The prices
  page is kept simple: one table by size (damp, damp and timber), one table
  of extra checks (with a survey, on its own), and everything wordy folded
  away in tap-to-open sections. Minutes on
  site: 60, 120, 150, 180, set once on the rate card. The rate card also has
  damp and timber at each size (dt- keys), and the Scheduling booking form's
  Survey list shows each with its price. A pick is a request: checked again, held 48 hours as a
  pencilled hold and alerted; the team confirms it on Scheduling.
- Survey length per survey type is on the rate card (Minutes on site,
  default 60) and every drive check uses it. Staff best times after a
  buyer's deadline are marked and listed last.
- A second form from the same email or phone folds the earlier open enquiry
  into the new one (`lib/merge-dupes.js`): its history, times wanted and
  hold move over; the old one closes as a duplicate.
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
  time, Pencilled, Booked, Surveyed, Report sent, Paid (or Closed, Cancelled),
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
  Everything else is in the card that opens on tap (`public/staff/sched-detail.js`
  adds a big "Book it in", Move to (including Booked, which opens the booking
  form), the hold, photos and times wanted; Close enquiry is folded away at
  the very end so it is never tapped by mistake).
- Tapping a Scheduling card opens the customer card (`public/staff/sched-card.js`):
  the basic details, times to offer, an add-to-history box, and everything so
  far newest first (`lib/correspondence.js`): calls, texts, notes, times
  wanted, emails in full, what the team did, and the survey's own facts
  (deposit, payments, paid in full, visit, report) from `lib/timeline.js`. An
  email with no subject is named by its first words. Emails are filed whole by
  ChatGPT's log_email (inbox sweep or pasted in). The same history, with its
  add box, is in the job pop-up (`public/staff/pop-history.js`, managers), and
  that pop-up is the one customer card everywhere: Today, Scheduling, Surveys,
  To-do, Reports (tap the name) and Clients (damp customers; "Edit details"
  still opens the client dialog).
- Scheduling (`lib/scheduling.js`, managers only) shows the whole enquiry
  (address, problem, message, photos). Every damp enquiry starts
  in New enquiry, moves to Contacted when a call, email or text is logged,
  then Waiting for time (times they want noted), then Booked into the normal
  flow. Any stage can be skipped. Booking checks the surveyor's My hours and
  their booked surveys, and only goes ahead anyway when the person says so.
- Pencilled times (`lib/pencils.js`): a time offered and not confirmed shows
  grey on Today and the week, is off the free list and lapses after 48 hours
  back to Waiting with a to-do. Two customers may hold the same time; both
  show, flagged, and the first booked bumps the other back with a to-do.
- Who's free (top of Scheduling, "Who's free?" on Today for managers):
  every surveyor's open starts for two weeks, grouped by day and person, for
  answering the phone. Same rules as the free list, booked and pencilled out;
  with the caller's postcode it uses real travel.
- Travel time (`lib/travel.js`, `lib/travel-guard.js`): a survey is an hour
  plus the drive to the next, from postcodes (postcodes.io, cached in
  postcode_geo; an hour when unknown). Every way of booking a damp survey
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
- A booked survey can be unbooked from the job pop-up (Unbook, under the date):
  off the diary but never deleted; the card goes back to Scheduling, Waiting
  for time, with a note, and the surveyor and the gap are told.
- Kept uncluttered (the owner's choice): contacts and maps are one row of
  small chips, empty sections say nothing, ready messages and extra times
  are folded, and no staff page has explaining paragraphs under its
  headings (headings and labels say enough; empty states are a few words).
  Urgent first: Scheduling opens with "Needs you now" (a time picked online
  to confirm, a hold about to lapse, a new enquiry untouched two hours); the
  job pop-up opens with its one next step (book, confirm the time, deposit,
  report, balance) and folds Notes, Enquiry, Photos, Messages, a changed date
  and History; the customer card leads with "Nobody in touch yet".
- Ronnie alone gets the Send to car button.
- The phone's bottom bar: Today, Scheduling (managers only), +, Companies,
  Search. No Money button (the owner's choice); the bank stays in the
  Companies tabs.

## ChatGPT connector (`/api/admin/mcp`)
- "Strictly ChatGPT, no extra parts on the site" for assistant features.
- Tools take the customer's words (name and/or postcode), never job numbers.
  The version hash follows the tool list; tell the owner to refresh the
  connector after any tool change. Keep `lib/mcp/guide-tools.js` (every tool
  listed) and the instructions in `lib/routes/admin/mcp.js` in step.
- Every answer about an ATi or DampScan customer carries `scheduler` (stage
  and where it sits on Scheduling, `whereNow` in lib/journey.js), and a
  change's sentence ends "Now: ..."; move_on_board puts an unbooked customer
  in New, Contacted or Waiting for time.
- Changes read back and wait for a yes. A failed change goes on the caller's
  to-do list.

## SEO
- Town pages use the place names people type, for both "damp survey" and
  "damp proofing" where relevant. Do not add prices to titles. DampScan sells
  survey and report only, so its pages never promise remedial work.
