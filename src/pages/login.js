import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { BrandBackdrop } from '../components/BrandBackdrop';
import { BrandLogo } from '../components/BrandLogo';
import { GoogleIcon } from '../components/GoogleIcon';
import { SiteFooter } from '../components/SiteFooter';
import { AUTH_STATUS, useAuth } from '../context/AuthContext';
import { MAIN_BRAND } from '../content/brands';
import es from '../content/es';
import { isFirebaseConfigured } from '../lib/firebase';

export default function LoginPage() {
  const { status, authError, signIn } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === AUTH_STATUS.READY) router.replace('/');
  }, [status, router]);

  // The popup may be closed or rejected by the server; re-enable the button either way
  useEffect(() => {
    if (authError) setSubmitting(false);
  }, [authError]);

  async function handleSignIn() {
    setSubmitting(true);
    await signIn();
  }

  const firebaseConfigured = isFirebaseConfigured();

  // `dark` forces the dark tokens inside this screen whatever the visitor's saved theme is
  return (
    <BrandBackdrop className="dark flex flex-col bg-paper text-ink">
      <main className="mx-auto flex w-full max-w-[916px] flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full flex-col items-center">
          <div className="animate-fade-in">
            <BrandLogo brand={MAIN_BRAND} className="mb-8 h-9" />
          </div>

          <div className="animate-fade-up w-full max-w-[420px] rounded-[24px] bg-white/[0.12] p-6 text-center [animation-delay:120ms] md:p-10">
            <h1 className="mb-2 text-[24px] font-bold">{es.app.title}</h1>
            <p className="mb-6 text-sm text-ink-soft">{es.login.description}</p>

            <button type="button" className="btn w-full" disabled={submitting || !firebaseConfigured} onClick={handleSignIn}>
              <GoogleIcon />
              {submitting ? es.login.signingIn : es.login.signInWithGoogle}
            </button>

            {!firebaseConfigured && <p className="mt-4 text-sm text-ink-soft">{es.login.firebaseNotConfigured}</p>}
            {authError && (
              <p role="alert" className="mt-4 text-sm text-danger-text">
                {authError}
              </p>
            )}
          </div>
        </div>
      </main>

      <div className="animate-fade-in [animation-delay:240ms]">
        <SiteFooter />
      </div>
    </BrandBackdrop>
  );
}
