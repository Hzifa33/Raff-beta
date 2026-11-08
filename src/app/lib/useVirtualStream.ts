// RAFF 4.0.0 — Progressive Virtual Stream Hook (Extreme Performance for Large Datasets)
import { useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualStreamOptions {
  initialCount?: number;
  step?: number;
}

export function useVirtualStream<T>(items: T[], options: VirtualStreamOptions = {}) {
  const initialCount = options.initialCount || 60;
  const step = options.step || 50;

  const [limit, setLimit] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset limit when the list changes meaningfully (e.g. search query or filter changed)
  const itemsLength = items.length;
  const firstItemId = (items[0] as any)?.id || (items[0] as any)?.referenceNumber || itemsLength;

  useEffect(() => {
    setLimit(initialCount);
  }, [itemsLength, firstItemId, initialCount]);

  // Sliced items for render
  const visibleItems = useMemo(() => {
    if (limit >= items.length) return items;
    return items.slice(0, limit);
  }, [items, limit]);

  const hasMore = limit < items.length;

  const loadMore = () => {
    setLimit((prev) => Math.min(items.length, prev + step));
  };

  const loadAll = () => {
    setLimit(items.length);
  };

  // IntersectionObserver to auto-stream next chunk as user scrolls
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          setLimit((prev) => Math.min(items.length, prev + step));
        }
      },
      {
        rootMargin: '400px', // Pre-load before user reaches the very bottom
        threshold: 0.05,
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, items.length, step, limit]);

  return {
    visibleItems,
    hasMore,
    totalCount: items.length,
    showingCount: visibleItems.length,
    loadMore,
    loadAll,
    sentinelRef,
  };
}
