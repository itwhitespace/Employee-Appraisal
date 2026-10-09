# Employee Performance Appraisal — Whitespace Partners

Web app for the annual performance appraisal: employees fill in a self-assessment, supervisors
rate their team, and admin manages employees, form questions and the 9-Box overview.

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres)

## Setup

1. **Install**

   ```
   npm install
   ```

2. **Environment** — copy `.env.example` to `.env.local` and fill in the values from
   Supabase → Project Settings → API. `SESSION_SECRET` is any long random string.

3. **Database** — open Supabase → SQL Editor, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) and run it once. It creates the tables and
   three test accounts.

4. **Run**

   ```
   npm run dev
   ```

## Test accounts

A database with no employees gets these accounts; the password of each is its own code.

| Role       | Employee code | Password |
| ---------- | ------------- | -------- |
| User       | 11111         | 11111    |
| Supervisor | 22222         | 22222    |
| Admin      | 33333         | 33333    |

## Roles

- **Employee** — sees only their own form; fills in the Self column and submits it.
- **Supervisor** — sees their direct reports; fills in the Supervisor column and confirms the result.
  The employee never sees the supervisor's scores or comments; once the result is confirmed
  their own form shows only their details and "การประเมินเสร็จสิ้นแล้ว" until the next cycle.
- **Admin** — dashboard and 9-Box grid, employee management, and the Form Builder for editing
  the questions and weights of every section per department and level.

## Scoring

`Performance Score = A×0.25 + B×0.40 + C×0.20 + D×0.05 + E×0.10` (weights are editable per
template). Section F (Potential) is not part of the score; it places the employee on the 9-Box
grid. The grade shown beside the score, the Low / Medium / High levels of both scores and
the names of the nine boxes come from the scales that admin edits on the Scale & Rating page;
the starting values are in [`src/lib/constants.ts`](src/lib/constants.ts).

## Security notes

- Sign-in uses the 5-digit employee code and a password. Passwords are stored as scrypt
  hashes, so they cannot be read back; admin sets a new one on the employee page. An account
  with no password cannot sign in.
- There is no limit on failed sign-in attempts yet, and a 5-digit password is short. Add a
  lockout or longer passwords before relying on this for sensitive appraisal data.
- All database access goes through the Next.js server with the service role key. Row Level
  Security is enabled with no policies, so the tables cannot be reached with the public key.
- Never commit `.env.local`.

## Project structure

```
supabase/schema.sql        Database tables and test accounts
src/app/                   Pages and API routes (src/app/api)
src/components/            UI components
src/lib/                   Shared types, scoring, default form templates
src/lib/server/            Server-only code: database, session, access rules
```
