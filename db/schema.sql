-- DampScan canonical schema. Idempotent: safe to run against an existing database.
-- Applied by `npm run migrate`.

-- ---------------------------------------------------------------------------
-- leads
-- One row per (session_id, stage). A step-1 partial and the later complete
-- submission share a session_id so a single visitor is never counted twice.
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  stage           text not null check (stage in ('partial','complete')),
  first_name      text not null,
  email           text not null,
  postcode        text not null,
  -- The full address, so a booked survey does not need an email chasing it.
  -- Nullable because a partial lead is captured before these are asked for.
  address_line1   text,
  address_line2   text,
  town            text,
  phone           text,
  issues          text[] not null default '{}',
  role            text,               -- Homeowner / Landlord / Letting agent / Tenant / Buying
  previous_survey boolean,
  notes           text,
  session_id      uuid not null,      -- groups a partial and its later complete submission
  source_path     text,
  referrer        text,
  utm             jsonb,
  user_agent      text,
  ip_hash         text,               -- sha256(ip + IP_SALT). Never store the raw IP.
  notified_at     timestamptz,
  notify_error    text
);

create unique index if not exists leads_session_stage_idx on leads (session_id, stage);
create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_email_idx on leads (lower(email));

-- ---------------------------------------------------------------------------
-- events
-- First-party, cookieless interaction log. session_id comes from the visitor's
-- sessionStorage and dies with the tab.
-- ---------------------------------------------------------------------------
create table if not exists events (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  session_id   uuid not null,
  type         text not null check (type in (
                 'page_view','call_click','form_open','form_step','form_submit',
                 'form_error','email_click','cta_click','staff_login','staff_login_failed'
               )),
  detail       jsonb not null default '{}',   -- e.g. {"step":2}, {"placement":"header"}
  path         text,
  referrer     text,
  channel      text,        -- derived: direct / organic / paid / social / referral / email
  utm          jsonb,
  landing_page text,
  device       text,        -- mobile / tablet / desktop, from UA
  ip_hash      text,
  lead_id      bigint references leads(id) on delete set null
);

create index if not exists events_created_at_idx on events (created_at desc);
create index if not exists events_type_idx on events (type, created_at desc);
create index if not exists events_session_idx on events (session_id);
create index if not exists events_channel_idx on events (channel, created_at desc);

-- ---------------------------------------------------------------------------
-- staff_users
-- Created only via `npm run create-user`. No default account, no seeded password.
-- ---------------------------------------------------------------------------
create table if not exists staff_users (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  email         text not null unique,
  password_hash text not null,           -- argon2id
  name          text,
  role          text not null default 'staff' check (role in ('staff','admin')),
  last_login_at timestamptz,
  disabled      boolean not null default false
);

-- ---------------------------------------------------------------------------
-- rate_hits
-- Supporting table for lib/ratelimit.js. Serverless functions do not share
-- memory, so the throttle counters have to live somewhere both instances of a
-- function can see them.
-- ---------------------------------------------------------------------------
create table if not exists rate_hits (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  bucket     text not null,   -- 'lead' / 'event' / 'login'
  ip_hash    text not null
);

create index if not exists rate_hits_lookup_idx on rate_hits (bucket, ip_hash, created_at desc);
create index if not exists rate_hits_created_at_idx on rate_hits (created_at);

-- ---------------------------------------------------------------------------
-- site tagging
-- One deployment serves dampscan.co.uk and atidampsurvey.co.uk, so every lead
-- and event records which domain it came from. Existing rows predate the London
-- site, so defaulting them to 'dampscan' is correct rather than merely convenient.
-- ---------------------------------------------------------------------------
alter table leads  add column if not exists site text not null default 'dampscan';
alter table events add column if not exists site text not null default 'dampscan';

create index if not exists leads_site_idx  on leads  (site, created_at desc);
create index if not exists events_site_idx on events (site, created_at desc);

-- ---------------------------------------------------------------------------
-- Survey address and attachments
--
-- The postcode alone meant chasing every booking by email for the rest of the
-- address, so the form now asks for it and stores it here. All nullable: a
-- step-1 partial is captured before any of this is asked for, and a visitor who
-- attaches nothing is the normal case.
--
-- files holds Blob pathnames, not URLs. The blobs are private, so they are only
-- readable through /api/admin/attachment, which checks the staff session first.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists address_line1 text;
alter table leads add column if not exists address_line2 text;
alter table leads add column if not exists town          text;
alter table leads add column if not exists files         text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Job earnings
--
-- The rate card, the two global percentages, and one row per job. Jobs store
-- the rates they were agreed at and the payout that was calculated, rather than
-- deriving from the current rate card. Raising the surveyor fee next month must
-- not silently rewrite what everyone earned last month.
-- ---------------------------------------------------------------------------
create table if not exists job_rates (
  key                text primary key,
  label              text not null,
  price_pence        integer not null check (price_pence >= 0),
  surveyor_fee_pence integer not null check (surveyor_fee_pence >= 0),
  position           integer not null default 0,
  active             boolean not null default true,
  updated_at         timestamptz not null default now()
);

insert into job_rates (key, label, price_pence, surveyor_fee_pence, position) values
  ('localised',      'Localised',      21500, 10000, 1),
  ('full-house',     'Full House',     29500, 13000, 2),
  ('large-property', 'Large Property', 37500, 16000, 3),
  ('premium',        'Premium',        45000, 19000, 4)
on conflict (key) do nothing;

-- Single row, enforced by the primary key.
create table if not exists job_settings (
  id          boolean primary key default true check (id),
  tax_bp      integer not null default 2000 check (tax_bp between 0 and 10000),
  lead_bp     integer not null default 1500 check (lead_bp between 0 and 10000),
  lead_earner text not null default 'scott',
  partner_a   text not null default 'tom',
  partner_b   text not null default 'ben',
  updated_at  timestamptz not null default now()
);

insert into job_settings (id) values (true) on conflict (id) do nothing;

create table if not exists jobs (
  id                 bigserial primary key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  lead_id            bigint references leads (id) on delete set null,
  site               text not null default 'dampscan',
  job_date           date not null default current_date,
  customer_name      text,
  customer_postcode  text,
  note               text,
  survey_type        text,            -- the job_rates key, or null for a one-off price
  survey_price_pence integer not null default 0 check (survey_price_pence >= 0),
  surveyor           text not null check (surveyor in ('scott','tom','ben')),
  surveyor_fee_pence integer not null default 0 check (surveyor_fee_pence >= 0),
  remedial_pence     integer not null default 0 check (remedial_pence >= 0),
  status             text not null default 'booked'
                       check (status in ('booked','completed','cancelled')),
  -- Rates as they stood when the job was saved.
  tax_bp             integer not null check (tax_bp between 0 and 10000),
  lead_bp            integer not null check (lead_bp between 0 and 10000),
  lead_earner        text not null,
  partner_a          text not null,
  partner_b          text not null,
  -- The payout. This is the ledger, not a derivation.
  pay_scott_pence    integer not null default 0,
  pay_tom_pence      integer not null default 0,
  pay_ben_pence      integer not null default 0
);

create index if not exists jobs_date_idx on jobs (job_date desc, id desc);
create index if not exists jobs_site_idx on jobs (site, job_date desc);
create index if not exists jobs_lead_idx on jobs (lead_id);
-- One job per lead, so clicking "create job" twice cannot double count it.
create unique index if not exists jobs_lead_unique_idx on jobs (lead_id) where lead_id is not null;

-- ---------------------------------------------------------------------------
-- Client cards
--
-- A booked job is a client, and the card the staff area shows for one is the
-- job joined to its lead. The only state a card carries that a job did not
-- already is whether the money has arrived. Timestamps rather than booleans,
-- so "paid" also says when, and so a payment webhook can set them later with
-- no schema change: it writes the same column a tick in the dashboard does.
-- The deposit is always half the survey price and is derived, never stored.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists deposit_paid_at timestamptz;
alter table jobs add column if not exists paid_at         timestamptz;

-- The default was current_date, which is the server's day. The servers run UTC
-- and the staff area decides every other date boundary on London time, so for
-- the hour before midnight through British Summer Time a job saved with no
-- date was stamped with a day London had already left. Its card was filed as
-- yesterday's and never appeared on the upcoming board, so a walk-in recorded
-- late on a summer evening was quietly lost. See lib/today.js.
alter table jobs alter column job_date set default (now() at time zone 'Europe/London')::date;

-- ---------------------------------------------------------------------------
-- Bank reconciliation
--
-- One row per line of a Revolut statement, imported from the CSV export. The
-- fingerprint is what makes re-uploading an overlapping statement safe: a line
-- already here is skipped, never duplicated.
--
-- amount_pence is signed and is the net effect on the balance, fee included:
-- money in is positive, money out is negative. A line is either matched to a
-- job, in which case the job's own payout ledger says whose money it is, or it
-- is split between some of Scott, Tom, Ben and the tax pot. The four share
-- columns are the ledger, computed when the split is chosen and never
-- re-derived, for the same reason a job stores its payouts.
--
-- category_kind and split_kind record whether a person chose the value or the
-- importer guessed it, so a later rule can overwrite a guess and never a choice.
-- ---------------------------------------------------------------------------
create table if not exists bank_statements (
  id          bigserial primary key,
  imported_at timestamptz not null default now(),
  filename    text,
  account     text,
  first_on    date,
  last_on     date,
  rows_seen   integer not null default 0,
  rows_added  integer not null default 0
);

create table if not exists bank_transactions (
  id                bigserial primary key,
  statement_id      bigint references bank_statements (id) on delete cascade,
  fingerprint       text not null unique,
  external_id       text,
  posted_on         date not null,
  posted_time       text,
  type              text,
  description       text not null default '',
  reference         text,
  counterparty      text,
  mcc               text,
  currency          text not null default 'GBP',
  amount_pence      integer not null,
  fee_pence         integer not null default 0,
  balance_pence     integer,
  category          text not null default 'other',
  category_kind     text not null default 'auto' check (category_kind in ('auto','manual')),
  split             text[] not null default '{}'
                      check (split <@ array['scott','tom','ben','tax']::text[]),
  split_kind        text not null default 'auto' check (split_kind in ('auto','manual')),
  share_scott_pence integer not null default 0,
  share_tom_pence   integer not null default 0,
  share_ben_pence   integer not null default 0,
  share_tax_pence   integer not null default 0,
  job_id            bigint references jobs (id) on delete set null,
  match_kind        text check (match_kind in ('auto','manual')),
  -- The description with its numbers taken out. What a learned rule keys on.
  rule_key          text not null default '',
  updated_at        timestamptz not null default now()
);

create index if not exists bank_tx_posted_idx    on bank_transactions (posted_on desc, id desc);
create index if not exists bank_tx_job_idx       on bank_transactions (job_id);
create index if not exists bank_tx_statement_idx on bank_transactions (statement_id);
create index if not exists bank_tx_rule_idx      on bank_transactions (rule_key);

-- What the importer learned. Keyed on the description with the numbers taken
-- out, so tagging one fuel stop as Tom's fuel tags every later visit to the
-- same garage the same way.
create table if not exists bank_rules (
  key        text primary key,
  category   text not null,
  split      text[] not null default '{}'
               check (split <@ array['scott','tom','ben','tax']::text[]),
  updated_at timestamptz not null default now()
);

-- A survey is at an hour, not just on a day. Nullable, because every job
-- recorded before this column existed has no time and none can be invented for
-- it, and because a day is often agreed before the hour is.
--
-- The boards still archive on the day and not the hour. A nine o'clock survey
-- belongs on today's list all day rather than dropping off it at ten, so the
-- time orders the list and does not decide which list it is on.
alter table jobs add column if not exists job_time time;

-- ---------------------------------------------------------------------------
-- The businesses, the people, and who may see what
--
-- One deployment now serves four businesses and one staff area will run them
-- all. Nothing here renames or drops: `site` on leads, events and jobs stays
-- exactly as it is and is the key into businesses, so the existing staff area
-- keeps working on the same rows while the new one grows around it.
--
-- A person is not a business. Scott sees all four, Ben sees damp and roofing,
-- Steve sees roofing only, and none of that is a column on the person: it is a
-- row per (person, business) in grants, so a fifth business is a row and not a
-- migration.
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  slug              text primary key,   -- the value the site column carries
  name              text not null,
  active            boolean not null default true,
  -- Which payout engine applies. Three trades, three deliberately different
  -- formulas, never unified.
  payout_model      text not null check (payout_model in ('damp','roofing','ac')),
  -- Basis points, so 19 percent is 1900 with nothing to round.
  tax_reserve_bp    integer not null default 2000 check (tax_reserve_bp between 0 and 10000),
  vat_registered    boolean not null default false,
  vat_registered_from date,
  created_at        timestamptz not null default now()
);

insert into businesses (slug, name, payout_model, tax_reserve_bp) values
  ('dampscan',   'DampScan',        'damp',    2000),
  ('ati-london', 'ATi Damp Survey', 'damp',    2000),
  ('roofing',    'Verge Roofing',   'roofing', 1900),
  ('ac',         'CoolRight',       'ac',      2000)
on conflict (slug) do nothing;

-- One passcode per person and the passcode is the identity: there is no
-- username. Passcodes are unique across people, enforced when one is set, so
-- two people can never be the same login.
create table if not exists people (
  id            bigserial primary key,
  name          text not null,
  passcode_hash text not null,        -- argon2id, via @node-rs/argon2
  is_admin      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists grants (
  person_id     bigint not null references people (id) on delete cascade,
  business_slug text   not null references businesses (slug),
  level         text   not null default 'work' check (level in ('view','work','manage')),
  primary key (person_id, business_slug)
);

-- Appended on every write to money or a client record. The before and after
-- are what make a changed payout explainable a year later.
create table if not exists audit (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  person_id     bigint references people (id) on delete set null,
  business_slug text,
  entity        text not null,
  entity_id     bigint,
  action        text not null,
  before_json   jsonb,
  after_json    jsonb
);

create index if not exists audit_entity_idx on audit (entity, entity_id, at desc);
create index if not exists audit_at_idx on audit (at desc);

-- ---------------------------------------------------------------------------
-- Quoted work: cost lines, owner days, and the payout as a ledger
--
-- The damp businesses sell a fixed price survey and their jobs carry its
-- fields. Roofing and air conditioning quote every job, so a job there is an
-- invoice, a list of what it cost, and for roofing the days each owner
-- worked. The payout is computed from those by lib/payout/ and written here
-- when it freezes, so a paid job's figure never moves when a cost is added
-- late or a rate changes next month.
--
-- Everything is additive. The damp columns stay and the damp code never reads
-- the new ones.
-- ---------------------------------------------------------------------------

-- The rates a new quoted job takes, per business. A job stores the ones it was
-- created under, so changing these rewrites nothing that has already happened.
alter table businesses add column if not exists fee_bp          integer not null default 500;
alter table businesses add column if not exists fee_floor_pence bigint  not null default 5000;
alter table businesses add column if not exists split_bp        integer not null default 5000;

alter table jobs add column if not exists invoice_net_pence bigint;
alter table jobs add column if not exists reserve_bp        integer check (reserve_bp between 0 and 10000);
alter table jobs add column if not exists fee_bp            integer check (fee_bp between 0 and 10000);
alter table jobs add column if not exists fee_floor_pence   bigint;
alter table jobs add column if not exists split_bp          integer check (split_bp between 0 and 10000);
-- Who brought the job in. The finder's fee goes to this person, and a quoted
-- job with no finder pays no fee and flags for review rather than guessing.
alter table jobs add column if not exists finder_person_id  bigint references people (id) on delete set null;
-- Set when the customer's money has cleared. From then the stored payout is
-- the figure, and a later cost line shows what it would now be rather than
-- changing what was paid.
alter table jobs add column if not exists payout_frozen_at  timestamptz;
alter table jobs add column if not exists payout_frozen_by  bigint references people (id) on delete set null;

-- Every direct cost on a job, one row each, entered by hand: materials,
-- scaffolding, skip, plant, parking, whatever the job actually cost. Who
-- entered it and when is the audit that matters, because on roofing every
-- line reduces the finder's fee and the people entering them are the people
-- whose retained profit rises when it falls.
create table if not exists job_costs (
  id           bigserial primary key,
  job_id       bigint not null references jobs (id) on delete cascade,
  label        text   not null,
  amount_pence bigint not null,
  added_by     bigint references people (id) on delete set null,
  added_at     timestamptz not null default now(),
  receipt_url  text
);
create index if not exists job_costs_job_idx on job_costs (job_id, added_at);

-- Roofing only. Days each owner physically worked, at the rate agreed for that
-- job, stored per row so a rate change never rewrites history.
create table if not exists job_owner_days (
  id             bigserial primary key,
  job_id         bigint not null references jobs (id) on delete cascade,
  person_id      bigint not null references people (id),
  days           numeric(5,2) not null check (days >= 0),
  day_rate_pence bigint not null check (day_rate_pence >= 0),
  unique (job_id, person_id)
);

-- The payout ledger. Written when a job freezes, one row per person paid, and
-- overwritten only by an admin override that says why. Reading the current
-- figure for an unfrozen job means running the engine, not this table.
create table if not exists payouts (
  id              bigserial primary key,
  job_id          bigint not null references jobs (id) on delete cascade,
  person_id       bigint references people (id) on delete set null,
  person_key      text   not null,          -- 'scott', 'tom', ... the engine's name for them
  amount_pence    bigint not null,
  computed_at     timestamptz not null default now(),
  override_reason text,
  unique (job_id, person_key)
);

-- Three statuses were enough for a booked survey. A quoted job is quoted first,
-- can be declined, and is paid when the money clears, which is when the payout
-- freezes. Refunded exists so a clawback is a state and not a deleted row.
-- Dropped and re-added rather than altered, which is how a check constraint is
-- widened; the pair is idempotent as a unit.
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('quoted','booked','completed','declined','cancelled','paid','refunded'));

-- surveyor named one of three damp people and could not be null. A roofing or
-- air conditioning job has no surveyor. The damp route still refuses anything
-- outside its three, in code, so nothing damp changes; the column simply stops
-- forbidding what the other trades never set.
alter table jobs drop constraint if exists jobs_surveyor_check;
alter table jobs alter column surveyor drop not null;

-- One job per lead is right for a survey and wrong for roofing, where one
-- enquiry can become a re-roof now and a gutter clear later. The damp brands
-- keep the rule; the quoted trades do not have it.
drop index if exists jobs_lead_unique_idx;
create unique index if not exists jobs_lead_unique_idx
  on jobs (lead_id) where lead_id is not null and site in ('dampscan','ati-london');

-- Payments on quoted work are a list, not two tick boxes. A roofing job takes
-- a deposit, sometimes a stage payment, then a balance, and the amounts are
-- whatever was agreed rather than half the price. Paid in full is therefore a
-- computed fact, received >= invoice, not a flag somebody remembers to set.
-- The damp brands keep their deposit_paid_at and paid_at ticks and their
-- derived half deposit, unchanged: that rule is right for a fixed price survey
-- and this table is for the trades it is wrong for.
create table if not exists job_payments (
  id           bigserial primary key,
  job_id       bigint not null references jobs (id) on delete cascade,
  amount_pence bigint not null,
  paid_on      date   not null default (now() at time zone 'Europe/London')::date,
  label        text   not null default 'payment'
                 check (label in ('deposit','stage','balance','retention','refund','payment')),
  note         text,
  -- Set when the row came from a matched bank line, so unmatching can remove
  -- exactly what matching created and nothing a person typed.
  bank_txn_id  bigint,
  added_by     bigint references people (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists job_payments_job_idx on job_payments (job_id, paid_on);
create unique index if not exists job_payments_bank_idx on job_payments (bank_txn_id) where bank_txn_id is not null;

-- The day rate a new owner-days row starts from, per business. Roofing's is
-- the 250 pounds a day in the agreement. It is a starting value the screen
-- offers, not a rule: the rate on each row is what was agreed for that job.
alter table businesses add column if not exists day_rate_pence bigint not null default 0;
update businesses set day_rate_pence = 25000 where slug = 'roofing' and day_rate_pence = 0;

-- ---------------------------------------------------------------------------
-- Bank books per business
--
-- The bank was one set of books, which was right when the two damp brands
-- shared one account and one set of partners. Four businesses have four
-- accounts and different owners, and a loan between two of them must not read
-- as income in one set of books and a cost in the other. Every statement,
-- line and learned rule now belongs to a set of books: 'damp' for the two damp
-- brands together, exactly as before, and the business slug for each of the
-- others. Everything already here is damp's, which is what the default says.
-- ---------------------------------------------------------------------------
alter table bank_statements   add column if not exists books text not null default 'damp';
alter table bank_transactions add column if not exists books text not null default 'damp';
alter table bank_rules        add column if not exists books text not null default 'damp';

-- The same line can legitimately sit in two businesses' books (a transfer
-- between their accounts, seen from both sides), so a fingerprint is unique
-- per books rather than across all of them.
alter table bank_transactions drop constraint if exists bank_transactions_fingerprint_key;
create unique index if not exists bank_tx_books_fingerprint_idx on bank_transactions (books, fingerprint);
create index if not exists bank_tx_books_posted_idx on bank_transactions (books, posted_on desc, id desc);

-- A rule is what one business learned about a description. The same garage
-- can be Tom's fuel in damp's books and a plain cost in roofing's.
alter table bank_rules drop constraint if exists bank_rules_pkey;
create unique index if not exists bank_rules_books_key_idx on bank_rules (books, key);

-- Who a line can be split between is per business: the three partners and the
-- tax pot in damp's books, the people who hold each other business in theirs.
-- The check that named four people is dropped and the route validates against
-- the business's own targets. The four share columns stay, and stay written,
-- for damp's books, which is what damp's reconciliation reads. Every set of
-- books also carries its shares as a map keyed by target, which is what the
-- other businesses' reconciliation reads.
alter table bank_transactions drop constraint if exists bank_transactions_split_check;
alter table bank_rules        drop constraint if exists bank_rules_split_check;
alter table bank_transactions add column if not exists shares jsonb not null default '{}'::jsonb;
update bank_transactions
   set shares = jsonb_build_object('scott', share_scott_pence, 'tom', share_tom_pence, 'ben', share_ben_pence, 'tax', share_tax_pence)
 where shares = '{}'::jsonb and cardinality(split) > 0;

-- ---------------------------------------------------------------------------
-- Notifications
--
-- One row per thing worth telling the owner about: a job saved, a payment
-- recorded, a payout frozen. The row is the record; the push is best effort
-- and says when it went. A morning digest picks up whatever it has not yet
-- summarised and marks it. Nothing here ever holds a customer's name, number
-- or address: a push goes to a phone lock screen.
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id             bigserial primary key,
  business_slug  text references businesses (slug),
  kind           text not null,
  ref            bigint,
  title          text not null,
  message        text not null,
  created_at     timestamptz not null default now(),
  push_sent_at   timestamptz,
  digest_sent_at timestamptz
);
create index if not exists notifications_pending_idx on notifications (business_slug, created_at) where digest_sent_at is null;

-- ---------------------------------------------------------------------------
-- Service contracts
--
-- An air conditioning install is the start of a relationship, not the end of
-- a job: the units want servicing on an interval, and a customer who is
-- reminded stays a customer. One row per installed system, hung off the job
-- that installed it, with when it is next due and when it was last chased.
-- Servicing it rolls the due date forward by the interval. Any business can
-- hold one; CoolRight is the one that needs them.
-- ---------------------------------------------------------------------------
create table if not exists service_contracts (
  id                 bigserial primary key,
  business_slug      text not null references businesses (slug),
  job_id             bigint references jobs (id) on delete set null,
  customer_name      text,
  customer_postcode  text,
  installed_on       date,
  interval_months    integer not null default 12 check (interval_months between 1 and 60),
  next_due_on        date not null,
  unit_count         integer not null default 1 check (unit_count >= 1),
  refrigerant_kg     numeric(6,2),
  status             text not null default 'active' check (status in ('active', 'lapsed', 'ended')),
  last_contacted_on  date,
  last_serviced_on   date,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists service_contracts_due_idx on service_contracts (business_slug, next_due_on) where status = 'active';

-- ---------------------------------------------------------------------------
-- A notification email fired as the visitor left
--
-- A step 1 dropout is saved by a beacon as the page closes, and until now no
-- email went with it, so the dropouts nobody was told about were exactly the
-- ones worth a call. The email now goes as a beacon too. A beacon cannot read
-- FormSubmit's answer, so this is stamped instead of notified_at: it says the
-- email was sent and that nobody could confirm it arrived.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists notify_beacon_at timestamptz;

-- ---------------------------------------------------------------------------
-- Survey sent
--
-- The last tick on a client card, after paid in full: the written survey has
-- gone to the customer. Like the payment ticks it is a time rather than a
-- flag, so the card can say when, and unticking it clears it.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists survey_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Quotes built from costs
--
-- A quoted-trade job's price used to be one typed figure. A quote is now its
-- cost lines (materials, labour, scaffolding, waste, other) at what each costs
-- the business, and a markup; the price net of VAT is the costs plus the
-- markup. While the job is still quoted, its invoice follows the lines; once
-- it is booked the agreed price stands and later lines move only the margin.
--
-- quote_token is the customer's link to a printable quote. It is random,
-- unguessable and shows prices only, never a cost or the markup.
--
-- A job cost copied from a quote line remembers which, so copying twice
-- cannot add the same cost twice. Labour is never copied: the roofing payout
-- pays its owners by days worked, and a labour cost as well would pay twice.
-- ---------------------------------------------------------------------------
create table if not exists quote_lines (
  id           bigserial primary key,
  job_id       bigint not null references jobs (id) on delete cascade,
  kind         text   not null check (kind in ('materials', 'labour', 'scaffolding', 'waste', 'other')),
  description  text   not null,
  cost_pence   bigint not null check (cost_pence >= 0),
  added_by     bigint references people (id) on delete set null,
  added_at     timestamptz not null default now()
);
create index if not exists quote_lines_job_idx on quote_lines (job_id, id);
alter table jobs add column if not exists markup_bp integer check (markup_bp between 0 and 100000);
alter table jobs add column if not exists quote_token text;
create unique index if not exists jobs_quote_token_idx on jobs (quote_token) where quote_token is not null;
alter table businesses add column if not exists vat_bp integer not null default 2000 check (vat_bp between 0 and 10000);
alter table job_costs add column if not exists quote_line_id bigint references quote_lines (id) on delete set null;
create unique index if not exists job_costs_quote_line_idx on job_costs (quote_line_id) where quote_line_id is not null;

-- ---------------------------------------------------------------------------
-- Customer messages from the staff area
--
-- The quote, two follow-ups, the day-before reminder and the review request
-- go out from the staff member's own phone or mail, one tap each, as WhatsApp,
-- a text or an email with the words already written. No message provider is
-- involved, so nothing here sends anything: a row says somebody tapped to send
-- that message on that channel, which is what takes it off the Due list.
--
-- The phone and email live on the job because most roofing and air
-- conditioning jobs start as a phone call, with no web enquiry behind them.
-- quote_sent_at is when the quote first went, which is what the follow-ups
-- count from.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists customer_phone text;
alter table jobs add column if not exists customer_email text;
alter table jobs add column if not exists quote_sent_at  timestamptz;
create table if not exists job_messages (
  id        bigserial primary key,
  job_id    bigint not null references jobs (id) on delete cascade,
  kind      text   not null check (kind in ('quote', 'followup', 'reminder', 'review')),
  channel   text   not null check (channel in ('whatsapp', 'sms', 'email')),
  sent_at   timestamptz not null default now(),
  sent_by   bigint references people (id) on delete set null
);
create index if not exists job_messages_job_idx on job_messages (job_id, sent_at);

-- ---------------------------------------------------------------------------
-- Accepting a quote online
--
-- The customer's quote page has an accept button: they type their name and
-- tick that they accept. That is recorded here, with the time and a salted
-- hash of the address it came from (never the address itself), and the price
-- stops following the quote lines from that moment, because it is now agreed.
-- The job stays quoted until staff book a start date, so nothing lands on the
-- calendar on a day nobody has agreed.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists quote_accepted_at      timestamptz;
alter table jobs add column if not exists quote_accepted_name    text;
alter table jobs add column if not exists quote_accepted_ip_hash text;

-- A price typed by hand is the price. price_fixed says the invoice was set
-- by staff (or agreed), so quote lines added later are costs of the job and
-- never move it. Unfixed, a quoted job's price follows its lines as before.
-- Added nullable so the backfill runs once: a job already booked, accepted,
-- or carrying a typed price with no lines is fixed, so no live price moves.
-- After that every row is set and the update touches nothing.
alter table jobs add column if not exists price_fixed boolean;
update jobs j set price_fixed = (j.status <> 'quoted' or j.quote_accepted_at is not null
       or (coalesce(j.invoice_net_pence, 0) > 0 and not exists (select 1 from quote_lines q where q.job_id = j.id)))
 where j.price_fixed is null;
alter table jobs alter column price_fixed set default false;
alter table jobs alter column price_fixed set not null;

-- ---------------------------------------------------------------------------
-- Price book and quote templates
--
-- The price book is what things cost each business, by the unit, so a quote
-- line is a pick and a quantity rather than a figure looked up every time. A
-- template is a whole set of lines and a markup, saved from a quote that was
-- right, for the jobs that come round again: a standard re-roof, a single
-- split install. Both belong to one business and are never shared across.
-- ---------------------------------------------------------------------------
create table if not exists price_items (
  id             bigserial primary key,
  business_slug  text   not null references businesses (slug),
  kind           text   not null check (kind in ('materials', 'labour', 'scaffolding', 'waste', 'other')),
  description    text   not null,
  unit           text   not null default 'each',
  cost_pence     bigint not null check (cost_pence >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists price_items_business_idx on price_items (business_slug, kind, description) where active;
create table if not exists quote_templates (
  id             bigserial primary key,
  business_slug  text   not null references businesses (slug),
  name           text   not null,
  lines          jsonb  not null default '[]'::jsonb,
  markup_bp      integer check (markup_bp between 0 and 100000),
  created_at     timestamptz not null default now()
);
create index if not exists quote_templates_business_idx on quote_templates (business_slug, name);

-- ---------------------------------------------------------------------------
-- Job photographs and the public gallery
--
-- Taken on site for the record, before, during and after, and stored private
-- (see lib/photos.js). A photo reaches the website only when somebody ticks
-- it, and then only with what they typed for it: a caption and a town. The
-- job's customer, address and postcode are never published with it, and the
-- file has its location metadata stripped on the way in.
-- ---------------------------------------------------------------------------
create table if not exists job_photos (
  id              bigserial primary key,
  job_id          bigint not null references jobs (id) on delete cascade,
  site            text   not null,
  path_full       text   not null,
  path_thumb      text,
  width           integer,
  height          integer,
  stage           text   not null default 'during' check (stage in ('before', 'during', 'after')),
  caption         text,
  public          boolean not null default false,
  public_caption  text,
  area_label      text,
  added_by        bigint references people (id) on delete set null,
  created_at      timestamptz not null default now(),
  published_at    timestamptz
);
create index if not exists job_photos_job_idx on job_photos (job_id, id);
create index if not exists job_photos_public_idx on job_photos (site, published_at desc) where public;

-- A finished job's own page on the website (/our-work/<slug>), written by
-- staff in the job's photos block. Only these fields reach the page: a title,
-- the town, the postcode district worked out from the job, and the write-up.
-- It shows only while the job is finished, has a public photo and the
-- write-up is long enough (lib/job-pages.js), checked again on every request.
alter table jobs add column if not exists page_title        text;
alter table jobs add column if not exists page_town         text;
alter table jobs add column if not exists page_district     text;
alter table jobs add column if not exists page_writeup      text;
alter table jobs add column if not exists page_publish      boolean not null default false;
alter table jobs add column if not exists page_slug         text;
alter table jobs add column if not exists page_published_at timestamptz;
create unique index if not exists jobs_page_slug_idx on jobs (site, page_slug) where page_slug is not null;

-- ---------------------------------------------------------------------------
-- Connecting an AI assistant (ChatGPT, Claude) to the staff area
--
-- The assistant talks to /api/admin/mcp, the Model Context Protocol, and
-- signs in the standard way: OAuth with PKCE. The person types their staff
-- code on our own page, and the assistant gets a token that acts as them, with
-- exactly their businesses and levels. It can read and can do three things:
-- mark a deposit paid, mark a job paid in full, mark a report sent.
--
-- Codes and tokens are stored as SHA-256 hashes only, so this table leaking
-- does not hand anybody a working token. A token for a person who has been
-- deactivated stops working on its next use, because the scope is read from
-- people and grants every time, as it is for a browser session.
-- ---------------------------------------------------------------------------
create table if not exists mcp_clients (
  id             text primary key,
  name           text,
  redirect_uris  text[] not null,
  secret_hash    text,
  created_at     timestamptz not null default now()
);
create table if not exists mcp_codes (
  code_hash      text primary key,
  client_id      text not null references mcp_clients (id) on delete cascade,
  redirect_uri   text not null,
  challenge      text not null,
  person_id      bigint references people (id) on delete cascade,
  shared         boolean not null default false,
  expires_at     timestamptz not null,
  used_at        timestamptz
);
create table if not exists mcp_tokens (
  token_hash     text primary key,
  kind           text not null check (kind in ('access', 'refresh')),
  client_id      text not null references mcp_clients (id) on delete cascade,
  person_id      bigint references people (id) on delete cascade,
  shared         boolean not null default false,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  last_used_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists mcp_tokens_person_idx on mcp_tokens (person_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Invoices for the quoted trades
--
-- An invoice is the agreed job, issued: a number from the business's own
-- sequence (UK VAT invoices must be numbered in an unbroken sequence), the
-- date it was issued, which is the tax point, and when payment is due. The
-- lines and payments are read live from the job, so a payment recorded after
-- issuing shows on the same invoice as a lower balance.
-- ---------------------------------------------------------------------------
alter table businesses add column if not exists next_invoice integer not null default 1;
alter table jobs add column if not exists invoice_number integer;
alter table jobs add column if not exists invoiced_at    timestamptz;
alter table jobs add column if not exists invoice_due_on date;
create unique index if not exists jobs_invoice_number_idx on jobs (site, invoice_number) where invoice_number is not null;
-- The 'invoice' message kind is allowed by the job_messages check below, with
-- the maintenance plans (and, later, 'rating', 'yearly' and 'onmyway'). The check lives in one place only: re-running this
-- file applies every statement in order, and an older, narrower copy of it
-- would fail against rows a later one allows.

-- ---------------------------------------------------------------------------
-- Maintenance plans for Verge, and a price on every plan
--
-- The service contracts CoolRight uses for air conditioning now carry Verge's
-- yearly roof and gutter checks too: same table, same due list. A plan can
-- carry what each visit is charged, so the plans' income can be seen. The
-- customer's reminder that a visit is due is a one-tap message like the rest.
-- ---------------------------------------------------------------------------
alter table service_contracts add column if not exists price_pence integer check (price_pence >= 0);
alter table job_messages drop constraint if exists job_messages_kind_check;
alter table job_messages add constraint job_messages_kind_check check (kind in ('quote', 'followup', 'reminder', 'review', 'invoice', 'service', 'rating', 'yearly', 'onmyway', 'summer'));

-- ---------------------------------------------------------------------------
-- VAT registration and the details an invoice prints
--
-- Verge and CoolRight are not VAT registered yet, and a business that is not
-- registered must not charge VAT. So VAT is off until somebody who manages
-- the business switches it on in the staff area, on the day registration
-- takes effect, and vat_bp is only the rate it uses once it is on. The
-- address, VAT number, company number and payment details are kept here
-- rather than in code, so they can be changed there too.
-- ---------------------------------------------------------------------------
alter table businesses add column if not exists vat_registered  boolean not null default false;
alter table businesses add column if not exists vat_number      text;
alter table businesses add column if not exists trading_address text;
alter table businesses add column if not exists company_number  text;
alter table businesses add column if not exists payment_details text;

-- ---------------------------------------------------------------------------
-- Matching payments to jobs
--
-- bank_payers remembers who pays for whom: once a payment from "P SHARMA" is
-- matched to Priya Sharma's job, the next one from the same payer is put on
-- her open job without asking. Keyed on the payer as the bank writes it and
-- the customer's name, squashed to letters and digits.
--
-- bank_feeds is the automatic import from Revolut Business, ready for the
-- day it is switched on: off until the API keys are set in Vercel and
-- somebody ticks it on the Bank page. It records when it last ran and why it
-- failed, if it did.
-- ---------------------------------------------------------------------------
create table if not exists bank_payers (
  books         text not null,
  payer_key     text not null,
  customer_key  text not null,
  created_at    timestamptz not null default now(),
  primary key (books, payer_key, customer_key)
);
create table if not exists bank_feeds (
  books           text primary key,
  enabled         boolean not null default false,
  last_synced_at  timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rate us, after the job
--
-- Once a job is finished the customer gets a link to a one-question page: how
-- many stars. Every customer is offered the Google review link on that page,
-- whatever they choose, so this never filters who may review on Google; a
-- score below five also opens a private box to say what could be better,
-- which is kept here for the owner. rating_token is the page's key, made for
-- every job (existing ones included) so no step can forget to make one.
-- One rating per job: answering again replaces it.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists rating_token text default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists jobs_rating_token_idx on jobs (rating_token) where rating_token is not null;
create table if not exists job_ratings (
  id          bigserial primary key,
  job_id      bigint not null references jobs (id) on delete cascade,
  stars       integer not null check (stars between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create unique index if not exists job_ratings_job_idx on job_ratings (job_id);

-- ---------------------------------------------------------------------------
-- Time, miles and an hourly rate: what a job really cost
--
-- job_time is a clock in and out per person per job; an open row (no
-- ended_at) is somebody on site now, and a person has at most one open at a
-- time. job_miles is driving, against a job where there is one. The labour
-- cost of a job is its hours at each person's hourly rate, which starts at
-- nought until whoever manages the business sets it.
-- ---------------------------------------------------------------------------
alter table people add column if not exists hourly_rate_pence integer not null default 0 check (hourly_rate_pence >= 0);
create table if not exists job_time (
  id          bigserial primary key,
  job_id      bigint not null references jobs (id) on delete cascade,
  person_id   bigint not null references people (id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists job_time_job_idx on job_time (job_id, started_at);
create unique index if not exists job_time_open_idx on job_time (person_id) where ended_at is null;
create table if not exists job_miles (
  id          bigserial primary key,
  person_id   bigint not null references people (id) on delete cascade,
  job_id      bigint references jobs (id) on delete set null,
  on_date     date not null,
  miles       numeric(7,1) not null check (miles > 0),
  created_at  timestamptz not null default now()
);
create index if not exists job_miles_job_idx on job_miles (job_id) where job_id is not null;
create index if not exists job_miles_person_idx on job_miles (person_id, on_date);

-- ---------------------------------------------------------------------------
-- Phone notifications (Web Push) to the installed staff app, lib/push.js.
-- One row per browser that said yes. person_id is null for the shared owners'
-- login, which hears about every business; a person hears only about the
-- businesses their grants hold, read at send time.
-- ---------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id          bigserial primary key,
  person_id   bigint references people (id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_person_idx on push_subscriptions (person_id);

-- ---------------------------------------------------------------------------
-- The shared to-do list between staff, lib/todos.js. Mostly written by each
-- person's assistant, so the words are kept exactly as said. site null is a
-- general to-do; for_person_id null is everyone in that business (or the
-- owners, when general). The owners' shared login has no person, so who set
-- it is kept as a name. source 'failed' is a change the assistant tried that
-- did not go through, saved so it is not forgotten.
-- ---------------------------------------------------------------------------
create table if not exists todos (
  id                bigserial primary key,
  site              text references businesses (slug),
  job_id            bigint references jobs (id) on delete set null,
  lead_info         text,
  text              text not null,
  for_person_id     bigint references people (id) on delete set null,
  set_by_person_id  bigint references people (id) on delete set null,
  set_by_name       text,
  source            text not null default 'manual',
  due_on            date,
  done_at           timestamptz,
  done_by           bigint references people (id) on delete set null,
  created_at        timestamptz not null default now()
);
alter table todos drop constraint if exists todos_source_check;
alter table todos add constraint todos_source_check check (source in ('manual', 'assistant', 'failed'));
create index if not exists todos_open_idx on todos (for_person_id, created_at desc) where done_at is null;
create index if not exists todos_site_idx on todos (site) where done_at is null;
-- For the owners' list ("for Scott" when Scott signs in with the shared code,
-- which has no people row). Kept apart from an unaddressed "everyone" item, so
-- a note for Scott is not also on the list of whoever set it.
alter table todos add column if not exists for_owners boolean not null default false;

-- ---------------------------------------------------------------------------
-- Scheduled phone alerts (lib/daily-alerts.js). Each stamp is when the alert
-- went, so a rerun of the daily job never sends it twice. A half-finished
-- form is told once; an overdue invoice is told at a day overdue and then
-- weekly while it stays owing.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists partial_alerted_at timestamptz;
alter table jobs  add column if not exists overdue_alerted_at timestamptz;

-- A damp survey waiting on the estate agent to confirm the time. It stays in
-- Upcoming whatever the date says, until the time is set or the tick cleared.
alter table jobs add column if not exists awaiting_agent boolean not null default false;

-- ---------------------------------------------------------------------------
-- Staff page views (lib/routes/admin/usage.js): which staff pages get used,
-- so the redesign keeps what people reach for. One row per page load: the
-- person (or the owners' shared code, which has no people row), the page and
-- the company area. Never an IP address or anything about the device.
-- ---------------------------------------------------------------------------
create table if not exists staff_page_views (
  id         bigserial primary key,
  person_id  bigint references people (id) on delete set null,
  owners     boolean not null default false,
  page       text not null,
  area       text,
  viewed_at  timestamptz not null default now()
);
create index if not exists staff_page_views_at_idx on staff_page_views (viewed_at desc);

-- ---------------------------------------------------------------------------
-- Snoozed action items on Today (lib/routes/admin/snooze.js). An item is its
-- group and id from lib/work.js; snoozing is per person (0 for the owners'
-- code), so hiding something from my list leaves it on everyone else's.
-- ---------------------------------------------------------------------------
create table if not exists action_snoozes (
  kind        text not null,
  ref         text not null,
  person_key  bigint not null default 0,
  until_on    date not null,
  created_at  timestamptz not null default now(),
  primary key (kind, ref, person_key)
);

-- ---------------------------------------------------------------------------
-- The damp survey board (lib/surveys.js). Estate agents are kept once and
-- linked from each survey they arrange, so the agents tab can count their
-- jobs and chase the ones waiting on them. One agent serves both damp brands,
-- so the table has no business column; who may see an agent follows from the
-- jobs in their scope. Remedial work after the report: none until somebody
-- decides, quoting with the figure quoted, then won (its value goes into
-- remedial_pence, which the payout reads) or declined.
-- ---------------------------------------------------------------------------
create table if not exists estate_agents (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  branch      text,
  phone       text,
  email       text
);
create unique index if not exists estate_agents_name_idx on estate_agents (lower(name), lower(coalesce(branch, '')));
alter table jobs add column if not exists estate_agent_id bigint references estate_agents (id) on delete set null;
create index if not exists jobs_estate_agent_idx on jobs (estate_agent_id) where estate_agent_id is not null;
-- An enquiry's agent, before there is a job: carried onto the job when it is booked.
alter table leads add column if not exists estate_agent_id bigint references estate_agents (id) on delete set null;
alter table jobs add column if not exists remedial_status text not null default 'none';
alter table jobs drop constraint if exists jobs_remedial_status_check;
alter table jobs add constraint jobs_remedial_status_check check (remedial_status in ('none', 'quoting', 'won', 'declined'));
alter table jobs add column if not exists remedial_quote_pence integer check (remedial_quote_pence >= 0);
-- The address of a survey booked by phone, with no web enquiry to carry it.
alter table jobs add column if not exists customer_address text;

-- ---------------------------------------------------------------------------
-- The Verge Roofing pipeline (lib/roofing.js). The stages are derived from
-- these facts, never stored as one column, so the job screen, the board and
-- the assistant agree. site_visit_on is the booked look at the roof and
-- visit_done_at says the look happened; won_at is a yes taken by phone (an
-- online yes is quote_accepted_at); started_at puts a booked job in progress;
-- stage_at is when the card last changed column, for "days in stage".
-- expected_days is how long the crew expect to be on the roof. google_posted_at
-- ticks the Google Business post in the finishing checklist.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists site_visit_on    date;
alter table jobs add column if not exists visit_done_at    timestamptz;
alter table jobs add column if not exists won_at           timestamptz;
alter table jobs add column if not exists started_at       timestamptz;
alter table jobs add column if not exists stage_at         timestamptz;
alter table jobs add column if not exists expected_days    numeric(4,1) check (expected_days is null or (expected_days > 0 and expected_days <= 60));
alter table jobs add column if not exists google_posted_at timestamptz;

-- The job planner: one row per thing a roof needs before and during the work.
-- Scaffold, materials and skip are one row each; crew is a row per person.
-- A row with a cost owns one cost line (cost_id), updated in place, so the
-- figure is counted once however often it is edited.
create table if not exists job_tasks (
  id          bigserial primary key,
  job_id      bigint not null references jobs (id) on delete cascade,
  kind        text not null check (kind in ('scaffold', 'materials', 'skip', 'crew')),
  status      text not null default 'needed',
  task_date   date,
  supplier    text,
  cost_pence  integer check (cost_pence is null or cost_pence >= 0),
  note        text,
  person_id   bigint references people (id) on delete cascade,
  cost_id     bigint references job_costs (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table job_tasks drop constraint if exists job_tasks_status_check;
alter table job_tasks add constraint job_tasks_status_check
  check (status in ('needed', 'not_needed', 'booked', 'up', 'down', 'ordered', 'delivered', 'on_site', 'collected', 'confirmed'));
create unique index if not exists job_tasks_one_idx on job_tasks (job_id, kind) where kind <> 'crew';
create unique index if not exists job_tasks_crew_idx on job_tasks (job_id, person_id) where kind = 'crew';

-- The forecast for a postcode, kept for the day so the week board and the
-- pipeline ask Open-Meteo at most a few times a day.
create table if not exists weather_cache (
  postcode    text primary key,
  fetched_at  timestamptz not null default now(),
  days        jsonb not null
);

-- A job always holds a date (job_date defaults to today), so on its own the
-- date cannot say whether anyone agreed it. date_set records that a date was
-- really given: Today keeps jobs without one in "Not booked in yet" instead of
-- piling them on the day they were made. Backfilled once (only rows still
-- null): a date unlike the day it was made, a time, or finished work counts.
alter table jobs add column if not exists date_set boolean;
update jobs set date_set = (job_time is not null or status in ('completed', 'paid', 'refunded')
    or job_date <> (created_at at time zone 'Europe/London')::date
    or status not in ('booked', 'quoted'))
  where date_set is null;
alter table jobs alter column date_set set default false;
alter table jobs alter column date_set set not null;
-- Every route that writes a date also sets date_set itself; this catches the
-- rest: a time always means a date was agreed, a date that moves was chosen,
-- and an insert dated other than today was given its date.
create or replace function jobs_date_set() returns trigger language plpgsql as $$
begin
  if new.job_time is not null then new.date_set := true; end if;
  if tg_op = 'INSERT' and new.job_date <> (now() at time zone 'Europe/London')::date then new.date_set := true; end if;
  if tg_op = 'UPDATE' and new.job_date is distinct from old.job_date then new.date_set := true; end if;
  return new;
end $$;
drop trigger if exists jobs_date_set_trg on jobs;
create trigger jobs_date_set_trg before insert or update on jobs for each row execute function jobs_date_set();

-- ---------------------------------------------------------------------------
-- CoolRight: the kit on the wall and the paperwork that goes with it
--
-- ac_units is one row per indoor or outdoor unit fitted on a job, so the
-- serial, refrigerant and warranty are on file when the customer rings in
-- three years' time. The commissioning and F-gas facts live on the job
-- itself, as the roofing planner's facts do: commissioned_on is what moves a
-- CoolRight card from Installed to Commissioned, and fgas_ref is the record
-- an engineer must keep for any system holding refrigerant.
-- booked_on and booked_time on a service plan are the day a service visit
-- was agreed, which the calendar shows instead of the due date; servicing
-- clears them. summer_asked_on is the last "Before summer" message, so the
-- seasonal list does not ask the same customer twice in a year.
-- ---------------------------------------------------------------------------
create table if not exists ac_units (
  id               bigserial primary key,
  job_id           bigint not null references jobs (id) on delete cascade,
  side             text not null default 'indoor' check (side in ('indoor', 'outdoor')),
  make             text,
  model            text,
  serial           text,
  refrigerant      text,
  charge_kg        numeric(6,2) check (charge_kg is null or charge_kg >= 0),
  installed_on     date,
  warranty_until   date,
  location         text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ac_units_job_idx on ac_units (job_id);
create index if not exists ac_units_warranty_idx on ac_units (warranty_until);
alter table jobs add column if not exists commissioned_on     date;
alter table jobs add column if not exists commission_engineer text;
alter table jobs add column if not exists fgas_ref            text;
alter table jobs add column if not exists leak_check_on       date;
alter table jobs add column if not exists pressure_test       text;
alter table jobs add column if not exists summer_asked_on     date;
alter table service_contracts add column if not exists booked_on   date;
alter table service_contracts add column if not exists booked_time time;

-- An enquiry staff have dealt with without a job: booked elsewhere, spam, no
-- answer. Closed ones drop out of every call-back list and alert but stay on
-- the Leads page, greyed, so nothing is lost. closed_by is the person's name.
alter table leads add column if not exists closed_at     timestamptz;
alter table leads add column if not exists closed_reason text;
alter table leads add column if not exists closed_by     text;

-- ---------------------------------------------------------------------------
-- catch_up (lib/catch-up.js): who did each thing, and when each person last
-- asked "what's happened?". actor_key is a person id, or 'owners' for the
-- shared owners' code; null means the website or a scheduled job.
alter table audit add column if not exists actor_key text;
alter table audit add column if not exists actor_name text;
alter table notifications add column if not exists actor_key text;
alter table notifications add column if not exists actor_name text;
create index if not exists notifications_created_idx on notifications (created_at desc);
create table if not exists catchups (
  key     text primary key,
  last_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Assistant-only helpers (lib/mcp/team-tools.js, draft-tools.js). Nothing on
-- the staff screens reads these: who a job is handed to, a report being
-- drafted, a staff note on an enquiry, and the shared house style.
alter table jobs add column if not exists assigned_person_id bigint references people (id) on delete set null;
alter table jobs add column if not exists report_draft text;
alter table leads add column if not exists staff_note text;
create table if not exists playbook_notes (
  id            bigserial primary key,
  business_slug text references businesses (slug),
  section       text not null,
  text          text not null,
  added_by      text,
  created_at    timestamptz not null default now()
);

-- The finished survey report, as a file on the job: uploaded through the
-- assistant (attach_report) and read back for the final email. The path is a
-- private blob, reached only through /api/admin/attachment. The alert stamp
-- keeps the overdue report alert to one per job.
alter table jobs add column if not exists report_path text;
alter table jobs add column if not exists report_name text;
alter table jobs add column if not exists report_at timestamptz;
alter table jobs add column if not exists report_late_alerted_at timestamptz;
-- One "surveyed, not paid in full" alert per survey, with its buttons.
alter table jobs add column if not exists unpaid_alerted_at timestamptz;

-- Competitor watch (lib/competitors.js): every page in a competitor's
-- sitemap, and when it was first seen, so a month's new pages can be named.
create table if not exists competitor_pages (
  host        text not null,
  url         text not null,
  title       text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (host, url)
);
create table if not exists competitor_checks (
  host        text not null,
  checked_at  timestamptz not null default now(),
  pages       integer not null default 0,
  new_pages   integer not null default 0,
  error       text
);

-- Surveyor hours (lib/availability.js): each surveyor sets the windows they
-- can survey, day by day; no window means not available. Booked jobs and
-- held enquiry slots are taken out when free times are worked out.
create table if not exists surveyor_hours (
  id          bigserial primary key,
  surveyor    text not null,
  on_date     date not null,
  start_time  time not null,
  end_time    time not null,
  set_by      bigint references people (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists surveyor_hours_date_idx on surveyor_hours (on_date, surveyor);
-- A time chosen at the end of the booking form, held until staff confirm.
alter table leads add column if not exists slot_at timestamptz;
alter table leads add column if not exists slot_surveyor text;
-- Lab switches: features tried in the staff Lab before they reach the sites.
create table if not exists lab_flags (
  key         text primary key,
  enabled     boolean not null default false,
  changed_at  timestamptz not null default now()
);

-- Scheduling (lib/scheduling.js): the stretch before a survey is booked.
-- An enquiry or an undated job sits in New, Contacted or Waiting for time,
-- with a log of calls and emails and the times the customer asked for.
alter table leads add column if not exists sched_stage text;
alter table leads add column if not exists sched_wanted text;
alter table leads add column if not exists sched_log jsonb not null default '[]';
alter table jobs add column if not exists sched_stage text;
alter table jobs add column if not exists sched_wanted text;
alter table jobs add column if not exists sched_log jsonb not null default '[]';

-- Scheduling holds: a time pencilled in for an enquiry or a dateless job,
-- shown grey on Today and the week until booked or it lapses (lib/pencils.js).
alter table leads add column if not exists pencil_date date;
alter table leads add column if not exists pencil_time time;
alter table leads add column if not exists pencil_surveyor text;
alter table leads add column if not exists pencil_until timestamptz;
alter table jobs add column if not exists pencil_date date;
alter table jobs add column if not exists pencil_time time;
alter table jobs add column if not exists pencil_surveyor text;
alter table jobs add column if not exists pencil_until timestamptz;
-- Emails the inbox scan has already read (lib/mail-scan.js); ids only.
create table if not exists mail_seen (
  message_id  text primary key,
  seen_at     timestamptz not null default now()
);
-- Where a postcode is, for travel time between surveys (lib/travel.js).
create table if not exists postcode_geo (
  postcode    text primary key,
  lat         double precision,
  lon         double precision,
  looked_at   timestamptz not null default now()
);
-- Who pencilled a time in and when, so two people at once see each other.
alter table leads add column if not exists pencil_by text;
alter table leads add column if not exists pencil_set_at timestamptz;
alter table jobs add column if not exists pencil_by text;
alter table jobs add column if not exists pencil_set_at timestamptz;
-- Pencilled anyway, outside the hours or over a survey: the hourly run leaves it.
alter table leads add column if not exists pencil_forced boolean not null default false;
alter table jobs add column if not exists pencil_forced boolean not null default false;
-- The website time picker's hold becomes an ordinary pencil (one system).
update leads set pencil_date = (slot_at at time zone 'Europe/London')::date, pencil_time = (slot_at at time zone 'Europe/London')::time,
       pencil_surveyor = slot_surveyor, pencil_until = now() + interval '48 hours', pencil_by = 'Website', pencil_set_at = now(), slot_at = null
 where slot_at is not null and pencil_date is null;
-- When an untouched enquiry was nudged once (lib/enquiry-nudge.js).
alter table leads add column if not exists sched_nudged_at timestamptz;
-- My hours, the easy way (lib/hours-store.js): each surveyor's usual week,
-- which fills every day they have not changed by hand, and the days they did.
create table if not exists surveyor_usual (
  id          bigserial primary key,
  surveyor    text not null,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null
);
create index if not exists surveyor_usual_idx on surveyor_usual (surveyor, weekday);
create table if not exists surveyor_day_set (
  surveyor    text not null,
  on_date     date not null,
  primary key (surveyor, on_date)
);
-- Hours already typed in day by day stay exactly as they were.
insert into surveyor_day_set (surveyor, on_date) select distinct surveyor, on_date from surveyor_hours on conflict do nothing;
-- How long each survey type takes on site, for travel and day planning.
alter table job_rates add column if not exists duration_min integer not null default 60;
-- When a website enquiry with the same email or phone replaced this one.
alter table leads add column if not exists merged_into bigint;
-- What the surveyor's own alert feed was last told about this survey (lib/surveyor-alerts.js).
alter table jobs add column if not exists surveyor_told text;
update jobs set surveyor_told = surveyor || '|' || job_date::text || '|' || coalesce(to_char(job_time, 'HH24:MI'), '')
 where surveyor_told is null and status in ('booked', 'completed') and date_set and surveyor is not null;

-- The survey the customer chose on the website after their enquiry (or "not
-- sure"): name, price, add-ons and the rate card key it maps to.
alter table leads add column if not exists survey_choice jsonb;

-- Minutes on site per size, from the owners (27 Oct 2026): localised up to an
-- hour, full house up to two, large two and a half, very large three. Once
-- only (a marker in lab_flags), so a figure changed later on the rate card is
-- never put back by the next merge.
do $$
begin
  if not exists (select 1 from lab_flags where key = 'rate_minutes_v1') then
    update job_rates set duration_min = 120 where key = 'full-house';
    update job_rates set duration_min = 150 where key = 'large-property';
    update job_rates set duration_min = 180 where key = 'premium';
    insert into lab_flags (key, enabled) values ('rate_minutes_v1', true);
  end if;
end $$;

-- Damp and timber at each size, from the one price list (content/prices.js):
-- the owner wanted them on the booking form beside the damp sizes.
insert into job_rates (key, label, price_pence, surveyor_fee_pence, position, duration_min) values
  ('dt-localised',      'Damp and timber, localised',      31000, 10000, 5, 60),
  ('dt-full-house',     'Damp and timber, full house',     44500, 13000, 6, 120),
  ('dt-large-property', 'Damp and timber, large property', 52500, 16000, 7, 150),
  ('dt-premium',        'Damp and timber, very large',     60000, 19000, 8, 180)
on conflict (key) do nothing;
