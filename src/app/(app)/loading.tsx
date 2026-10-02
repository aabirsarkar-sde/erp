// Shown instantly when a link is clicked, while the server prepares the next page.
// Next.js prefetches this shell, so navigation feels immediate even on a slow connection.
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-slate-200/70";
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Loading">
      <div className={`${bar} mb-2 h-7 w-56`} />
      <div className={`${bar} mb-6 h-4 w-80 max-w-full`} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card h-20 p-4"><div className={`${bar} mb-2 h-3 w-20`} /><div className={`${bar} h-6 w-16`} /></div>)}
      </div>
      <div className="card divide-y divide-slate-100">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className={`${bar} size-8 rounded-full`} />
            <div className="flex-1 space-y-2"><div className={`${bar} h-3.5 w-2/3`} /><div className={`${bar} h-3 w-1/3`} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
