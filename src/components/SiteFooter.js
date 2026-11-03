import { BrandStrip } from './BrandStrip';

/**
 * Page footer: a full-width band at the bottom edge of the page with the company logos, centered.
 * The page wraps its content in a flex column with `flex-1` on the content so the footer stays at
 * the bottom even on short pages.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-divider">
      <div className="mx-auto w-full max-w-[916px] px-4 py-8 lg:px-0">
        <BrandStrip className="justify-center" />
      </div>
    </footer>
  );
}
