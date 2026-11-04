# time-bank 

Internal app to track the team's **overtime hours, vacation days and holidays pending to exchange**. Next.js + Tailwind + Firebase. UI in Spanish, code in English.

Read [`CLAUDE.md`](CLAUDE.md) for architecture, data model and conventions.

## Setup

1. Create a **new Firebase project** (not the Event+ one): enable **Authentication → Google** and **Firestore** (production mode).
2. Add the Web app to get the `NEXT_PUBLIC_FIREBASE_*` values, and generate a service account key (Project settings → Service accounts) for the `FIREBASE_*` values.
3. Copy `.env.example` to `.env.local` and fill it in. Set `INITIAL_ADMIN_EMAILS` (the first admins).
4. In Authentication → Settings → Authorized domains, add `localhost` and the Vercel domains.
   - Set `CRON_SECRET` (any long random string) in `.env.local` and in Vercel. The daily vacation accrual (`vercel.json`) uses it; without it the job refuses to run. Test it locally with `curl -H "Authorization: Bearer <secret>" http://localhost:3000/api/cron/accrue-vacation`.
5. Deploy rules and indexes:

   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project-id>
   ```

6. Run it:

   ```bash
   npm install
   npm run dev
   ```

The first admin signs in with an email listed in `INITIAL_ADMIN_EMAILS` and adds the rest of the team from **Panel administrador → Colaboradores**.

**Who can sign in:** only people whose Google email is registered on an active employee (a whitelist). Each employee can have up to 5 emails (e.g. personal and company), all of them work. Nobody else gets in, whatever their domain. Sign-in is Google only: disable the Email/Password provider in Firebase Authentication.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Jest |

## Reference

`docs/reference/banco-de-horas-artifact.html` is the original single-file Claude artifact this app is based on. It is kept only for reference (its data and logic were moved into this app).
