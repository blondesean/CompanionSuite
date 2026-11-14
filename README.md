# CompanionSuite

A private iPhone app (PWA) for two people: weekly chores, meal prep with a grocery list, and a shared to-do list with reminders. It's installed from Safari's **Add to Home Screen**, so it doesn't need an App Store listing or the $99 Apple developer account. It's hosted in your own AWS account for well under $1 a month.

## Modules

- **Control center**: a 3×3 grid of tiles, each showing a live status ("3 left", "1 overdue"). Four slots are free for future modules.
- **Chores**: shows each week's chores, who did each one last time, and who did it this week. Chores repeat every N weeks. The History tab has a table of completions you can filter by date, person and chore.
- **Meals**: pick a recipe for breakfast, lunch, dinner and filler each week. Recipes hold ingredients with amounts. Each week also has **à la carte** items (shampoo, paper towels…) with one-tap re-adding of recent ones. The grocery list adds everything up alphabetically. Check-offs are shared between both phones, so you can split up at the store, and lines you don't need can be removed (and put back). Share, Copy and per-meal portion sizes are at the bottom.
- **To-Do**: due dates, assignee (anyone, either of you, or both) and reminder times. Reminders go to the assignee, or to both of you if it's unassigned or assigned to both. Completing a task plays a click-and-chime sound and moves it to the Done history.
- **Fun**: a shared list of things to do together (date nights, food, activities, trips, at home). Filter by category, use **🎲 Pick one for us** to choose at random, and mark ideas done on a date. They go to a "Done together" log grouped by month, with a "Do again" button.
- **Dates**: birthdays, anniversaries, holidays, trips and events with a live countdown, soonest first. Each one repeats every year or happens once. Yearly ones count the years ("Turns 30", "5th anniversary"), and one-time dates that have passed move to a Past section. The home tile shows the next one.

## How it fits together

```
iPhone (PWA) ──► CloudFront + S3      static app, cached offline by a service worker
     │
     └─────────► API Gateway ──► Lambda (api)        Cognito login required
                                    │
                 EventBridge ──► Lambda (reminders)  every minute → Web Push to your phones
                 (1/min)            │
                                 DynamoDB             one table, on-demand billing
```

| Folder | What's in it |
|---|---|
| `frontend/` | React + Vite PWA (`src/pages/*` per module, `src/sw.ts` service worker) |
| `api/` | One router for every route (`src/app.ts`), Lambda entry points, local dev server, tests |
| `shared/` | Code used by both sides: types, week math, chore schedule, grocery totals, date countdowns, reminder timing |
| `infra/` | AWS CDK stack (`lib/stack.ts`) |
| `scripts/` | One-off setup: VAPID keys for push, adding users |

## Local development

```bash
npm install
npm run dev        # API on :8787 + app on http://localhost:5173
npm test           # API + shared logic tests
npm run typecheck
```

Local mode has no passwords; you pick "Continue as Sean/Partner". Data is saved in `api/.local-data.json` (gitignored). To change the names, set `DEV_MEMBERS="Sean,Alex"`.

## Deploying to AWS

You need the AWS CLI configured, and `npx cdk bootstrap` run once per account/region.

```bash
npm run setup:vapid                 # once: creates push-notification keys in SSM Parameter Store
npm run deploy                      # builds the app and deploys the stack (prints SiteUrl)
npm run add-user -- you@example.com "Sean"
npm run add-user -- her@example.com "Her Name"
```

`add-user` prints a temporary password, and the app asks for a new one at first sign-in. Then on each iPhone:

1. Open the SiteUrl in **Safari**, sign in, then tap **Share → Add to Home Screen**.
2. Open the app from the Home Screen and go to **Settings → Turn on reminders**. This needs iOS 16.4 or later.

## Cost

For two people, Lambda, DynamoDB, S3 and CloudFront mostly stay inside AWS's free limits. The reminder job runs about 43,000 times a month, which is still under Lambda's 1 million free requests. Cognito Lite is free up to 10,000 users. Expect a few cents a month. API requests are rate-limited as a guard against runaway costs, and setting an AWS Budget alert is still a good idea.

## Notes

- The DynamoDB table has deletion protection and point-in-time recovery, and is retained if the stack is deleted. Your data survives a `cdk destroy`.
- iPhones only allow notifications for apps added to the Home Screen. The completion sound follows the silent switch.
- Grocery totals merge ingredients with the same name and unit. Use the suggested names when typing ingredients so they combine.
