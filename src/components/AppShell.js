import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import es from '../content/es';
import { BrandBackdrop } from './BrandBackdrop';
import { BrandLogo } from './BrandLogo';
import { SiteFooter } from './SiteFooter';
import { ThemeToggle } from './ThemeToggle';
import { MAIN_BRAND } from '../content/brands';

function NavTab({ href, active, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[40px] items-center rounded-[8px] px-4 text-sm font-medium transition-colors ${
        active ? 'bg-primary-wash text-primary-text' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </Link>
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

  // The page is a column: content grows and the footer stays at the bottom edge, even when the
  // content is short. Vertical rhythm inside: 24px logo row→title, 4px title→subtitle, 24px →tabs, and
  // every page section starts with its own 32px top margin (see Section).
  return (
    <BrandBackdrop className="flex flex-col">
      {previewAsMember && <PreviewBanner onExit={() => setPreviewAsMember(false)} />}
      <div className="mx-auto w-full max-w-[916px] flex-1 px-4 pb-16 pt-6 md:pt-8 lg:px-0">
        <header className="animate-fade-in">
          {/* One row: the logo and the controls share a horizontal axis; the title starts the next line */}
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex">
              <BrandLogo brand={MAIN_BRAND} className="h-7" />
            </Link>
            <div className="flex items-center gap-2">
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
            <nav className="mt-6 inline-flex gap-1 rounded-[8px] bg-white/50 p-1 dark:bg-white/10">
              <NavTab href="/" active={pathname === '/'}>
                {es.nav.balances}
              </NavTab>
              <NavTab href="/team" active={pathname === '/team'}>
                {es.nav.team}
              </NavTab>
              <NavTab href="/admin" active={pathname === '/admin'}>
                {es.nav.admin}
              </NavTab>
            </nav>
          )}
        </header>

        <main className="reveal-list">{children}</main>
      </div>

      <SiteFooter note={es.app.footnote} />
    </BrandBackdrop>
  );
}
