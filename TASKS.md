# Task: Multi-Institution Role-Based Onboarding Upgrade

> **Context:** `gmail_automation_bot` is currently JECRC-locked (global `ALLOWED_SENDER_DOMAIN=jecrcu.edu.in`, hardcoded JECRC copy in auth/waitlist/test routes, single preset, no role concept). Goal: open beyond JECRC — any user picks their role, gets role-tuned private rules, sets their own domain gate.

---

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| **0 — Task file + plan** | ✅ Done | This file + verbal plan laid out |
| **1 — Per-user domain gate** | ❌ Not started | `User.allowedDomains` field, dynamic gate in scorer, fix `isAllowedDomain` bug |
| **2 — Role field + presets module** | ❌ Not started | `User.role`, `@jecrc/role-presets`, seed function |
| **3 — Role setter API (`PATCH /users/me/role`)** | ❌ Not started | Endpoint + auth middleware + seed-on-first-set |
| **4 — Generic onboarding capture (waitlist cleanup)** | ❌ Not started | Remove JECRC language from waitlist email + auth error page |
| **5 — Role picker frontend + routing** | ⚠️ Partial | `RolePicker.tsx` component exists; redirect logic in `main.tsx` exists; new route `/onboarding/role` not yet in React Router; wiring depends on backend Step 3 |
| **6 — OAuth callback role redirect** | ❌ Not started | Insert role-picker redirect for new users in `auth.ts` callback |
| **7 — JECRC copy cleanup (admin check, test fixtures)** | ❌ Not started | `emails.ts` admin check, inject-test fixtures, `waitlist.ts` follow-up copy, auth error page |
| **8 — Migrations + config + deploy** | ❌ Not started | Two Prisma migrations, `.env.example` updates, redeploy |

---

## Role Catalog (final)

- `student` — placement drives, exam schedules, fee deadlines, scholarship alerts
- `teacher` — meeting invites, timetable changes, exam duty rosters, circulars, research
- `businessman` — client proposals, invoices, contracts, partnership offers, market updates
- `freelancer` — client briefs, project deadlines, invoice reminders, platform updates
- `developer` — deployment alerts, code reviews, incidents, security advisories, PRs
- `other` — minimal default rule set, user builds their own

---

## Decisions Made

- **Hard redirect** for users with no role: on auth success → if no role → `/onboarding/role` instead of `/dashboard`. Existing users without a role will be interrupted on their next login (acceptable — cleaner long-term state).
- **Not JECRC-specific anymore** — domain gate is per-user; system-default domain list in env is a fallback for users who set nothing.
- **Rule privacy already solved** — `userId`-scoped rules, cascade delete, per-user queries. Presets just seed more user rules; no cross-user leakage.
- **Frontend role picker already drafted** — `RolePicker.tsx` exists with all 6 roles, calls `PATCH /users/me/role`, redirects to dashboard. Needs route registered and backend endpoint to actually work.

---

## Remaining Work Summary

**Backend (Steps 1-4, 6-8):** ~6 file changes + 2 migrations
- `packages/database/prisma/schema.prisma` — add `role`, `allowedDomains`
- `packages/scoring/role-presets.ts` — new module, static role→rules mapping
- `packages/scoring/seed-user-rules.ts` — new function, seeds user rules from preset
- `apps/api/src/routes/users.ts` — new file, `PATCH /users/me/role`
- `apps/api/src/routes/auth.ts` — insert role redirect for new users
- `apps/api/src/routes/emails.ts` — replace hardcoded admin check + JECRC test fixtures
- `apps/api/src/routes/waitlist.ts` — generic copy
- `.env.example` — `DEFAULT_ALLOWED_SENDER_DOMAIN`, `ADMIN_EMAIL`

**Frontend (Step 5 polish):** ~2 file changes
- `apps/web/src/main.tsx` — register `/onboarding/role` route
- `apps/web/src/components/RolePicker.tsx` — verify final contract matches backend response shape

**Docs:** optional, non-blocking
- `ARCHITECTURE.md`, `CONTEXT.md` — update JECRC references when ready for public release

---

## Next Session Start Point

Pick up at **Step 1** (per-user domain gate). First concrete change: `schema.prisma` — add `allowedDomains` and `role` to User, run migration, then update the scorer to read the user's personal domain list.
