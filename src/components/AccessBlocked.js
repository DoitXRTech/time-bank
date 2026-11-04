import es from '../content/es';
import { MAIN_BRAND } from '../content/brands';
import { BrandBackdrop } from './BrandBackdrop';
import { BrandLogo } from './BrandLogo';

/**
 * Shown instead of any page when the server says the signed-in person lost their access (their
 * account was deactivated, or their email removed): nothing else can be done on the page. It goes
 * away by itself if the access comes back (the session keeps asking), so there is nothing to retry.
 */
export function AccessBlocked({ reason, onSignOut }) {
  const labels = es.accessLost;

  return (
    <BrandBackdrop className="flex items-center justify-center px-4">
      <div role="alert" className="panel w-full max-w-[460px] animate-fade-up text-center">
        <BrandLogo brand={MAIN_BRAND} className="mx-auto mb-6 h-8" />
        <h1 className="text-[22px] font-bold">{labels.title}</h1>
        <p className="mt-3 text-sm">{labels.message[reason] ?? labels.message.ACCOUNT_DEACTIVATED}</p>
        <p className="mt-3 text-xs text-ink-soft">{labels.hint}</p>
        <button type="button" className="btn-ghost mt-6" onClick={onSignOut}>
          {es.nav.signOut}
        </button>
      </div>
    </BrandBackdrop>
  );
}
