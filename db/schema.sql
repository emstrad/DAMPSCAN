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
