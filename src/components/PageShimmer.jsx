export default function PageShimmer() {
  return (
    <div role="status" aria-label="Loading page" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-7 space-y-3">
        <div className="loading-shimmer h-3 w-36 rounded-full" />
        <div className="loading-shimmer h-9 w-60 max-w-[70vw] rounded-xl" />
        <div className="loading-shimmer h-4 w-[32rem] max-w-full rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="card space-y-4 p-5" key={index}>
            <div className="loading-shimmer size-10 rounded-xl" />
            <div className="loading-shimmer h-4 w-2/3 rounded-full" />
            <div className="loading-shimmer h-8 w-1/2 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="card mt-5 space-y-4 p-5">
        <div className="loading-shimmer h-12 w-full rounded-xl" />
        {Array.from({ length: 5 }, (_, index) => (
          <div className="flex items-center gap-4" key={index}>
            <div className="loading-shimmer size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="loading-shimmer h-4 w-2/5 rounded-full" />
              <div className="loading-shimmer h-3 w-3/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
