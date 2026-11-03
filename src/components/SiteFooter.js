import { BrandStrip } from './BrandStrip';

/**
 * Page footer: a full-width band at the bottom edge of the page with the company logos and,
 * optionally, a small note under them. The page wraps its content in a flex column with
 * `flex-1` on the content so the footer stays at the bottom even on short pages.
 */
export function SiteFooter({ note, centered = false }) {
  return (
    <footer className="border-t border-divider">
      <div className="mx-auto w-full max-w-[916px] px-4 py-8 lg:px-0">
        <BrandStrip className={centered ? 'justify-center' : ''} />
        {note && <p className={`mt-6 text-xs text-ink-soft ${centered ? 'text-center' : ''}`}>{note}</p>}
      </div>
    </footer>
  );
}
