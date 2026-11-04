# CLAUDE.md

Guidance for Claude Code when working in this repository.

> Keep this file short and high-signal. Folder-specific rules → `CLAUDE.md` in that subfolder. Personal preferences → `CLAUDE.local.md` (gitignored).

## What this is

**time-bank** is an internal web app for the team to track **overtime (hours), vacation (days) and holidays pending to exchange (days)** per employee. It replaces the "Banco de Horas" Claude artifact (kept for reference in `docs/reference/banco-de-horas-artifact.html`).

It is a **separate product** from Event+: own repo, own Firebase project, own Vercel project. Never import from or point to the Event+ repos or database.

## Language rules (important)

- **Code is in English**: file names, folders, variables, functions, components, Firestore collections and fields, API error codes, comments, commit messages, PRs, docs.
- **The UI is in Spanish** (users are Spanish speakers). All user-visible text lives in `src/content/es.js` with English keys; components never hardcode text.
- The server only sends stable `code` + `metadata.reason`; `src/lib/errorMessages.js` maps them to Spanish. Never put Spanish in API responses.
- Dates are shown with the `es-CR` locale; "Fecha" values are stored as `YYYY-MM-DD` strings (calendar dates, not instants).

## Commands

```bash
npm run dev       # Next.js dev server (port 3000)
npm run build     # Production build
npm run lint      # ESLint via next lint
npm test          # Jest (fast; domain + lib)
npx jest <path>   # Single test file
```

Before closing any change: `npm run lint` + `npm test` green.

## Stack

Next.js 14 (**Pages Router**) · React 18 · Tailwind CSS 3 · Firebase (Auth on the client; Firestore only through the Admin SDK on the server). JavaScript, not TypeScript — use JSDoc where a shape is not obvious.

Responsive: standard Tailwind breakpoints (`sm:`, `md:`, `lg:`) — the `mdx{n}` scale is specific to admin-eventplus.

## Design

The look follows **admin-eventplus** (see its `DESIGN.md`) so the internal tools feel like one family:

- **One font: Inter** (loaded with `next/font` in `_app.js`), every weight. Numbers use `tabular-nums`, not a mono font.
- **Palette:** near-black ink / near-white paper, one green accent `#33CA75` that only means "active / positive / go". Colors are CSS-variable tokens in `src/styles/globals.css` (light + dark) exposed as Tailwind colors (`bg-paper`, `bg-panel`, `text-ink`, `text-ink-soft`, `border-line`, `bg-primary-wash`, `text-primary-text`, `text-danger-text`, …). Never hardcode hex values in components.
- **Dark mode is class-based** (`.dark` on `<html>`), set before paint by `THEME_INIT_SCRIPT`; default follows the OS, the toggle persists in localStorage.
- **Flat:** buttons and chips get a 1px outline or an alpha-fill, never a shadow. Use the `.btn` (green wash), `.btn-ghost` and `.btn-danger` classes. Radii: 6px chips/compact buttons, 8px buttons/inputs, 16px cards, 24px modals/login card.
- **Type scale:** page title 24/700, section title 22/600, table headers `.th` 12/700, body 14/400, buttons 14/500.
- **Deliberate deviation for accessibility (WCAG AA):** green/red used *as text* on a light background use the darker `primary-text` / `danger-text` tokens; `#33CA75` itself is for fills, outlines and focus rings. Touch targets are ≥ 44px on mobile.
- **Brand glow:** the soft blue/orange glow from the effekktive banner sits behind every page via `<BrandBackdrop>` (`.brand-glow`, tokens `--glow-*`): full strength in dark, a faint tint in light. It is background only; surfaces on top stay flat. `/login` forces the dark theme.
- **Brand logos:** effekktive is the umbrella and the main logo (header, login); the companies under it (Spazio, eventplus.app, mettaclass, Startus, DoitXR) form the logo strip inside `<SiteFooter>`: a full-width band, with the logos centered, pinned to the bottom edge of every page, including `/login` (pages are a flex column with `flex-1` content), in the order of the company's hiring poster. Data in `src/content/brands.js`, files in `public/brand/` as two images per brand (`<id>-on-dark.<ext>` white as designed, `<id>-on-light.<ext>` with the white swapped for ink `#080808`, brand colors untouched), shown with `<BrandLogo>` (follows the theme) and `<BrandStrip>`. Most are SVG; Spazio and DoitXR only came as PNG (white versions, cropped to the logo and 80 px high), so their `logo()` passes `'png'`. To add a brand: drop both files, set its `logo` in `brands.js` (a `null` logo is skipped); `__tests__/brand/logos.test.js` checks the files, sizes and that SVGs have no scripts.
- **One alignment grid:** everything lives in the same 916px column (`max-w-[916px] px-4 lg:px-0`): logo, title, tabs, panels and footer share the left and right edges. The header is one row (logo left, controls right, same axis) and the title starts the next line. Surfaces use `.panel` (20px padding) so text inside panels, cards and history starts on the same line. Form rows use `.form-grid-4` / `.form-grid-5` (fixed columns, `items-end`) so a row always ends at the panel's right edge and fields share a baseline even when a label wraps; keep labels short.
- **Motion** (soft, short, accessible): `<main className="reveal-list">` fades each page section in with a short stagger (`animate-fade-up`), table bodies use `reveal-rows`, the header and login use `animate-fade-in`/`animate-fade-up`, buttons press with `active:scale-[0.98]`, theme switches cross-fade. Loading states use `Skeleton` placeholders (never a bare "Cargando…"), and `RequireAuth` shows the logo pulsing. Everything is disabled under `prefers-reduced-motion`. Do not animate `transform` on an element that also uses a transform on hover (the finished animation would override it): put the animation on a wrapper.
- **Spacing rhythm:** page content is built from `<Section>` (32px above, 12px under its title, 16px inside panels). Never place a card directly under the tabs without a `Section`.

## Architecture

```
lib/                  server only (never imported from components)
  firebase-admin.js   lazy Admin SDK init (no credentials needed at build time)
  auth-middleware.js  withAuth(handler, { requiredRole })
  error-handler.js    handleApiError, routeByMethod
  errors.js           typed errors (ValidationError 400, AuthorizationError 403, ...)
  policies.js         who can see/do what — single place for visibility rules
  services/           employeesService, movementsService (all Firestore access)
src/domain/           pure logic shared by client and server (balances, validation, formatting)
src/pages/api/        thin routes: withAuth(routeByMethod({ GET, POST }))
src/pages, components, hooks, context, lib   client
```

### Data model (Firestore, root collections)

| Collection | Fields |
|---|---|
| `employees/{id}` | `name`, `jobTitle`, `emails` (array, 1–5, lowercase, unique across employees: the whitelist; personal + company), `role` (`admin`\|`member`), `active`, `balances: { overtime, vacation, holiday, birthday }`, `country` (`CR`|`CO`|`AR`|`EC`, required when adding someone), `team`, `hireDate` (the only date of the record), `employmentType` (`payroll`|`professional-services`|`internship`), `scheduleStart`/`scheduleEnd` (free text), `vacationStartDate` (derived, see "Vacation accrual"), `vacationAccruedMonths`, audit fields; older docs may still hold a `socialSecurityDate` that nothing reads |
| `movements/{id}` | `employeeId`, `type` (`overtime`\|`vacation`\|`holiday`), `amount` (signed, multiple of 0.25), `date`, `note`, `createdBy`, `createdAt`, `voidedAt`/`voidedBy`/`voidReason` |
| `requests/{id}` | `employeeId`, `kind` (`overtime`|`vacation`|`holiday`|`birthday`: the balance it is about), `action` (`report`|`redeem`; absent on older docs, see `defaultAction`), `status`|`vacation`), `status` (`pending`\|`approved`\|`rejected`\|`cancelled`), `amount` (positive), `date`, `period` (`YYYY-MM`, overtime only), `note`, `createdAt`, `decidedAt`/`decidedBy`/`decisionNote`, `movementId` |

Rules that must not be broken:

- **Clients never talk to Firestore.** `firestore.rules` denies everything; all reads/writes go through API routes using the Admin SDK.
- **Movements are never deleted**, only voided (who/when/why kept). Voiding reverses the balance.
- **Movements can be corrected** (`updateMovement`: amount, type, date, note, even the person) by an admin. The balance change is applied in the same transaction (old amount out, new amount in) and every correction is appended to the movement's `editHistory` (`at`, `by`, `changes: { field: { from, to } }`). A voided movement cannot be edited. Movements have `source` (`manual` | `import`) so imported ones stay recognisable.
- **A movement and its balance change are written in one transaction** (`movementsService`). The balance is `sum(non-voided movements)`; if they ever disagree, the movements win.
- Timestamps are stored as Firestore `Timestamp` and converted to ISO strings only in `lib/serializers.js`.
- Amounts are quarter steps (0.25) so float sums stay exact. Validated on the server in `src/domain/movementValidation.js`.

### Employee record ("Colaboradores" page)

`/team` (admin only, nav tab "Colaboradores") is the register of collaborators: search + team + status filters, one row per person with hire date (and tenure via `src/domain/tenure.js`), country, employment type, schedule and vacation accrual, plus emails, edit and active toggle, and the form to add someone. Pure filtering lives in `src/domain/employeeFilters.js`. These fields are HR data: only admins list everyone; a member only ever receives their own record from `GET /api/employees`. Do not add a screen that shows them to other members.

### Country, and movements for a whole country

Every collaborator has a **country** (`CR`, `CO`, `AR`, `EC`: `src/domain/countries.js`, names in `es.countries`) because holidays differ by country. It is **required when adding someone** (server: `validateNewEmployee`; form: `EmployeeRecordFields requireCountry`); older records without one can still be saved and set it later, but never go back to none. The sheet does not carry it, so existing people have to be assigned by hand.

**Panel administrador → Registrar movimiento → "Todo un país"** (`CountryMovementForm`, `POST /api/movements/by-country`, admin only) registers the same movement for every **active** collaborator of the chosen country on **one or several days, not necessarily consecutive** (the month's holidays): pick the country, add the dates, write the **required** note, and confirm the summary. **Each date is one day of "Feriados por canjear" (+1 d)**: there is no type or amount to choose (the number of dates is the number of days) and the server ignores any a client sends (`COUNTRY_HOLIDAY`). Other kinds of movement are still registered one person at a time. The confirmation reads "Se sumará 1 día de «Feriados por canjear» por cada fecha a cada colaborador activo de Costa Rica (12 personas): …. Total: 24 movimientos".

- `createCountryMovements` (`lib/services/countryMovementsService.js`): one transaction **per person** (their movements for all the dates + one balance change), so a failure affects only them and is reported (`failedEmployeeIds`); max 31 dates. Movements are normal ones (`source: 'country'`, tagged "Por país", with `country` and a shared `batchId`) and can be edited or voided one by one.
- **Running it again credits nothing twice:** a date already registered for that person, type and country (and not voided) is skipped and counted in `skipped`. People without a country, inactive ones and other countries are never touched; a country with nobody active answers `NO_EMPLOYEES_IN_COUNTRY`.
- Rules in `src/domain/countryMovement.js`: valid country, 1–31 valid dates (repeats dropped), required note.
- **The person (or country) is chosen on purpose every time:** "Registrar movimiento" starts on "Seleccione un colaborador" (required, nobody preselected) and goes back to it after each saved movement; the country form clears its country, dates and note after saving. A refused save keeps what was typed so it can be retried. This avoids registering a second movement for the previous person by accident.

### Forcing a balance ("Ajustar" in the admin summary)

When the spreadsheet import (or a mistake) left a balance wrong, an admin can set it to what it should be: **Panel administrador → Resumen general → Ajustar** opens `BalanceAdjustDialog` with the four balances prefilled, a live preview of what will be registered and a **required note** ("what was done and why").

- It never overwrites a balance: `adjustBalances` (`lib/services/balanceAdjustmentService.js`, `POST /api/employees/:id/balances`, admin only) writes one **`source: 'adjustment'` movement per balance that differs**, for the difference, with the note, dated today and `createdBy` the admin, plus the employee's balance change, all in one transaction. So the history shows it (tagged "Ajuste", also in the collaborator's own history) and the balance stays the sum of the movements. To undo one, void its movement as usual.
- The differences are computed **inside the transaction against what is stored now**, so the balances end up exactly as typed even if one moved while the dialog was open; a repeated send finds nothing to change (`NO_CHANGES`) and writes nothing.
- Rules in `src/domain/balanceAdjustment.js` (pure, tested): values are multiples of 0.25 within ±1000, only the balances sent are touched, at least one must change, the note is required (≤ 500). An inactive person cannot be adjusted. Vacation adjustments do not move the accrual counter: the daily job keeps adding +1 per completed month on top.

### Authentication and roles

- Google sign-in (Firebase Auth) on the client; every API call sends the ID token (`src/lib/apiClient.js`, never raw `fetch`).
- **Access is a whitelist, not a domain rule.** `withAuth` accepts only a verified Google email that is listed in `emails` of an **active** employee (any domain). Anyone else gets `NOT_REGISTERED`. The same person can sign in with any of their emails (we match by email, not by Firebase uid).
- An email belongs to one employee only (checked in a transaction on create/update). An admin cannot remove the email they are signed in with, nor deactivate/demote themselves.
- Documents from before multi-email have a single `email` field; `resolveSignedInEmployee` migrates them on sign-in (and `readEmails` reads both), so that fallback can be deleted once no legacy docs remain.
- First admins: emails in `INITIAL_ADMIN_EMAILS` become admins on their first sign-in. After that admins are managed in the app.
- Visibility today: admins see everyone, members only themselves (`lib/policies.js`).
- **"Ver como colaborador"** (button in the header, admins only): a visual preview for testing. `AuthContext` derives `isAdmin` (what the interface shows) from the real role and the preview flag (`sessionStorage`, this tab only, cleared on sign-out); `isRealAdmin` keeps the way back. In preview the shell hides the tabs, shows a banner, admin pages bounce to `/`, and the balances page keeps only the signed-in person (`employeesInView`). It never changes permissions: the server still sees an admin, so real access checks need a real collaborator account. UI code must use `isAdmin` from `useAuth()`, not `employee.role`.
- **A collaborator (`member`) only has "Consultar saldo"** (their balances, their history and, on the same page, the form and list of their own requests, see "Requests" below): no tab bar (`AppShell`), `/team` and `/admin` bounce them to `/` without rendering (`RequireAuth adminOnly`), and every other API route answers 403 (`requiredRole: ROLES.ADMIN` or `assertAdmin`). Any new admin route or page must use one of those guards; `__tests__/api/collaboratorAccess.test.js` lists every route and fails the other way round if a collaborator can reach it, so add new routes there.

### API route pattern

```js
import { withAuth } from '../../../lib/auth-middleware';
import { routeByMethod } from '../../../lib/error-handler';
import { assertAdmin } from '../../../lib/policies';

async function create(req, res) {
  assertAdmin(req.user.employee);
  const result = await createSomething(req.user.employee, req.body);
  return res.status(201).json({ result });
}
export default withAuth(routeByMethod({ GET: list, POST: create }));
```

Business logic belongs in `lib/services/` or `src/domain/`, not in routes or components.

## Code conventions

- No logic duplication; senior-level, modular, single-responsibility functions; explicit error handling (no empty `catch`).
- Every async `useEffect`/handler has `try/catch` or `.catch`; show errors with `ErrorNotice` / `getErrorMessage`.
- No `dangerouslySetInnerHTML`. No new dependencies without team agreement.
- Validation is always repeated on the server; the form's HTML validation is only UX.
- Domain/service changes come with Jest tests (`__tests__/`).

## Vacation accrual (automatic)

Same rule as the team's sheet (`DATEDIF(start, TODAY(), "m")`): **1 vacation day per complete month** since the employee's `vacationStartDate`, and **only for `payroll` (CCSS) and `professional-services` (S.P)**: interns and people with no contract type set do not accrue (`src/domain/vacationEligibility.js`, also enforced by the daily job).

- **The hire date is the only date.** The form has no "Caja" date and no "Vacaciones desde": the server derives `vacationStartDate` from `hireDate` + `employmentType` (`vacationStartFor` on create, `nextVacationStart` on edit); clients cannot send it. On edit it moves only when the hire date or the contract type changes: the form always re-sends both, so saving anything else never touches a start date loaded from the sheet (which may differ from the hire date). Changing only the contract type keeps an existing start (so months already in the balance are not credited twice); a contract that does not earn vacations clears it (the counter is kept). **Someone with a start date but no contract type no longer accrues until it is set.**

- Pure rule in `src/domain/vacationAccrual.js` (`completedMonths`, `accrualDate`, `monthsToCredit`): a month completes on the same day-of-month it started; from the 31st a short month completes on the 1st of the next one.
- `lib/services/vacationAccrualService.js` credits the missing months as `source: 'accrual'` movements dated when each was earned, in transactions of ≤200 months, moving `balances.vacation` and `vacationAccruedMonths` together. Movement ids are deterministic (`accrual-{employeeId}-{n}`), so a run can never double-credit; a month an admin voids is not credited again (the counter already passed it).
- **Daily job:** Vercel Cron (`vercel.json`, 06:00 UTC = midnight Costa Rica) calls `GET /api/cron/accrue-vacation` with `Authorization: Bearer $CRON_SECRET`. Without `CRON_SECRET` the route refuses to run. It answers 500 if any employee failed. "Today" is the Costa Rica day (`lib/appDate.js`).
- The first time accrual starts (create, or setting the hire date / contract type of someone without a start) lets the admin choose to credit the months already completed (`creditPastMonths`, checked by default) or to count from now because the balance already includes them. Correcting the hire date keeps the counter: the job only tops up, it never takes days back (void the extra movements by hand).
- The accrual only creates +1 vacation movements. Days taken are still registered by an admin as −1 movements.

## Requests (collaborator asks, admin decides)

Replaces the e-mail the team used to send: a collaborator **reports the overtime of a month that already ended** or **redeems** a balance on a specific day (**overtime hours, vacation, a holiday they are owed, their birthday**), and the admins see it in the app. A request moves no balance by itself; once approved, a report adds and a redeem subtracts from the balance it is about.

- **Collaborator** (`/`, below their balance): `RequestForm` + `MyRequests`. The form offers the five `REQUEST_OPTIONS` (`src/domain/requestTypes.js`, texts in `es.requests.options`): report overtime (a finished month, a select with the last 6, + hours), redeem overtime hours (day + hours), vacation (first day + days), redeem a holiday and redeem the birthday (a day, starting at 1 d). Redeems show the person's current balance. `POST /api/requests` always files it under the signed-in person (the body's `employeeId` is ignored); `GET /api/requests?employeeId=` lists their own; `POST /api/requests/:id/cancel` withdraws a pending one (the service only lets the owner). Rejected ones show the admin's reason.
- **Admin alert**: `RequestsInboxProvider` (`src/context/`, mounted in `_app.js`) asks `GET /api/requests` (the pending inbox, admin only) for admins and keeps it fresh (see "Live refresh" below). The header shows the count as a badge on the "Panel administrador" tab and `/admin` opens with the "Solicitudes pendientes" inbox: **Aprobar** / **Rechazar** (a reason is required). A vacation asking for more days than the balance is flagged, not blocked.
- **Approving** (`lib/services/requestsService.js`) writes, in one transaction, the movement (`source: 'request'`, id `request-{requestId}`, `requestId` on the doc), the balance change and the new status: a report is +hours, every redeem is −amount of its own balance (`movementFromRequest`). A redeem may leave the balance below zero (days are sometimes taken in advance): the inbox flags "Supera su saldo", it does not block. The deterministic id and the `pending` check make a double approval impossible. A request of an inactive person stays pending. To change the amount, approve and then edit the movement (the usual correction, with history).
- Rules in `src/domain/requestValidation.js` (pure, tested): the `kind`/`action` pair must be allowed (only overtime can be reported; any balance can be redeemed; no action means what it meant before redeeming existed), amount > 0 in quarter steps, a report needs a month before the current one (company time zone) and is dated its last day, a redeem needs the day it is taken (the first day, for vacation).
- Needs the two composite indexes of `firestore.indexes.json` (`requests`: `status`+`createdAt`, `employeeId`+`createdAt`): deploy them with `firebase deploy --only firestore:indexes` or the queries fail until they exist.
- Not built (ask before adding): e-mail/chat notification to admins (needs a provider and a secret), a history of decided requests for admins (approved ones are visible as movements tagged "Solicitado").

## Live refresh (no F5)

What other people do while a page is open (a request sent, approved or rejected, a balance moved) appears on its own. admin-eventplus does this with Firestore `onSnapshot` listeners in the browser; **time-bank cannot**: `firestore.rules` deny every client read, so the "live" part is **polling the API**. Doing it with listeners would mean rules that let each person read only their own docs (custom claims for role and employee id), which is a security-rules change for its own PR.

- `useApiData(url, { refreshIntervalMs, hiddenRefreshIntervalMs })` (`src/hooks/useApiData.js`, on top of `usePolling`, which owns the timer, the visibility/focus events, the one-at-a-time rule and the `MIN_REFRESH_GAP_MS` spacing): every interval, and when the tab becomes visible or the window gets focus, it asks again **in the background**: never the loading state, never two requests at once, only the newest answer lands, a failure keeps what is on screen (reported through `captureClientException`, retried next tick), and unchanged data keeps the same object so nothing redraws. A hidden tab does not poll, except where `hiddenRefreshIntervalMs` is set (only the admin inbox, once a minute, so the tab title keeps up).
- Intervals live in `src/lib/liveRefresh.js`: `LIVE_REFRESH_MS` (30 s, employees and latest movements), `OWN_REQUESTS_REFRESH_MS` (15 s) and `INBOX_REFRESH_MS` (10 s): the request lists are short and people wait on them. Beyond the timer, entering `/admin` reloads the inbox, filing a request reloads the sender's own inbox, and an answer arriving on `/` reloads the balances (`useOnChange`).
- `LIVE_REFRESH_MS` is the knob for the big lists. **Every tick re-reads every document of the list**, so only cheap lists are polled: the employees list, the own requests, the admin inbox and the team's 15 latest movements. A person's long history and a filtered movement list are not polled; `HistoryPanel` reloads when the polled balances change. Do not add `refreshIntervalMs` to a big list without thinking about reads.
- Polled today: `/` (employees, own requests), `/admin` (employees, latest movements, inbox through `RequestsInboxProvider`, which also feeds the header badge). `/team` (the employees list, so another admin's changes show up). Not polled: the import panels.

### An open page follows the account (deactivation, role, name)

Nobody should have to reload to notice that an admin deactivated them. Two things cooperate:

- **The API client reports a lost account.** `src/lib/apiClient.js` turns a 403 whose reason is `ACCOUNT_DEACTIVATED` or `NOT_REGISTERED` into an `onAccessLost(reason)` event, whichever call got it (a click or a background refresh nobody watches; `useApiData` does not log it as an error). `AuthProvider` listens (only once signed in: while signing in the login screen shows its own message) and sets `accessLostReason`; **`RequireAuth` then renders `AccessBlocked` instead of the page** ("Ya no tiene acceso", why, and a sign-out button), the admin inbox poll stops, and nothing else of the app can be used.
- **The session syncs itself.** While the tab is visible `AuthProvider` asks `GET /api/me` every `SESSION_SYNC_MS` (20 s, 1–2 reads): it covers someone sitting still on a page that polls nothing, **follows role changes** (an admin made collaborator is taken out of the admin pages, and the tabs disappear) and corrected names, and **clears the block by itself** if the access comes back. Coming back to a hidden tab syncs at once. The server was always the real guard (every call of a deactivated account gets 403); this only makes the page say so.
- `next.config.js` sends `Cache-Control: no-store` on `/api/*` and the client fetches with `cache: 'no-store'`: what the API answers is private and always current.
- The admin tab title shows the pending requests, "(2) Banco de Horas", so the alert is seen from another tab or window.
- **Not built:** sound or desktop notifications (they need the browser's permission and a service worker), and real-time delivery (needs the rules change described at the top of this section).

## Deploys: nobody keeps working on old code

Same idea as admin-eventplus (`AppUpdateNotifier`), made firmer because here an old page could send changes the new server no longer expects.

- **Each deploy has an id**: `VERCEL_GIT_COMMIT_SHA`, inlined by `next.config.js` as `NEXT_PUBLIC_APP_BUILD_ID` into both the browser code and the server code (`development` locally, which never reports a mismatch). Vercel must have "Automatically expose System Environment Variables" on (it is by default). A redeploy of the same commit has the same id, so it does not alert.
- **`GET /api/version`** (`src/pages/api/version.js`, public, no database, `no-store`) answers the id of the latest deploy.
- **`AppUpdateNotifier`** (mounted in `_app.js`, also on the login screen) compares it with the id the tab was built with: on opening, every `VERSION_CHECK_MS` (60 s, plus when the tab is visible or focused, via `usePolling`) and at once when the server refuses a change. A mismatch puts a **blocking dialog** over the whole app ("Hay una versión nueva", only button "Actualizar ahora" → reload; Escape and the backdrop do not close it). It stops checking once shown.
- **The server refuses changes from old pages too.** `apiClient` sends `x-app-build` with every call; `withAuth` runs `assertClientIsCurrent` first: a POST/PATCH/PUT/DELETE whose build id differs from the server's answers **409 `APP_OUTDATED`** before anything is read or written (the client turns that into the same dialog, so the window between a deploy and the next check is covered). Reads are never refused; a call without the header (older code, scripts) is let through; the cron job and `/api/version` are not behind `withAuth`.
- Cost: the person can lose what they were typing when the dialog appears; accepted on purpose, because a form sent with old code is worse. Do not remove the server check to make it "less annoying": it is what makes the guarantee real.

## Spreadsheet import (staged, then linked)

**Panel administrador → "Importar datos del Excel"**: paste the Google Sheets link, **Revisar** (shows what would be saved, writes nothing) and **Guardar para asociar**. The server reads the vacations and overtime tabs as CSV and the whole workbook as `.xlsx` for the holiday tabs (the sheet must be shared by link; only docs.google.com links are accepted and the export URL is built server-side from the sheet id; tab ids in `lib/config.js`, overridable with `IMPORT_VACATIONS_GID` / `IMPORT_OVERTIME_GID`).

- **Nothing is tied to an employee at load time.** People are saved in `importProfiles/{key}` (status `pending`) with their movements in `importMovements`. Names written differently across tabs ("Steph" / "Stephanie Carrasco") are merged into one person when they are the same or a close, unambiguous variant; the merged names are kept in `aliases`. A name that matches nobody, or several people equally, becomes its own profile marked `needsReview` (never guessed). Loading the sheet again updates what is pending, leaves linked people alone and brings back discarded ones.
- **Linking** (`lib/services/importLinkService.js`): "Información pendiente de asociar" lists the people (the collaborator with the most similar name is preselected). Linking creates real movements for the employee (`source: import`, deterministic ids so a repeated or interrupted link never duplicates), moves the balances in the same transactions, carries over the vacation start date (accrual counter = months complete at the import day, the job credits later ones) and marks the person `linked`. It refuses a different existing start date and an employee whose accrual already ran (the imported balance would count those days twice).
- **When a collaborator is added**, the app looks for pending people with a similar name (`/api/import-profiles/suggestions`) and asks "¿Quiere asociar la información de …?".
- **Holidays ("Feriados XX 26" tabs, one per country)**: the server also downloads the sheet as `.xlsx` (`lib/xlsx/`, a small zip + OOXML reader, no dependency) because the meaning of a cell lives in its **strikethrough**, which CSV loses. Confirmed with the team: **"Reponer" = the company owes the person a day.** A plain "Reponer" is pending (imported as a `holiday` +1 dated on the holiday); a struck-through "Reponer" was already repaid; "Lo toma"/"Lo tomo adel…" was taken; a date in the cell means the day was repaid on that date; Sábado/Domingo/N/A count nothing. The "Cumpleaños" column works the same way (a pending one becomes a `birthday` +1). "Feriados adeudados 2025" blocks become one opening `holiday` movement with the last running figure (if only dates are listed, the dates are counted and an issue says so). A header date with a mistyped year is fixed with the year most holidays use (`HOLIDAY_YEAR_ADJUSTED`). Parsing: `src/domain/import/holidaysTab.js`; merging into people: `stagingPlan.js`. A holiday tab whose names match nobody becomes a `needsReview` profile like the overtime ones.
- **Hidden rows** (the vacations tab and the holiday tabs hide people who probably left the team) are read from the workbook and shown as "Oculta en la hoja"; they are still imported, a human decides.
- Admin-only API: `POST /api/imports`, `GET /api/import-profiles`, `GET /api/import-profiles/suggestions`, `POST /api/import-profiles/:key/link`, `POST /api/import-profiles/:key/discard`.
- Shared test fakes live in `__tests__/helpers/` (in-memory Firestore, sheet fixtures); Jest ignores that folder.

### Command-line dry run (still available)

The team's old Google Sheet is loaded through `npm run import:dry-run -- --sheet-id <id>` (or `IMPORT_SHEET_ID`). It reads the vacations and overtime tabs as CSV, builds a plan and writes `import-data/dry-run-report.md` + `name-mapping.suggested.json`. **It never writes to Firestore; there is no apply mode** (the admin panel import above replaces it) and it does **not** read the holiday tabs (only the panel does, because it needs the `.xlsx`).

- Pure logic lives in `src/domain/import/` (tested in `__tests__/import/`). Files there use explicit `.js` extensions in relative imports so plain Node can load them from `scripts/`.
- `import-data/` is git-ignored: it holds employee names. Never commit it or paste its report into a PR.
- Vacation start dates are resolved per person: the sheet counts from either the Caja or the Spazio date (chosen by hand per row), so the candidate that reproduces the sheet's total on the import day is used (in the real sheet all 25 people resolve). An apply mode must set `creditPastMonths: false` because the opening balance already includes those months.
- Only identical names are matched automatically; fuzzy matches are suggestions that a human confirms in `import-data/name-mapping.json` (`{ "name in overtime tab": "full name" }`).
- Overtime rows are cross-checked against the sheet's running balance; hours carried over before the ledger become an opening movement; unreadable dates borrow the person's previous date. Everything assumed is listed in the report.
- The employee record (team, hire date, "Método" -> employment type, schedule) is read from the vacations tab, kept on the pending person and copied to the employee when linked, **only into fields the employee has empty** (what an admin typed is never overwritten). "No aplica" / "Pendiente" become empty. The "Caja" column is not part of the record any more (an allowlist in `importLinkService` keeps it out even for people staged before); it is still read as a candidate when resolving the vacation start date.

## Git / PR

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).
- Flag in the PR: changes to `firestore.rules`, env vars, auth/role logic.
- Never push straight to `main`; use a PR.

## Environment

See `.env.example`. `NEXT_PUBLIC_*` is public by design — no secrets there. Never commit `.env*` or service account keys.

**`overrides.jwks-rsa` in `package.json` is deliberate, do not remove it.** `firebase-admin` 14 pulls `jwks-rsa` 4, which `require()`s `jose` 6 (ESM-only). Vercel's function runtime refuses that (`ERR_REQUIRE_ESM`) and every `/api` route answered 500 on startup, even though it works on a local Node 24. Pinned to 3.2.x (`jose` 4, dual CJS/ESM) it loads anywhere. Reproduce the failure locally with `node --no-experimental-require-module -e "require('firebase-admin/auth')"`; revisit when Vercel's runtime supports `require(esm)`.

## Observability (pending)

Sentry (`@sentry/nextjs`, org `doitxr`) is not wired yet. `lib/monitoring.js` and `src/lib/clientMonitoring.js` are the only seams to change when it is.
