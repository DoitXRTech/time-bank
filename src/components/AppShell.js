import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useRequestsInbox } from '../context/RequestsInboxContext';
import es, { interpolate } from '../content/es';
import { BrandBackdrop } from './BrandBackdrop';
import { BrandLogo } from './BrandLogo';
import { SiteFooter } from './SiteFooter';
import { ThemeToggle } from './ThemeToggle';
import { MAIN_BRAND } from '../content/brands';

function NavTab({ href, active, badge, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-sm font-medium transition-colors sm:flex-none ${
        active ? 'bg-primary-wash text-primary-text' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
      {badge}
    </Link>
  );
}

/** Alert on the admin tab: how many collaborator requests are waiting for a decision */
function PendingRequestsBadge({ count }) {
  if (!count) return null;
  const label = count === 1 ? es.requests.inbox.badgeLabelOne : interpolate(es.requests.inbox.badgeLabel, { count });
  return (
    <>
      <span aria-hidden="true" className="num ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-primary bg-panel px-1.5 text-xs font-bold text-primary-text">
        {count}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** Reminder (always on top) while an admin looks at the platform as a collaborator would */
function PreviewBanner({ onExit }) {
  return (
    <div className="sticky top-0 z-20 border-b border-primary bg-panel">
      <div className="mx-auto flex w-full max-w-[916px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs lg:px-0">
        <p role="status">{es.preview.banner}</p>
        <button type="button" className="btn !min-h-[36px] !px-3 !text-xs" onClick={onExit}>
          {es.preview.exit}
        </button>
      </div>
    </div>
  );
}

function UserBadge({ name, onSignOut }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-sm font-semibold"
      >
        {name?.[0]?.toUpperCase()}
      </span>
      <span className="hidden text-sm md:inline">{name}</span>
      <button type="button" className="btn-ghost !min-h-[40px] !px-3" onClick={onSignOut}>
        {es.nav.signOut}
      </button>
    </div>
  );
}

export function AppShell({ children }) {
  const { employee, signOut, isAdmin, isRealAdmin, previewAsMember, setPreviewAsMember } = useAuth();
  const { pathname } = useRouter();
  const { count: pendingRequests } = useRequestsInbox();

  // The page is a column: content grows and the footer stays at the bottom edge, even when the
  // content is short. Vertical rhythm inside: 24px logo row→title, 4px title→subtitle, 24px →tabs, and
  // every page section starts with its own 32px top margin (see Section).
  return (
    <BrandBackdrop className="flex flex-col">
      {/* The count is in the tab title too, so it is seen from another tab or window */}
      <Head>
        <title>{isAdmin && pendingRequests > 0 ? interpolate(es.app.titleWithPending, { count: pendingRequests }) : es.app.title}</title>
      </Head>
      {previewAsMember && <PreviewBanner onExit={() => setPreviewAsMember(false)} />}
      <div className="mx-auto w-full max-w-[916px] flex-1 px-4 pb-12 pt-6 sm:pb-16 md:pt-8 lg:px-0">
        <header className="animate-fade-in">
          {/* One row: the logo and the controls share a horizontal axis; the title starts the next line */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
            <Link href="/" className="inline-flex">
              <BrandLogo brand={MAIN_BRAND} className="h-7" />
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isRealAdmin && !previewAsMember && (
                <button type="button" className="btn-ghost !min-h-[40px] !px-3 !text-xs" onClick={() => setPreviewAsMember(true)}>
                  {es.preview.enter}
                </button>
              )}
              <ThemeToggle />
              <UserBadge name={employee?.name} onSignOut={signOut} />
            </div>
          </div>

          <h1 className="mt-6 text-[24px] font-bold leading-tight">{es.app.title}</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">{es.app.subtitle}</p>

          {/* A collaborator only has "Consultar saldo": no tab bar at all, not even a lone tab */}
          {isAdmin && (
            <nav className="mt-6 flex max-w-full gap-1 overflow-x-auto rounded-[8px] bg-white/50 p-1 sm:inline-flex dark:bg-white/10">
              <NavTab href="/" active={pathname === '/'}>
                {es.nav.balances}
              </NavTab>
              <NavTab href="/team" active={pathname === '/team'}>
                {es.nav.team}
              </NavTab>
              <NavTab href="/admin" active={pathname === '/admin'} badge={<PendingRequestsBadge count={pendingRequests} />}>
                {es.nav.admin}
              </NavTab>
            </nav>
          )}
        </header>

        <main className="reveal-list">{children}</main>
      </div>

      <SiteFooter />
    </BrandBackdrop>
  );
}
