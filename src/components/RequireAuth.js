import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { AUTH_STATUS, useAuth } from '../context/AuthContext';
import es from '../content/es';
import { MAIN_BRAND } from '../content/brands';
import { AccessBlocked } from './AccessBlocked';
import { AppShell } from './AppShell';
import { BrandBackdrop } from './BrandBackdrop';
import { BrandLogo } from './BrandLogo';

/** Shown while the session is being checked: the company logo breathing, instead of a bare text */
function SessionLoading() {
  return (
    <BrandBackdrop className="flex items-center justify-center">
      <div role="status" aria-label={es.app.loading} className="animate-pulse">
        <BrandLogo brand={MAIN_BRAND} className="h-9" />
      </div>
    </BrandBackdrop>
  );
}

/**
 * Gate for private pages. Signed-out visitors go to /login; members that open an
 * admin-only page go back to the balances page (the API enforces this too).
 */
export function RequireAuth({ adminOnly = false, children }) {
  const { status, isAdmin, accessLostReason, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === AUTH_STATUS.SIGNED_OUT) router.replace('/login');
    else if (status === AUTH_STATUS.READY && adminOnly && !isAdmin) router.replace('/');
  }, [status, adminOnly, isAdmin, router]);

  // The account lost its access while the page was open: nothing else of it can be used
  if (status === AUTH_STATUS.READY && accessLostReason) return <AccessBlocked reason={accessLostReason} onSignOut={signOut} />;

  const canRender = status === AUTH_STATUS.READY && (!adminOnly || isAdmin);
  if (!canRender) return <SessionLoading />;

  return <AppShell>{children}</AppShell>;
}
