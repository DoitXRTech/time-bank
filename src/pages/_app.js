import Head from 'next/head';
import { Inter } from 'next/font/google';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthProvider } from '../context/AuthContext';
import { RequestsInboxProvider } from '../context/RequestsInboxContext';
import { ThemeProvider } from '../context/ThemeContext';
import es from '../content/es';
import '../styles/globals.css';

// Same family as admin-eventplus; one family for every weight
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export default function App({ Component, pageProps }) {
  return (
    <div className="font-sans">
      {/* On :root (not on this wrapper) so anything rendered in a portal on <body>, like the dialogs, gets Inter too */}
      <style jsx global>{`
        :root {
          --font-inter: ${inter.style.fontFamily};
        }
      `}</style>
      <Head>
        <title>{es.app.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <RequestsInboxProvider>
              <Component {...pageProps} />
            </RequestsInboxProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  );
}
