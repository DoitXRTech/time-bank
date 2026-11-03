/**
 * Page wrapper with the effekktive glow (soft blue + orange from the bottom corner, like the
 * company banner). The glow is a fixed layer behind the content, so it stays put while the page
 * scrolls. `isolate` keeps it above the wrapper's own background but below the content.
 */
export function BrandBackdrop({ children, className = '' }) {
  return (
    <div className={`relative isolate min-h-screen ${className}`}>
      <div aria-hidden="true" className="brand-glow pointer-events-none fixed inset-0 -z-10" />
      {children}
    </div>
  );
}
