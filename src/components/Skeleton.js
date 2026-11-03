/** Pulsing placeholder shown while data loads, so the page fills in instead of jumping */
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** A balance-card sized placeholder (same padding and height as the real card) */
export function BalanceCardSkeleton() {
  return (
    <div aria-hidden="true" className="panel">
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="mt-2 h-3.5 w-2/5" />
      <div className="mt-3 flex flex-col gap-3 border-t border-divider pt-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder rows for a table that is still loading */
export function TableRowsSkeleton({ rows = 4 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 py-2">
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-5 w-full" />
      ))}
    </div>
  );
}
