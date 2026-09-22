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
