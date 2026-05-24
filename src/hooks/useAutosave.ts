import { useEffect, useRef } from 'react';

export default function useAutosave(pages: { id: string; html: string }[]) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem('notebook.draft', JSON.stringify(pages));
      } catch {}
    };

    // debounce autosave every 10 seconds
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 10000);

    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [pages]);
}
