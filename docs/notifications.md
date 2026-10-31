# Phone alerts

Every alert goes to the ntfy topic in `NTFY_TOPIC`. New enquiries, accepted
quotes and ratings also go to the installed staff app (Web Push) for whoever
holds that business. Alerts are written to be understood from a lock screen
at a glance.

New website enquiries and times picked online are also texted to the owners
through Twilio (`lib/staff-sms.js`) once `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM` and `ALERT_SMS_TO` (the owners' mobiles,
comma separated) are set. Those texts carry the customer's number to tap, by
the owner's choice, since a text is not a shared topic.

## The rules

- The job is named the way staff talk about it: the customer's first name and
  postcode district, "Sarah, BR6". No job numbers. Never a surname, phone,
  email, street or full postcode in the visible text. With only a title and
  surname on file ("Mrs Patel") it says "a customer in BR6".
- Money is short: £5,630, or £5,630.50 when there are pence.
- Dates read "Sat 18 Oct", times "9:30am".
- Title leads with what happened, then the brand: "Booked: Verge Roofing".
- One alert per action. A failed push never fails the change that caused it.
- Tapping opens the right staff page (`STAFF_URL`, default
  `https://dampscan.co.uk/staff`, with `?area=` so the right company opens).
- Priority: high (4) for a customer waiting on us, default (3) for the rest,
  low (2) for routine staff activity.
- To-do words are never sent: a to-do alert only says who it is for and from.

Words are built in `lib/alert-words.js`.

## Every alert

| When | Tag | Priority | Title | Body | Tap opens |
| --- | --- | --- | --- | --- | --- |
| New enquiry finished on a website (`api/lead.js`, `lib/alert-enquiry.js`) | 📞 telephone_receiver | 4 | New enquiry: Verge Roofing | Sarah in BR6 needs help with leak or water coming in. Tap Call to ring them back. | Leads page. Buttons: **Call** (tel: link) and **Open** |
| Quote accepted online (`api/quote.js`) | 🤝 handshake | 4 | Quote accepted: Verge Roofing | Sarah, BR6 accepted the £5,630 quote online. Call to book a start date. | Job |
| Job saved as booked (`lib/notify-quoted.js`) | 📅 calendar | 3 | Booked: Verge Roofing | Sarah, BR6 is booked for Sat 18 Oct at 9:30am, £5,630. | Job |
| Job saved as a quote | 📋 clipboard | 3 | Quoted: Verge Roofing | Sarah, BR6 has been quoted £5,630. | Job |
| Job moved to done (or declined, cancelled) | ✅ white_check_mark | 3 | Job done: Verge Roofing | Sarah, BR6 is now done, £5,630. | Job |
| Payment recorded | 💰 moneybag | 3 | Payment in: Verge Roofing | £1,689 from Sarah, BR6 (Verge). £3,941 left to pay. | Job |
| Payment that clears the bill | 🎉 tada | 3 | Paid in full: Verge Roofing | Sarah, BR6 has paid in full, £5,630. Last payment £3,941. | Job |
| Payout locked | 🔒 lock | 3 | Payout locked: Verge Roofing | Sarah, BR6: £810 to pay out to 2 people. | Job |
| Payout reopened | 🔓 unlock | 3 | Payout reopened: Verge Roofing | Sarah, BR6 is open for changes again. Open the job to see why. | Job |
| Rating, 4 or 5 stars (`lib/rating.js`) | ⭐ star | 3 | New rating: Verge Roofing | Sarah, BR6 gave 5 stars and left a comment. | Job |
| Low rating | ⚠️ warning | 4 | Low rating: Verge Roofing | Sarah, BR6 gave 2 stars. Worth a call. | Job |
| Staff change (`lib/activity.js`) | 🧾 receipt for costs, ✏️ pencil otherwise | 2 | Tom made a change: Verge Roofing | Tom added a £260 cost to Sarah, BR6. | Job, or the Due page |
| Change made through ChatGPT | as above | 2 | Tom made a change: Verge Roofing | Tom (via ChatGPT) added a £1,000 quote line to Sarah, BR6. | Job |
| To-do set (`lib/todos.js`) | 📝 memo | 3 | To-do for Scott from Tom | Open the to-do list to read it. | To-do list |
| To-do ticked off or reopened | 📝 memo | 2 | To-do done: Scott | Scott ticked off a to-do set by Tom. | To-do list |
| A ChatGPT change that failed | 📝 memo | 3 | Change failed: Tom via ChatGPT | A change Tom asked ChatGPT for did not go through. It is on their to-do list. | To-do list |
| Morning digest, per business (`lib/digest.js`) | 🌅 sunrise | 3 | Good morning: Verge Roofing | 1 job tomorrow. 1 quote out over a week with no answer. £500 outstanding on 1 completed job. | Due page |
| Morning digest, general to-dos | 🌅📝 | 3 | Good morning: to-do list | 3 open to-dos (Scott 2, Tom 1), 1 overdue. | To-do list |
| Half-finished form: step 1 left over an hour with no finished enquiry from the same visit or email (`lib/daily-alerts.js`; the morning and evening runs, and whenever a new partial arrives for that business) | ⏳ hourglass | 3 | Half-finished: Verge Roofing | Sarah in BR6 started a quote but didn't finish. Tap to follow up. | Leads page |
| Invoice a day or more past due with money owing; again weekly while owed (morning run) | ⌛ hourglass_flowing_sand | 3 | Overdue: Verge Roofing | Sarah, BR6 is 7 days past due on £3,941. Tap to send a reminder. | Job |
| Tomorrow's booked jobs and surveys, one per business (evening run) | 🗓️ spiral_calendar | 3 | Tomorrow: Verge Roofing | 9:30am Sarah, BR6. 2pm Dev, DA1. | Calendar |
| Monday summary, per business (morning run on a London Monday, `lib/weekly-summary.js`) | 📊 bar_chart | 3 | Last week: Verge Roofing | 3 enquiries, 1 half-finished form. 2 jobs won, £4,200 in. 1 new rating, averaging 5 stars. 1 invoice overdue. 2 open to-dos. | Insights |

The staff app's own buzz for a to-do set for you: "New to-do from Tom" /
"Open the to-do list to read it."

## Scheduled alerts

The hosting plan runs each scheduled job at most once a day, so the clock
driven alerts share two runs in `vercel.json`, both through
`api/cron/[task].js`:

- **digest**, 06:30 UTC: the morning digest, then half-finished forms,
  overdue invoices and, on a Monday in London, the weekly summary.
- **evening**, 17:00 UTC (6pm in summer, 5pm in winter; the plan may start it
  any time in that hour): tomorrow's diary, and half-finished forms again.

Nothing is sent twice. A half-finished form is stamped
(`leads.partial_alerted_at`) and told once; only forms from the last three
days are looked at, so a first run does not dig up old ones. An overdue
invoice is stamped (`jobs.overdue_alerted_at`) and told again after a week, or
sooner if it was reissued with a new due date. The diary and the weekly
summary are looked up in `notifications` by business, kind and day.

All four are recorded through `notify()`, so they are in the notifications
table, and are left out of the digest's "Since the last digest" line because
each was already its own push. Amounts in them are whole pounds.

## Privacy note on the Call button

The enquiry's Call button needs the phone number in its `tel:` link. It is
never shown as text, but it is sent to the ntfy server inside the action, and
anyone subscribed to the topic can read it. On ntfy.sh a topic is public to
anyone who knows its name, so use a long, unguessable topic name, or a
protected topic with `NTFY_TOKEN`.
