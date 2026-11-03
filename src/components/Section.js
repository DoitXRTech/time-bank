/**
 * Titled block with the app's standard vertical rhythm (32px above, 12px under the title).
 * By default the content sits on a flat `.panel`; `bare` leaves it directly on the page, for
 * content that already is made of cards (e.g. the balance cards).
 */
export function Section({ title, children, bare = false, className = '' }) {
  return (
    <section className={`mt-8 ${className}`}>
      {title && <h2 className="mb-3 text-[22px] font-semibold">{title}</h2>}
      {bare ? children : <div className="panel">{children}</div>}
    </section>
  );
}
