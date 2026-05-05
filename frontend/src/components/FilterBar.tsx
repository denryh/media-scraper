interface FilterBarProps {
  type: string;
  search: string;
  onTypeChange: (type: string) => void;
  onSearchChange: (search: string) => void;
}

export function FilterBar({ type, search, onTypeChange, onSearchChange }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <select
        value={type}
        onChange={(e) => onTypeChange(e.target.value)}
        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
      >
        <option value="">All types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
      </select>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search media URLs or titles..."
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
