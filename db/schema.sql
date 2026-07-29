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
