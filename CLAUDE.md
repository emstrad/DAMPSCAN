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

## People and access (enforced on the server)
- Owners: Scott, Tom, Ben. Tom (manages ATi, DampScan) and Ben (manages
  ATi, DampScan, Verge) have their own logins; Scott uses the owners' code.
  Surveyors: scott, tom, ben, ronnie.
- Work level (Ronnie): sees all jobs in his businesses, never any money;
  may only mark Surveyed and Report sent and attach a report; contact details
  only on jobs he surveys or is assigned; ChatGPT read-only plus those marks;
  no ntfy.
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
- Every staff page must work on iPhone, iPad and desktop: no sideways scroll,
  dialogs inside the viewport, 44px tap targets, 16px inputs.
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

## Staff area behaviour the owners chose
- Today is a vertical week timeline; jobs without a confirmed date sit in
  "Not booked in yet", never on today. Below it only: Collect deposit,
  Collect paid in full, Send survey report (and CoolRight warranties).
- A damp survey whose day has passed with nothing paid is under Collect paid
  in full even while still "booked".
- Timeline cards show survey type and surveyor; cards show phone and email.
- To-do list: newest first by when it came in, each with how long it has
  been waiting.
- Survey cards show a small report countdown (24h from survey end, red when
  over) until the report is ticked sent.
- Jobs page: totals are ATi and DampScan surveys only; earnings count surveys
  whose day has come; booked ahead, paid and still to pay shown apart. The
  hand form is folded away (ChatGPT books jobs now).
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
- My hours (`lib/hours-store.js`): Tom, Ronnie and Ben each set a usual week
  once and it fills every future week; a day changed by hand keeps what was
  typed (tick days to set, add, mark off or reset together; presets for the
  usual shapes; the usual week can be learnt from what they have been
  setting). A day with no hours means not available. Free times are
  one hour starts from two days ahead, never inside the drive to or from a
  booked survey, never on a day with an untimed booked survey, never a time
  an enquiry holds. The booking form is always filled in; picking a time is
  only offered at the end, and only once the owners switch it on after the
  Lab. The Lab (owners only) previews that picker and the survey quiz (ATi
  and DampScan share one price list).
- Scheduling is the one overview for ATi and DampScan (Today and Surveys stay
  as they are): a week strip, the chosen day lane by surveyor (`lib/dispatch.js`:
  hours, surveys with the drive to the next, holds, free starts to tap or drop
  a card on), the To book board, and After the visit (surveyed not paid; paid,
  report to send). A survey opens the same job pop-up as Today.
- The Scheduling map (`public/staff/sched-map.js`, Leaflet kept in `public/staff/vendor`, OpenStreetMap tiles,
  loaded without blocking the board): the day's surveys as numbered pins in
  each surveyor's colour joined as a route, holds grey, customers to book
  orange. Each card to book shows the times to offer, best first, with why
  (`lib/best-fit.js`): who has hours, who is already near that day, then the
  start adding least driving, snug after the survey before; no drive over 75
  minutes between surveys; fresh days (nothing booked) after nearby ones.
- Home areas (`lib/homes.js`, area only, never a street): Ben and Ronnie
  West Malling, Tom Shooter's Hill. The first survey counts the drive from
  home and the last the drive back (up to two hours), shown on the day lane
  and the map; on an empty day the surveyor living nearer comes first.
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
- Ronnie alone gets the Send to car button.

## ChatGPT connector (`/api/admin/mcp`)
- "Strictly ChatGPT, no extra parts on the site" for assistant features.
- Tools take the customer's words (name and/or postcode), never job numbers.
  The version hash follows the tool list; tell the owner to refresh the
  connector after any tool change. Keep `lib/mcp/guide-tools.js` (every tool
  listed) and the instructions in `lib/routes/admin/mcp.js` in step.
- Changes read back and wait for a yes. A failed change goes on the caller's
  to-do list.

## SEO
- Town pages use the place names people type, for both "damp survey" and
  "damp proofing" where relevant. Do not add prices to titles. DampScan sells
  survey and report only, so its pages never promise remedial work.
