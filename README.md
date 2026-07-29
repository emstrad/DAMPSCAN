# DampScan

The dampscan.co.uk marketing site, its lead capture API and the staff dashboard.

A static page plus serverless functions. No framework, no bundler, no build step:
`public/` is served as-is and `api/` becomes Node functions on Vercel.

```
public/          static site (index.html unchanged apart from the edits listed below)
  staff/         login page, dashboard, shared CSS
api/             serverless functions
  lead.js        POST, validates, writes to Neon, then notifies by email
  event.js       POST, records one analytics event
  health.js      GET, uptime check
  auth/          login and logout
  admin/         dashboard data, auth required
db/              schema.sql, migrate.js, account scripts
lib/             db, validation, notification, throttle, session, attribution, metrics
test/            unit and integration tests
```

## Deployment checklist

1. **Push to GitHub.** `git init`, commit, push. `main` is production.
2. **Create the Neon project.** Copy the **pooled** connection string, the one whose
   host contains `-pooler`. The functions are stateless and short lived, so the
   pooler is what keeps connection counts sane.
3. **Create the schema.** `npm install`, then with `DATABASE_URL` set in `.env`,
   run `npm run migrate`. `schema.sql` is idempotent, so this is also how you roll
   a later schema change forward.
4. **Import into Vercel.** Connect the GitHub repo. No build command and no
   framework preset are needed: `vercel.json` sets `outputDirectory` to `public`.
   Set every environment variable below for **Production and Preview**, then deploy.
5. **Create the first staff account.**
   `npm run create-user -- --email=scott@damp-survey.com --name="Scott" --role=admin`
   Then sign in at `https://dampscan.co.uk/staff` and confirm the dashboard loads.
6. **Add the domains.** Add `dampscan.co.uk` and `www.dampscan.co.uk` in Vercel, then
   at the registrar set apex `A` to `76.76.21.21` and `www` `CNAME` to
   `cname.vercel-dns.com`. Wait for the certificate to issue.
7. **Activate FormSubmit.** Submit the live form once. FormSubmit sends a one-time
   activation email to `scott@damp-survey.com` that has to be confirmed before any
   notification will arrive. Leads are stored in Neon from the very first
   submission either way, so nothing is lost while this is pending.
8. **Smoke test.** Work through the list below.

### Post-deploy smoke test

| Check | Expected |
| --- | --- |
| `GET /api/health` | `{ "ok": true, "db": true }` |
| Complete step 1 only | a `partial` row appears in `leads` |
| Finish the form in the same tab | a `complete` row sharing the same `session_id` |
| The notification email | arrives with `Previous survey` populated |
| Submit with the honeypot filled | `200`, and no row written |
| Fire 10 rapid posts to `/api/lead` | the 9th and 10th return `429` |
| Click the header, mobile bar and closing CTA phone links | three `call_click` rows in the call log with placements `header`, `mobile-bar`, `closing` |
| Load `/?utm_source=google&utm_medium=cpc&utm_campaign=damp-london` and book | the lead is attributed to channel `paid` and campaign `damp-london` |
| `/staff/dashboard` while signed out | redirects to the login page, and `/api/admin/summary` returns `401` |
| 6 wrong passwords in a row | the 6th returns `429` |
| Lighthouse, mobile | performance and accessibility both 95 or higher |

Everything in this table except email delivery, the domain and Lighthouse is
covered by `npm test`. See "Running the tests".

## Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon **pooled** connection string. |
| `SESSION_SECRET` | yes | Signs the staff session cookie. Long random string. Changing it invalidates every active session, which is the fastest way to sign everyone out. |
| `IP_SALT` | yes | Salt for hashing visitor IPs. Raw addresses are never stored. Changing it resets the throttle counters. |
| `FORMSUBMIT_ENDPOINT` | yes | `https://formsubmit.co/ajax/scott@damp-survey.com`. |
| `NOTIFY_EMAIL` | no | Fallback used to build the FormSubmit URL if `FORMSUBMIT_ENDPOINT` is unset. |
| `SITE_URL` | no | Public origin, `https://dampscan.co.uk`. |

Generate the two secrets with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy `.env.example` to `.env` for local work. `.gitignore` covers `.env*` except
`.env.example`, so real values cannot be committed by accident.

## Database

### `leads`

One row per `(session_id, stage)`, enforced by a unique index. A visitor who
completes step 1 and then finishes the form produces two rows sharing one
`session_id`: a `partial` and a `complete`. That is what stops a single enquiry
being counted as two leads, and it is why the funnel can measure step 1 through to
booking without guessing.

`issues` is a `text[]` restricted to the six values the form offers. `role` is one
of the five. `previous_survey` is a nullable boolean: `null` means the visitor
never reached step 3, which is different from answering "no". `utm` is `jsonb`,
filtered to known campaign keys. `ip_hash` is `sha256(ip + IP_SALT)`, never the
address itself. `notified_at` and `notify_error` record what happened to the
notification email, so a lead that saved but failed to email is visible rather
than silent.

### `events`

First-party, cookieless interaction log. `session_id` comes from the visitor's
`sessionStorage` and dies with the tab. `type` is constrained by a check
constraint, so an unknown event name cannot be stored. `channel` and `device` are
derived on the server in `lib/attribution.js`, never accepted from the client.
`detail` is capped at 1 KB and stripped to a small allow-list. When a `complete`
lead is written, `lead_id` is back-filled onto every event in that session, which
is how a booking gets credited to the channel that produced it.

`staff_login` and `staff_login_failed` share this table but are deliberately
excluded from every visitor metric, otherwise each sign in would register as a
phantom session and dilute the conversion rates.

### `staff_users`

Accounts are created only by `npm run create-user`. There is no seeded account and
no default password anywhere in this repo. `password_hash` is argon2id.

### `rate_hits`

Supporting table for `lib/ratelimit.js`. Serverless instances do not share memory,
so an in-process counter would be bypassed by spreading requests across cold
starts. Counters live here where every instance can see them, and old rows are
pruned opportunistically.

## Staff accounts

```sh
# create
npm run create-user -- --email=someone@example.com --name="Their Name" --role=staff

# list
npm run set-user -- --list

# revoke access
npm run set-user -- --email=someone@example.com --disable

# restore, change password, change role
npm run set-user -- --email=someone@example.com --enable
npm run set-user -- --email=someone@example.com --password
npm run set-user -- --email=someone@example.com --role=admin
```

Passwords are always prompted for, never passed as an argument, so they stay out of
shell history and the process list.

Prefer `--disable` over deleting: it revokes access immediately and keeps the
account's history. A session already issued stays valid until it expires, so if
someone has to be cut off this second, rotate `SESSION_SECRET` as well.

## Security notes

- The staff session cookie is the only cookie the site sets. `httpOnly`, `Secure`,
  `SameSite=Lax`, 8 hour expiry, HMAC signed and verified in constant time.
- Unknown email and wrong password do the same work and return the same message,
  so the login cannot be used to discover which addresses have accounts. A disabled
  account behaves identically.
- Throttles: 8 leads and 60 events per 10 minutes per hashed IP, 5 failed logins per
  15 minutes. The lead and event throttles fail open, because a database blip should
  not stop the phone ringing. The login throttle fails closed.
- No raw IP is ever written to the database or the logs.
- Every `/api/admin/*` route calls `requireAuth` and aggregates in SQL. No admin
  endpoint pulls a table into JavaScript to count it.
- The dashboard builds every cell with `textContent`. Lead notes and referrers are
  visitor-supplied, so rendering them as markup would make the dashboard a stored
  XSS sink. CSV export also prefixes cells starting with `=`, `+`, `-` or `@` so a
  note cannot become a spreadsheet formula.
- `/staff/*` is `noindex, nofollow` in the markup, via an `X-Robots-Tag` header, and
  disallowed in `robots.txt`.

## Analytics and privacy

No third-party analytics, no advertising cookies, no cross-site tracking. The
visitor session id lives in `sessionStorage` and is gone when the tab closes.
Attribution is captured once per visit from `document.referrer` and the `utm_*`
parameters, then held for the rest of that visit so a later event still knows where
the visitor came from. The cookie notice on the page describes exactly this.

## Running the tests

56 tests: 22 unit, 28 API integration and 6 covering the migration path. The integration tests exercise the real
handlers and the real SQL, with `lib/db.js` swapped for a `pg` client pointed at a
local Postgres.

```sh
# start a throwaway Postgres and apply the schema
initdb -D /tmp/pgdata -U dampscan --auth=trust
pg_ctl -D /tmp/pgdata -o "-p 55432" start
createdb -h 127.0.0.1 -p 55432 -U dampscan dampscan
psql -h 127.0.0.1 -p 55432 -U dampscan -d dampscan -f db/schema.sql

npm test
```

Override the target with `TEST_DATABASE_URL`. Never point it at production: each run
truncates every table. No test touches the network, FormSubmit is stubbed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and every pull request:

1. Starts a real Postgres 16 service container.
2. Applies `db/schema.sql`, then applies it a second time to prove it is idempotent.
3. Asserts all four tables exist.
4. Runs `npm test`, all 56 tests.
5. Fails the build if an em dash has crept in.

On a push to `main`, and only then, a second job runs `npm run migrate` against
Neon so the production schema is applied automatically. It needs one repository
secret:

- **`DATABASE_URL`**, under Settings, Secrets and variables, Actions. Use the same
  pooled Neon string that Vercel has.

Without that secret the job logs a warning and skips, so CI stays green while you
are still setting things up rather than failing on a missing credential. The
migration only ever adds tables, indexes and columns, so re-running it on every
merge cannot destroy existing leads.

## Forking this to a new GitHub account and Vercel project

The code has nothing tied to a GitHub owner, repo name or Vercel project, so a
fork works. What does not travel with the fork is the domain, the environment
variables, the database and the staff accounts. Work through this:

1. **Repoint the domain.** The site is static with no build step, so the canonical
   link, `og:url`, `og:image`, JSON-LD, `sitemap.xml`, `robots.txt` and the
   `vercel.json` www redirect all carry the domain literally.

   ```sh
   npm run set-domain -- --check                    # show what points where now
   npm run set-domain -- --domain=newdomain.co.uk   # rewrite all of it
   ```

   Do not skip this. A fork left pointing at `dampscan.co.uk` still renders
   perfectly in a browser while telling Google the real version of the page lives
   on the old domain, so the new site competes with itself and loses. It is the one
   mistake here that is invisible until rankings move.

2. **Create a Neon project** for the fork, or point at the existing one. A forked
   repo does not fork the database.

3. **Set the environment variables in the new Vercel project.** All of them, for
   Production and Preview. `SESSION_SECRET` and `IP_SALT` should be freshly
   generated, not copied: reusing them means sessions minted by the old deployment
   are still valid against the new one.

4. **Add the `DATABASE_URL` secret** to the new GitHub repo if you want the
   automatic migration job, otherwise run `npm run migrate` once by hand.

5. **Create staff accounts.** They live in the database, so a new database has
   none. `npm run create-user -- --email=... --role=admin`.

6. **Re-activate FormSubmit** if the notification address changes. Activation is
   per address, so an address that is already confirmed stays confirmed.

7. **Replace the branding** if this is a different business:
   `public/assets/dampscan-logo.svg`, `public/favicon.svg`, and the copy in
   `public/index.html`.

Vercel itself needs no special configuration on the new project. There is no build
command and no framework preset: `vercel.json` sets `outputDirectory` to `public`,
and `api/` is detected automatically.

## Front-end changes to `index.html`

The design, layout, class names, section order and copy are untouched. The only
edits are the ten that were specified:

1. `LEAD_ENDPOINT` now points at `/api/lead`.
2. A per-visit `sessionId` from `crypto.randomUUID()`, persisted in `sessionStorage`
   under `dampscan-session` and sent with both posts.
3. `sendLead(stage)` posts the JSON shape `/api/lead` expects. Partial still fires
   once when step 1 validates, complete on submit, and a network failure still shows
   the success state.
4. A visually hidden honeypot input using the existing `.sr-only` class.
5. A `400` re-enables the submit button and renders the returned field errors
   through the existing `.form-row.has-err` and `.err` pattern. The server's
   messages are worded to match the static copy already on the page, so the visitor
   sees the wording the design always had.
6. `pushLeadToCRM()` is byte for byte unchanged.
7. The footer "Staff login" pill points at `/staff` with no `target="_blank"`. Every
   other SurveyMate link is untouched.
8. A `track(type, detail)` helper posting to `/api/event` with `keepalive`, fire and
   forget, wrapped in try/catch.
9. Delegated listeners for `page_view`, `call_click`, `email_click`, `cta_click`,
   `form_open`, `form_step`, `form_error` and `form_submit`. Nothing was added to the
   markup to support them.
10. The cookie notice paragraph now describes the first-party analytics, since that
    is what the site actually does.

Plus the SEO additions that were also specified: a canonical link, `og:url` and an
absolute `og:image`. The JSON-LD `image` was made absolute at the same time, because
a relative URL there is invalid, and `url` was added.

Two things worth flagging:

- `public/assets/dampscan-logo.svg` did not exist in the supplied file, so it has
  been created to match the wordmark. It is referenced by `og:image`. Most social
  networks will not render an SVG preview, so replace it with a 1200x630 PNG at the
  same path when a raster asset is available.
- `index.html` is the one file over 300 lines. It arrived that way, and splitting it
  would mean restructuring the page, which was out of scope.

## Handing this to the SurveyMate CRM

Three integration points, in increasing order of usefulness:

1. **`pushLeadToCRM(payload, stage)`** in `public/index.html`. Still the untouched
   client-side hook, called for both the partial and the complete submission. Fine
   for a browser-side pixel or a tag manager push. Do not make it the only path: it
   runs in the visitor's browser, so an ad blocker or a closed tab can stop it.
2. **`session_id` on `leads` and `events`.** The join key. It ties a partial to its
   completion and a booking to the events that led to it, so the CRM can import a
   lead with its full attribution rather than just a form dump.
3. **`GET /api/admin/leads`** is the real integration surface. It returns each lead
   with every field, its resolved `channel` and `landingPage`, its `utm` object and
   its complete event `timeline`, and it accepts `range`, `stage`, `limit` and
   `offset`. A CRM sync should poll this endpoint rather than scrape the dashboard.

   It currently authenticates with the staff session cookie. For a server to server
   sync, add a bearer token check alongside `requireAuth` in `lib/session.js` rather
   than loosening the cookie rules, and give the CRM its own credential so it can be
   revoked on its own.

## A note on dependencies

Three runtime dependencies:

- `@neondatabase/serverless`, the Neon HTTP driver.
- `@node-rs/argon2` for argon2id password hashing. Chosen over the `argon2` package
  because it ships prebuilt binaries for the Lambda platform Vercel runs on, so a
  deploy cannot fail on a native compile step. Same algorithm, same PHC hash format.
- `dotenv`, used only by the local CLI scripts.

`pg` is a dev dependency, used only by the integration tests.
