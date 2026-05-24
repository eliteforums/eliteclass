import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SearchInput
// ---------------------------------------------------------------------------
// A controlled search field that debounces the `onChange` callback so parent
// components are not updated on every keystroke.
//
// • Renders a Search icon on the left inside the input padding area.
// • Renders an X button on the right whenever `value` is non-empty, allowing
//   the user to clear the field in one click.
// • `debounceMs` (default 300 ms) controls how long to wait after the last
//   keystroke before calling `onChange`.
// ---------------------------------------------------------------------------

interface SearchInputProps {
  /** The controlled value of the input. */
  value: string;
  /**
   * Called with the latest debounced value.
   * Note: the clear (X) button calls this synchronously with an empty string.
   */
  onChange: (value: string) => void;
  /** Placeholder text. Defaults to "Search…". */
  placeholder?: string;
  /**
   * Milliseconds to wait after the last keystroke before firing `onChange`.
   * Defaults to 300.
   */
  debounceMs?: number;
  /** Additional Tailwind classes merged on the outermost wrapper. */
  className?: string;
}

/**
 * `SearchInput` — debounced search field with icon decorations.
 *
 * The component maintains its own internal "draft" state for immediate
 * display while the debounced `onChange` lags behind to avoid excessive
 * re-renders in parent components.
 *
 * @example
 * ```tsx
 * const [query, setQuery] = React.useState("");
 *
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search students…"
 *   debounceMs={400}
 * />
 * ```
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  // ── Internal draft state ─────────────────────────────────────────────────
  // Keep a local copy so the input stays snappy while the debounce timer runs.
  const [draft, setDraft] = React.useState(value);

  // Sync draft when the external value is reset (e.g. from a "Clear filters"
  // button outside this component).
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  // ── Debounce logic ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (draft === value) return; // nothing actually changed upstream

    const timer = setTimeout(() => {
      onChange(draft);
    }, debounceMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, debounceMs]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  const handleClear = () => {
    setDraft("");
    onChange(""); // clear is always immediate — no debounce needed
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") handleClear();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={cn("relative flex items-center", className)}>
      {/* Leading search icon */}
      <Search
        className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />

      <input
        type="search"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label={placeholder}
        className={cn(
          // Layout
          "h-9 w-full rounded-lg border border-input bg-background",
          // Padding: leave room for icons
          "pl-9 pr-9 text-sm text-foreground",
          // Placeholder
          "placeholder:text-muted-foreground",
          // States
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Remove the native clear button in Chrome/Safari — we use our own
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />

      {/* Trailing clear button — only visible when there is a value */}
      {draft && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className={cn(
            "absolute right-2.5 flex size-5 items-center justify-center rounded-full",
            "text-muted-foreground transition-colors duration-150",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
