# Four businesses, one CRM

The plan for taking two damp websites and one staff area to four businesses
running on one public sites repo and one shared back office.

This file is the reasoning. The decisions in it were argued out and several of
them reversed along the way, so where a choice looks odd the paragraph under it
says what the alternative cost.

## The four businesses

| Business | Site | Ownership | Scott's position |
| --- | --- | --- | --- |
| DampScan | dampscan.co.uk | Scott, Tom, Ben | owner |
| ATi Damp Survey | atidampsurvey.co.uk | Scott, Tom, Ben | owner |
| Verge Roofing | vergeroofing.com | Tom, Steve, Ben | lead side only, not an owner |
| CoolRight | coolright.co.uk | Scott and Tom, 50/50 | owner |

Scott runs the lead side of all four. He is not a shareholder in the roofing
company and draws no day rate and no retained profit from it.

## Architecture

```
emstrad/sites    dampscan.co.uk, atidampsurvey.co.uk,
                 vergeroofing.com, coolright.co.uk,
                 and the staff area for all four         (renamed DAMPSCAN)
```

One repo, four brands. **This reverses what this document first said.** The
plan was a separate `crm` repository. The plan also required the CRM to share
the damp database, keep the damp staff area running, and reuse its session,
throttling, argon2 and database layers. A separate repository would have
copied all four into a second place, which is the three implementations
problem phase 1 spent its whole length removing, and the admin dispatcher
already means new routes add no serverless functions. So the staff area grows
business aware in place, and retiring the old screens is continuous rather
than a cutover. It is one database either way.

Each brand keeps its own content, tone, domain,
Business Profile and Ads account, and is brought up to the same level of
maturity on its own terms. The CRM holds every staff area, one database, one
login, four businesses as rows.

### Why one repo, not four

The damp repo is already a multi brand engine that happens to have two brands in
it:

```
middleware.js       routes by Host, rewrites per brand
SITES = { ... }     drives every generator
build-pages.js      for (const site of Object.keys(SITES))
                    "/api, /staff, /assets are shared by both domains"
```

dampscan.co.uk and atidampsurvey.co.uk are fully independent: different regions,
different business models, one does the remedial work and one is survey only,
separate services, areas, guides, reviews, pricing, robots, sitemap and
llms.txt. All out of one repo. So a shared repo does not make sites the same,
and adding roofing and AC is adding two entries to `SITES` plus two content
directories.

The endpoint maths decides it. Ten serverless functions serve two brands today
and would serve four the same way. Separate repos mean three Vercel projects
paying that cost three times, against a Hobby ceiling of twelve per project, for
endpoints that are the same endpoint.

Against one repo it was argued that a roofing deploy could break damp. It cannot.
There is no build step at deploy: Vercel serves `public/` exactly as it sits,
the generated HTML is committed, and `build:pages` is a local authoring tool. A
broken roofing page never reaches a deploy.

It was also argued that the three businesses have three different ownerships.
True, but a brand is a content directory and a domain, so handing one over is an
export and a DNS change.

The strongest argument against turned out to argue the other way. `vergeroofing`
and `coolright` were measured, and of the twelve files sharing a name between
them **not one is identical**:

```
lib/db.js         verge 54 lines, coolright 43, identical lines:  9
lib/validate.js   verge 110,      coolright 104,                 20
lib/http.js       verge 93,       coolright 103,                 30
scripts/build.js  verge 117,      coolright 139,                  0
```

They are not forks. They are independent implementations of one design brief,
down to different semicolon conventions. That divergence is the problem, and one
repo is what forces one implementation. Three repos guarantee it never happens.

### How the merge goes

The damp implementation becomes the one implementation, because it is the only
one already multi brand and it carries the most tests. Verge and CoolRight
content ports onto it brand by brand. Verge's modular `scripts/lib/` split is
worth taking where it is cleaner than what is there.

**The damp pages must not move.** Regenerate before and after and diff the
output: every damp and ATi page comes out byte identical, or the port is wrong.

### What moves out of the sites repo

After the CRM exists, the sites repo loses `public/staff/`, its admin routes,
and its jobs, payments and bank tables. Four endpoints become forwarders:

| Endpoint | Becomes |
| --- | --- |
| `api/lead.js` | POST to CRM `/api/leads` with the per brand key |
| `api/event.js` | POST to CRM `/api/events`, or attribution breaks |
| `api/upload.js` | CRM signed upload, so attachments land in one store |
| `api/notified.js` | POST to CRM, records whether FormSubmit delivered |

`api/address.js` and `api/reviews.js` stay local. They are pure proxies with no
state. The held partial, the throttling, the session cookie, the IP hashing and
the form itself all stay put, because they work.

The CRM derives the business from the brand key, never from anything the browser
sends.

Function count drops to about six for all four brands, so the Hobby ceiling
stops being a constraint. The CRM goes on Pro.

## Site maturity

The damp repo is the benchmark: 78 pages across two brands, so roughly 39 per
brand, made of services, areas, guides, hubs, prices and a home page, with
reviews in the markup and schema tying each site to its Business Profile.

Measured against that:

| | pages | services | areas | guides | reviews |
| --- | --- | --- | --- | --- | --- |
| DampScan (per brand) | ~39 | 9 | 16 to 33 | 1 | yes |
| Verge Roofing | 22 | 7 | 4 | 6 | empty |
| CoolRight | 9 | 7 | 0 | 0 published | empty |

**Verge Roofing** is close. It needs more area coverage, the phone number, the
Business Profile URL, Companies House, and five real reviews.

**CoolRight** has the larger gap: no area pages at all, no published guide, and
`content/guides/air-conditioning-installation-cost.js` is written but the build
is deliberately refusing to publish it while its ranges are null. Those cost
guides answer the highest intent searches in both trades and almost no
competitor answers them, so they matter more than the page count suggests.

Both repos already handle the missing details correctly: `phone: null` means no
`tel:` link ships anywhere and a test fails if a placeholder appears. Nothing is
broken. The sites are quiet until the details exist.

Area pages only where the building stock genuinely changes what goes wrong.
Anything that would differ only by the town name is the doorway page pattern and
should not be written.

## CRM data model

One database. Every business owned table carries `business_id`.

```
businesses        id, slug, name, active, payout_model, vat_registered,
                  vat_registered_from, tax_reserve_percent
                  slug: damp_dampscan | damp_ati | roofing | ac

people            id, name, passcode_hash, is_admin, active
grants            person_id, business_id, level (view | work | manage)
audit             id, person_id, business_id, entity, entity_id, action,
                  before_json, after_json, at

leads             + business_id
events            + business_id
jobs              + business_id, finder_person_id
job_costs         id, job_id, label, amount_pence, added_by, added_at,
                  receipt_url
job_owner_days    id, job_id, person_id, days, day_rate_pence
job_payments      + business_id via job
payouts           id, job_id, person_id, amount_pence, frozen_at, frozen_by,
                  override_reason
adjustments       id, job_id, person_id, amount_pence, reason, at

bank_accounts     id, business_id, name, statement_profile
bank_transactions + business_id, bank_account_id
bank_rules        + business_id
bank_transfers    id, from_txn_id, to_txn_id, at
split_targets     business_id, key, label, sort

tax_reserve_ledger id, business_id, job_id, amount_pence, at,
                   kind (accrual | ct_payment | adjustment)

service_contracts id, business_id, client_id, job_id, installed_at,
                  next_due_at, interval_months, unit_count,
                  refrigerant_charge_kg, status, last_contacted_at

notifications     id, business_id, kind, ref, push_sent_at, digest_sent_at
```

The three existing schemas have already drifted and need reconciling once:
`address1/address2` against `address_line`, `materials_pence` against
`costs_pence`, `txn_date` against `happened_on`, `'went-elsewhere'` against
`'went elsewhere'`. Picks: Verge's address shape, `txn_date`, hyphenated
decline reasons, and `job_costs` lines replacing both single cost columns.

### One database, and no copy

The CRM uses **the same Neon database the damp staff area uses today**. It does
not get its own copy and the damp data is not migrated anywhere.

This is the whole answer to running both at once. The damp staff area keeps
working because every column it reads still exists and still means what it
meant. The CRM reads the same rows through a business aware layer. There is no
dual write, no sync job, no drift between two versions of the same job, and no
cutover event where somebody has to stop working.

The rule that makes it safe: **the migration only ever adds.** New tables, new
columns, widened constraints. Nothing is renamed, nothing is dropped, and
`site` stays exactly where it is even after `business_id` arrives beside it.
The damp queries filter on `j.site = $1` and go on doing so.

Retiring the damp staff area is then not a migration at all. It is deleting
`public/staff/` from the sites repo once nobody is using it. The data never
moves, so there is nothing to get wrong.

Roofing and AC are different: their rows live in two separate Neon databases
today and do have to be imported. Both are effectively empty, so this is close
to free, but the import is written to survive not being empty. See the edge
cases below.

### What blocks it today

Five constraints in the damp schema hardcode a single damp business. Each is
widened by dropping the constraint and adding a broader one, which is additive
and reversible:

| Constraint | Why it blocks | Change |
| --- | --- | --- |
| `jobs.surveyor check in ('scott','tom','ben')` | Steve cannot be on a job | reference `people`, or widen the list |
| `bank_transactions.split <@ array['scott','tom','ben','tax']` | split targets are per business now | drop, validate against `split_targets` |
| `job_settings` single row, `id boolean primary key check (id)` | one set of rates for everyone | add `business_id`, drop the single row key |
| `jobs.status check in ('booked','completed','cancelled')` | no quoted, declined, paid, refunded | widen to the superset |
| `bank_transactions.fingerprint text unique` | globally unique across all four | unique on `(business_id, fingerprint)` |

Widening `jobs.status` is safe for the damp area precisely because it is a
widening: damp code never writes the new values, and its queries name the
statuses they want rather than assuming there are only three.

`jobs_lead_unique_idx` needs the same treatment for a different reason. One job
per lead is right for a damp survey and wrong for roofing, where one enquiry can
become a re-roof now and a gutter clear later. It becomes unique per
`(business_id, lead_id)` and is dropped entirely for the businesses that want
more than one.

### Type reconciliation

Two real mismatches, both settled in favour of the wider or more exact type:

- **Pence.** Damp uses `integer`, Verge and CoolRight use `bigint`. Standardise
  on `bigint`. Damp's `integer` tops out around 21 million pounds so it is not
  urgent, but the import fails on a type mismatch and widening is free.
- **Rates.** Damp stores basis points as integers, `tax_bp = 2000` meaning 20
  percent. Verge and CoolRight store `numeric(5,2)`. Keep **basis points**: they
  are exact, they are integers, and 19 percent is `1900` with nothing to round.
  The roofing reserve and the AC split convert on import.

`job_rates`, the damp rate card, stays as it is and becomes business scoped. The
two new businesses have no rate card at all, because every job is quoted, and a
null rate card is already a supported state: a damp job with `survey_type` null
is a one off price today.

## Access control

One passcode per person, argon2, no username. The passcode is the identity. The
session carries the person id and every query after it is scoped by grants.

| | damp | roofing | ac | admin | bank |
| --- | --- | --- | --- | --- | --- |
| Scott | yes | yes | yes | yes | all |
| Tom | yes | yes | yes | yes | all |
| Ben | yes | yes | no | no | none |
| Steve | no | yes | no | no | none |

Bank access is simply `is_admin`, so there is no separate bank grant table.

Non negotiable:

- Enforcement lives in the query, not in tab visibility. One `scope(person)`
  helper that every route calls, and a test per route that logs in as Steve and
  asserts empty or 403 for every business he does not hold.
- Passcodes unique across people, checked when set, not at login.
- Rate limit 5 attempts per hashed IP per 15 minutes. A six digit secret with no
  username is a brute force target. The `rate_hits` table already exists.
- Workers see their own payout only. Invoice totals and margins need `manage`.
- Scott sees every roofing job cost line, because his fee is computed from them.

## The client card

The card carries over exactly as it is. It is the part of the staff area that
gets used every day, so none of it is redesigned for the sake of it.

What it is today, and what stays true:

- **There is no clients table.** A card is a booked job joined to the lead it
  came from, so creating a job is what creates a card and the address, contact
  details, issues and attachments arrive without anybody retyping them. A job
  entered by hand with no lead still gets a card.
- **Three views**: upcoming, archive, all. Upcoming is
  `status = 'booked' and job_date >= today`, archive is
  `status = 'completed' or job_date < today`, and cancelled jobs appear on none
  of them.
- **"Today" is London's today**, decided by the database, so every browser
  agrees with the server and a card does not archive an hour early in summer.
- **Archiving is a view, not a status change.** A survey whose date has passed
  may have been rescheduled rather than done, and the earnings tiles must not be
  told otherwise by a calendar.
- **Ticks are timestamps, not booleans.** Ticking an already ticked box keeps
  the original time, so saving a note does not move the date something was paid.
  Unticking clears it. Paid in full implies the deposit was paid. Completing on
  paid is forward only: unticking paid does not un-complete a job.
- The job's own name and postcode win over the lead's, because they are what
  staff typed or corrected. The lead fills in behind them.

**The one part that has to become per business is the money block.** Damp
derives the deposit as exactly half the survey price, never stored, odd penny on
the deposit, so correcting a price on the Jobs page fixes the card with no
second edit. That rule is right for a fixed price survey and wrong for quoted
work, where a deposit is whatever was agreed and there may be stage payments.

So the card gets a `deposit_model` per business:

| | damp | roofing and AC |
| --- | --- | --- |
| Deposit | derived, half, odd penny on the deposit | a `job_payments` row for what was agreed |
| Paid in full | `paid_at` timestamp | derived: `received >= invoice_total` |
| Shown as | deposit and balance | a list of payments with a running outstanding |

Damp keeps `deposit_paid_at` and `paid_at` and its derived half, unchanged,
because changing it would change a live screen for no reason. Quoted work uses
`job_payments`, which both new repos already have. Damp can move to payments
later or never.

## Navigating between companies

The pattern already exists and works: the damp staff area has pills reading
`Both sites`, `DampScan, Kent` and `ATI, London` across the clients, jobs and
dashboard pages, and every list endpoint takes `?site=`. That becomes four
businesses and an All, and nothing about it needs inventing.

What makes it good rather than merely present:

- **The pills are built from the person's grants**, so Steve sees one pill and
  no All, and Ben sees damp and roofing. A business nobody granted you is not
  greyed out, it is absent.
- **The business is in the URL**, so a link is shareable, a refresh keeps you
  where you were, and the back button does what it should.
- **Each business has its own accent colour** carried through the header and the
  card borders. Four businesses on one screen is exactly the situation where
  somebody ticks paid on the wrong job, and colour is the cheapest guard there
  is. It costs one CSS variable per business.
- **The business name is in the page title**, so a phone showing three tabs says
  which is which.
- **All is a real view, not a placeholder.** For Scott and Tom it is the only
  screen that answers "what is happening today" across everything, so it sorts
  by date and labels each row with its business rather than hiding the
  distinction.
- **Money is never summed across businesses on the All view.** Four separate
  companies with four bank accounts and three ownerships do not have a combined
  turnover that means anything. Counts and dates aggregate; pounds do not.
- The number keys 1 to 4 switch business. Small, and it is the thing that gets
  used fifty times a day.

## The three payout engines

One directory, three pure functions, chosen by `businesses.payout_model`. No
function touches the database. Integer pence throughout.

### Roofing

```
direct_total = sum(job_costs)            // materials, scaffolding, anything
balance      = invoice_net - direct_total
reserve      = round(balance * 19 / 100)
fee_base     = balance - reserve
scott_fee    = max(5000, round(fee_base * 5 / 100))
wages        = sum over working owners: days * day_rate
retained     = fee_base - scott_fee - wages      // may be negative
```

One formula, no threshold branch. The 50 pound floor binds until `fee_base`
reaches 1,000 pounds. The fee is never reduced by a loss. Scott draws no day
rate and no retained profit. Owners are Tom, Steve and Ben at 250 pounds per day
each, deducted after the fee so they never affect it.

The original cut off, 50 pounds under 1,000 and 5 percent at or above it, paid
less on a 2,000 pound job than on a 999 pound one, because 5 percent of the net
of costs figure does not reach 50 pounds until that figure passes 1,234.57. The
floor removes the band entirely and leaves every worked example unchanged.

### Air conditioning

```
profit  = invoice_net - sum(job_costs)   // materials, labour, extras
if profit < 0: payout_profit = 0         // true profit still recorded
scott   = round(payout_profit * 50 / 100)
tom     = payout_profit - scott          // subtraction, so it reconciles
```

### Damp

The existing Scott, Tom, Ben and tax waterfall, lifted across unchanged.

### Rules common to all three

- Pay only when funds have cleared. Paid is derived from `job_payments`, never a
  flag somebody remembers to set.
- Freeze the payout at paid. The screen shows stored against would be now.
- An admin override writes a new payout with a mandatory reason, audited, and
  the old value is kept.
- Costs added after paid do not claw back a frozen payout. They land on the job
  for the company's books and flag on the payout screen.
- Refunds write an `adjustments` row. A closed month is never rewritten.
- Cancelled jobs keep their costs and pay nothing.
- Ad spend is never deducted, in any engine.
- `finder_person_id` is explicit. No finder means no fee and a flag for review.

**Every job gets a screen showing the working:** the formula, every input with
who entered it and when, and the result. With free text cost lines entered by
the people whose retained profit rises when the fee falls, this is the cheapest
control there is, and it prevents almost every payout argument.

## Bank, per company

Four accounts, four sets of books, no consolidated view. The balance identity
only holds inside one account.

- Statement profiles per account. The parsers already read by column name with
  aliases, so a new bank is an alias map, not a new parser.
- Split targets per business as rows, replacing Verge's hardcoded partner array
  and the damp area's `TARGETS` constant. The splitter itself is unchanged:
  even shares, odd penny to the first party, reconciles exactly.
- Transfers between company accounts are pairs, linked and excluded from income
  and expense on both sides. Without this a loan between companies shows as
  income in one set of books and a cost in the other, and both are wrong.
- Shared costs are never split across books. Record in full where it was paid,
  then a transfer from the other business for its share.

## Tax reserve

A ledger, not a number on a job. Every completed job accrues 19 percent, and the
Corporation Tax payment draws it down. Whatever is left at year end is read off
and settled offline. No split feature is built.

## Leads and FormSubmit

Two posts on every form, always, neither blocking the other:

1. Browser to CRM `/api/leads`.
2. Browser to FormSubmit.

FormSubmit has to be posted from the browser because it sits behind Cloudflare
and refuses server to server calls. Both carry the same reference, generated by
the page before submit, which doubles as the idempotency key. The email says
`Ref: VR-8K2QX4`, the CRM record carries it, and one finds the other.

**The email must be self sufficient:** the full text of every field, not a
summary and not a link, because if the CRM is down the email is the only copy of
that lead. It states how many photos were attached, since those exist only in
the CRM.

The CRM stores the raw submission before anything parses it. No AI, no
extraction, no pre-fill.

## Notifications

No customer or worker messaging of any kind. Scott passes leads on himself.
Everything that would have been a message is a row on a Due tab.

For Scott's own phone: ntfy, free, one POST from the CRM, and it works from a
cron as well as from a click, which FormSubmit never could.

- A long random topic name, 32 characters.
- No customer detail in the push. `Roofing: quote ready, VR-8K2QX4`. Tap it and
  the CRM opens the record.
- On the public server the topic is the only secret. With no personal data in
  the notification the worst case is a spoofed reference, which is obvious. Self
  host later with real auth and only the URL changes.

Push: quote ready, quote accepted, deposit cleared, final payment cleared, AC
service due, payout overridden after freeze.

Daily digest: quotes with no response, services due in 30 days, VAT threshold
warning, and the rest of the Due tab.

## AC service contracts

Created on every install, keyed on the **property** rather than the person so it
survives a house move. One contract per property with a unit count, so a four
unit install is one reminder and not four.

The ladder is a list, not a send:

- 30 days before due: appears on the Due tab
- on the due date, unbooked: escalates
- 14 days after: call task
- 60 days after: `lapsed`, stop

Record the refrigerant charge at install. Above certain charges an F-Gas leak
check is a statutory requirement rather than a sales pitch, and that belongs in
what is said to the customer. Only a completed service rolls `next_due_at`
forward. Manual edit allowed, for a December install that wants a spring visit.

Build it generic. Roofing gutter clears and warranty check ins come free later.

## VAT

A flag per business with an effective date, not a per job decision. While
unregistered, gross and net are the same number and no maths changes. Each
company has its own threshold on its own rolling twelve months, so one crossing
it has no effect on the others. A Due item at 75,000 pounds rolling turnover per
business makes registration a decision rather than a letter.

## Documents

Anything generated for a customer, quote or invoice, carries **the company name
only**. No individual's name, and no internal figures: no lead fee, no day
rates, no margin, no tax reserve. Those live behind the login and never appear
on anything a customer sees. A quote builder that shares a template with an
internal job sheet is how a margin line ends up on a customer's PDF.

## Order of build

**The live damp sites do not change until the last phase.** The current damp
staff area keeps running until the CRM has proved itself. Roofing and AC are not
live, so the CRM gets built and proved against two businesses that cannot lose
anything.

1. **Merge the sites, then finish the two new brands.** Done. Both brands are
   in `SITES`, every damp page came out byte identical throughout, the lead
   path is brand aware end to end, and CoolRight's cost guide publishes the
   basis rather than numbers. Still with the owner: phone numbers, five
   reviews each, a share image each, and pointing the two domains at the
   project.
2. **CRM foundations.** Done. Businesses, people, grants, passcodes, audit,
   session, and every list route scoped in SQL. The shared code remains the
   owners' login and is an admin over every active business; a person's
   passcode is an additional path in the same route. `npm run create-person`
   creates a person with their grants. Steve, roofing only, is the test case,
   and it goes through the real routes with a real cookie.
3. **Roofing and AC in the CRM.** Done. Jobs carry an invoice, cost lines
   with who entered them, owner days at the rate agreed for the job, and a
   payments list; paid in full is computed, never ticked. Both payout engines
   are tested against the agreement's worked examples. The Quotes tab is the
   working screen: the figure first, as tiles that follow the agreement step
   by step, then the inputs that move it. Freezing needs the money in and
   manage on the business; reopening is admin only and asks why; a late cost
   reports drift and never moves the stored figure. The freeze writes the
   company's rows too (costs, reserve, kept), so a paid job's ledger adds back
   to its invoice, which is what the bank reconciles against.

   Bank per business is books per business: damp's books hold everything
   already there and read exactly as before; roofing and CoolRight each have
   their own uploads, learned rules, split targets (the people who hold the
   business, keyed by id, plus a tax pot) and a limited company's
   reconciliation that balances to the penny. Matched money in writes the
   job's payments list. The tax reserve is the ledger's reserve rows against
   the bank's tax pot, so no separate table was needed. Not built: statement
   profiles beyond Revolut, and linking a transfer between two companies'
   accounts as a pair; today each side is categorised as a transfer and left
   out, which is right for the figures and does not yet say which line on the
   other side it is. Stripping the staff area out was made void by keeping
   the CRM in this repo.
4. **Run it.** Both businesses live on the CRM, real jobs, real money. This is
   the proving period and it costs nothing if something is wrong.
5. **Damp joins, only when Scott says.** Nothing is imported and nothing moves:
   the CRM already reads the same database. Both staff areas run side by side on
   the same rows for as long as it takes, and retiring the old one is deleting
   `public/staff/` from the sites repo.
6. Due tab, ntfy, daily digest, AC service contracts.
7. Quote builder, mobile cost entry, monthly statements, Pay by Bank.

## Payments

Pay by Bank rather than Stripe for deposits and balances. Roughly 20p to 50p
flat against about 1.5 percent plus 20p, so about 30p instead of 30 pounds on a
2,000 pound deposit. The money lands directly in the business account, so the
existing reconciliation picks it up with no new plumbing, and there is no PCI
scope because no card details are touched.

TrueLayer, Yapily, Token.io and GoCardless Instant Bank Pay are all FCA
regulated. GoCardless is worth a look if Direct Debit for the AC service
contracts is ever wanted, since that is one relationship instead of two.

The trade offs are real: no chargebacks cuts both ways and some customers prefer
card protection on a large payment, so offer card as a fallback rather than lose
the job. The payment reference must carry the job id so the bank line matches
the job automatically.

## Edge cases

The ones that will actually happen, grouped by where they bite.

### Importing roofing and AC

- **Primary keys collide.** Verge job 1 and CoolRight job 1 both exist. Import
  assigns new ids and keeps `legacy_id` and `legacy_source` on every row, so a
  bank line that referenced job 1 can still be traced after the fact.
- **Foreign keys must be remapped in dependency order**: leads, then jobs, then
  payments, then bank rows. A lookup table of old id to new id per source, held
  for the length of the import and then written into `legacy_id`.
- **`bank_transactions.fingerprint` is globally unique today.** Two businesses
  can legitimately produce the same fingerprint: same date, same amount, same
  description, different account. Unique on `(business_id, fingerprint)`.
- **`leads_session_stage_idx` is unique on `(session_id, stage)`.** Session ids
  are uuids so a real collision is vanishingly unlikely, but it becomes per
  business anyway, because a uniqueness constraint that spans four companies is
  a landmine nobody will remember.
- **Import is idempotent and re-runnable.** It writes inside one transaction and
  matches on `(legacy_source, legacy_id)`, so running it twice imports nothing
  the second time. The first run happens against a Neon branch, not production.
- **If either database turns out not to be empty**, the import still works. If
  it turns out to contain test rows, they are deleted at source before the
  import rather than filtered during it, so there is no rule to maintain.

### Money

- **Rounding differs per business and both are deliberate.** Damp puts the odd
  penny on the deposit. The bank splitter and the AC split put it on the first
  party. Neither is wrong; they must not be unified into one helper that quietly
  changes what somebody was paid.
- **AC profit floors at zero for the payout but the true profit is recorded**,
  or a run of loss making installs reads as break even.
- **Roofing pays the fee on a loss making job.** Deliberate, and the opposite of
  the AC rule. Both need a comment in the code saying so, or one will be
  "fixed" to match the other.
- **A cost line added after a job is paid** does not claw back a frozen payout.
  It lands on the job for the company's books and flags on the payout screen.
- **A refund** writes an adjustment row. The month it was paid in stays as it
  was reported; the clawback lands in the month it happened.
- **A job paid in stages** is not paid until `received >= invoice_total`. First
  money in is not `paid`.
- **A customer overpays.** `received > invoice_total` is paid in full with a
  credit, not an error, and the surplus shows on the card.
- **VAT crossing mid year** changes the base of every payout from that date. Old
  jobs keep their own figures and do not move.

### Dates

- **Every date sensitive fixture must be relative to now.** A fixed date passes
  until it goes by, then fails every run after, on a commit that touched
  nothing. This has already happened once in this repo.
- **London time, not server time**, everywhere a day boundary decides a view.
  The existing card uses `(now() at time zone 'Europe/London')::date` and so
  must the Due tab, the service ladder and the VAT rolling twelve months.
- **The hour a day when London and UTC disagree** is why date tests use a two
  day margin rather than one.
- **A service due date does not move when a booking is cancelled.** Only a
  completed service rolls it forward.

### Access

- **A person with no grants** is refused, not shown an empty page. An empty
  result and no permission must not look the same.
- **Deactivating somebody mid session.** The session carries a person id, so
  `active` is checked on every request, not only at login.
- **Changing a passcode signs that person out** everywhere.
- **Steve must not see an All view.** It is built from grants, so this falls out
  rather than being a special case.
- **Scott is `surveyor` on damp jobs and is not a roofing owner.** People are
  global rows; what they are to a business is a grant and a role, never a column
  on the person.
- **A worker seeing another worker's payout** is the failure this design most
  needs to prevent, so payouts filter to the reader unless they hold `manage`.

### Bank

- **A statement uploaded to the wrong business.** The importer shows the account
  and the date range and asks before writing, and an import can be undone as a
  unit because every row carries its `statement_id`.
- **Transfers between the four accounts are pairs.** Tagged individually they
  become income in one set of books and a cost in the other, and both are wrong.
- **A shared cost paid from one card** is recorded in full where it was paid,
  then a transfer from the other business for its share. Splitting one bank line
  across two sets of books breaks the balance identity in both.
- **A learned rule must not cross businesses.** `bank_rules` is keyed on the
  description with numbers stripped, which is not business specific, so the
  table takes a `business_id` or Tom's fuel tags Steve's.

### Attachments

- **One blob store, paths prefixed per business.** The damp paths are
  `leads/<date>/<uuid>-name.pdf` today, so they gain a business prefix and the
  old ones are read through a fallback rather than being moved.
- **The monthly orphan sweep must be business aware**, or it deletes another
  business's files because no lead in the business it was looking at names them.
  This is the one job in the system that deletes things, so it gets the same
  refusal it has now: no references at all means stop, not delete everything.

### Operations

- **Apply the schema before merging the code**, which is already a documented
  trap here and gets worse with four businesses on one database.
- **One database is one blast radius.** Point in time restore on, and a restore
  rehearsed once before it is needed.
- **The damp staff area must keep passing its own tests** through every one of
  these changes. It is the regression suite for the migration: 283 tests that
  already describe the behaviour being preserved.

## Before phase one

Six gaps found by reading the code rather than guessing. All are cheap and all
get harder once there are four businesses in the database.

**Nothing watches for a lead that never arrived.** `leads.notified_at` and
`leads.notify_error` are populated today and surface only as a column in a CSV
export. A lead that failed to reach an inbox is the most expensive failure this
system has and it is currently silent. It becomes a Due tab row and a push.

**Last write wins, silently.** Job updates are `update jobs set ... where id =
$1`. Two people on one job and one of them loses their edit with no warning.
Add an `updated_at` check to the where clause and tell the loser.

**Nothing checks the database constraints against the code.** `jobs.surveyor`
allows three names in SQL and the code keeps its own list. So does
`bank_transactions.split`. These drift, and a four business migration is exactly
when. There is already precedent: a test asserts the form's job types match what
the server validates. Extend it to read the CHECK constraints from the live
schema and compare.

**No `--check` mode on the damp build.** Verge has `build:check`; damp does not.
That mode proves committed HTML matches what the generator produces, which is
the exact guarantee the four brand merge needs. In CI, the byte identical claim
stops being a promise and becomes a test.

**No Content-Security-Policy.** The other headers are right, and the session
cookie is HttpOnly, Secure and SameSite=Lax so CSRF is largely covered. But the
staff area holds names, addresses, phone numbers and bank lines, and it has no
CSP.

**No dependency or code scanning.** No Dependabot, no `npm audit` in CI, no
CodeQL. Four dependencies is a small surface and this is three config files.

## Features that only matter at four businesses

- **Search.** Name, postcode, phone, job reference, across everything the reader
  is granted. One business is scrollable, four is not.
- **Accountant export.** Three limited companies, three sets of books, three
  year ends. A CSV per business per period with the payout ledger and the tax
  reserve ledger beside the bank lines. The difference between an hour and a
  day, every quarter.
- **Quote win and loss reporting.** All three schemas already carry
  `declined_reason` and nothing reports on it. The damp schema's own comment
  calls it the most valuable field in the database, because it is the only thing
  separating a price problem from a timing problem. It is sitting unused.
- **A today screen**, across everything granted. For Scott and Tom it is the
  only view that answers the real question.
- **Duplicate lead detection.** Same phone or postcode within a fortnight,
  flagged rather than blocked.

## Design, for where it is actually used

A loft, a roof, a van, sunlight, sometimes wet hands, almost always a phone.

- High contrast over anything fashionable. Sunlight readability beats a dark
  theme.
- Large tap targets, primary action within one handed thumb reach.
- Photos straight from the camera into the job.
- Confirm before anything destructive, and undo where undo is possible.
- Empty states that say what to do next rather than showing a blank panel.
- Installable to the home screen: it makes the offline queue possible, and later
  it makes push possible with no third party at all.

## Compliance

- **ICO registration.** Each new limited company processing personal data owes
  the data protection fee. Cheap, and easy to forget.
- **A deletion request.** "Delete everything about me" is genuinely hard once
  there is an audit log and matched bank lines that cannot lawfully be
  destroyed. Decide before somebody asks: redact the personal fields, keep the
  financial record, log the redaction.
- **A subject access request.** Everything held about one person, exported. Far
  easier built now than assembled by hand against a deadline.

## Deliberately not building

**Offline cost entry.** Considered and dropped: costs are entered at a desk,
not from a roof, so a local write queue would be machinery guarding against a
situation that does not arise.

**Two factor on the passcodes.** Rate limiting plus an audit log is
proportionate for four people and a six digit code, and a second factor on the
only device somebody owns is friction without much gain. Revisit if the team
grows.

## Still open

- Whether Scott shares in the roofing year end surplus. Settled offline and
  deliberately not built.
- Phone numbers, dedicated email addresses and FormSubmit endpoints for both new
  sites. Being arranged, added afterwards.
- The CoolRight cost guide. It needs either indicative ranges wide enough to
  always honour, or restructuring the way Verge's guides are written: publish
  the basis, what moves the figure, what is always included, what is never added
  afterwards, and how to compare two quotes, with no numbers at all. The second
  unblocks the page today and commits to nothing, which suits a business still
  working out what it pays an installer. It is the highest intent page on that
  site and it is currently unpublished.
- Whether there is any live data in the Verge or CoolRight databases. If not,
  phase 3 is close to free.

## Traps that cost real time

1. **Twelve serverless functions on Hobby.** Going over fails at the deploy
   step, not the build, and the log ends cleanly at `Deploying outputs...`.
2. **Apply a schema change before merging the code that needs it.** Vercel
   deploys on the push and CI migrates a minute later. In that gap the lead
   endpoint answers enquiries with a 500.
3. **Email relays behind Cloudflare refuse server to server calls.**
4. **`vercel.json` rewrites are evaluated after the filesystem**, so a rewrite
   on `/` never fires. Middleware runs first.
5. **`actions/checkout` leaves credentials in the clone.** CI needs
   `persist-credentials: false`.
6. **A split that ignores materials** pays people out of money already spent.
7. **A deposit is not half the price.** Derive nothing the business does not do.
8. **One database is one blast radius.** Turn on point in time restore and test
   a restore once, before it is needed.
9. **Drift compounds** while three implementations are maintained separately,
   which is the argument for merging sooner rather than later.
10. **The Google Business Profile outranks the website** for local intent. For
    a new site, that is where the first hour goes.
