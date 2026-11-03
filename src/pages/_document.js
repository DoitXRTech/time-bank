import { Head, Html, Main, NextScript } from 'next/document';
import Script from 'next/script';
import { THEME_INIT_SCRIPT } from '../lib/theme';

export default function Document() {
  return (
    <Html lang="es">
      <Head />
      <body>
        {/* Sets the `dark` class before first paint (static constant, no user content) */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
