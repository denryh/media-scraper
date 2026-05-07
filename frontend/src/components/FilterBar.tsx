interface FilterBarProps {
  type: string;
  search: string;
  onTypeChange: (type: string) => void;
  onSearchChange: (search: string) => void;
}

const TYPES = [
  { value: '', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
] as const;

export function FilterBar({ type, search, onTypeChange, onSearchChange }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
        {TYPES.map((t) => {
          const active = type === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onTypeChange(t.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="relative flex-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search URLs or titles…"
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-zinc-400 transition focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-white/5"
        />
      </div>
    </div>
  );
}
