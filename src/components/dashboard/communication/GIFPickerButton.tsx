import { useState, useRef, useEffect, useCallback } from "react";
import { ImageIcon, Search, Loader2, X } from "lucide-react";

const GIPHY_API_KEY = "dc6zaTOxFJmzC"; // Public beta key
const GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search";
const GIPHY_TRENDING_URL = "https://api.giphy.com/v1/gifs/trending";

interface GiphyImage {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_height_small: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
    };
  };
}

interface GIFPickerButtonProps {
  onSelectGif: (gifUrl: string) => void;
  disabled?: boolean;
}

export function GIFPickerButton({ onSelectGif, disabled }: GIFPickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Load trending GIFs when panel opens
  useEffect(() => {
    if (isOpen && gifs.length === 0 && !query) {
      fetchTrending();
    }
  }, [isOpen]);

  async function fetchTrending() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${GIPHY_TRENDING_URL}?api_key=${GIPHY_API_KEY}&limit=20&rating=g`,
      );
      if (!response.ok) throw new Error("Failed to fetch GIFs");
      const data = await response.json();
      setGifs(data.data ?? []);
    } catch {
      setError("GIFs temporarily unavailable");
      setGifs([]);
    } finally {
      setIsLoading(false);
    }
  }

  const searchGifs = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      fetchTrending();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${GIPHY_SEARCH_URL}?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20&rating=g`,
      );
      if (!response.ok) throw new Error("Failed to search GIFs");
      const data = await response.json();
      setGifs(data.data ?? []);
    } catch {
      setError("GIF search unavailable");
      setGifs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(value);
    }, 400);
  }

  function handleSelectGif(gif: GiphyImage) {
    const gifUrl = gif.images.fixed_height.url;
    onSelectGif(gifUrl);
    setIsOpen(false);
    setQuery("");
  }

  function togglePanel() {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setQuery("");
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={togglePanel}
        disabled={disabled}
        className="inline-flex items-center justify-center rounded-lg border bg-background px-2.5 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="GIF picker"
        title="Send a GIF"
      >
        <ImageIcon className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-80 max-h-96 bg-background border rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
          {/* Search header */}
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={handleSearchChange}
              placeholder="Search GIFs..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  fetchTrending();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* GIF grid */}
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {error}
              </div>
            ) : gifs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No GIFs found
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => handleSelectGif(gif)}
                    className="relative overflow-hidden rounded-md hover:ring-2 hover:ring-primary transition-all aspect-video bg-muted"
                    title={gif.title}
                  >
                    <img
                      src={gif.images.fixed_height_small.url}
                      alt={gif.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GIPHY attribution */}
          <div className="px-2 py-1.5 border-t text-center">
            <span className="text-[10px] text-muted-foreground">Powered by GIPHY</span>
          </div>
        </div>
      )}
    </div>
  );
}
