import React, { useEffect, useRef } from 'react';

type Cleanup = () => void;

/**
 * Mounts the OC-style canvas globe (`/js/ost-live-globe.js`) into a prepared DOM shell.
 * Fetches `/api/analytics/globe` on its own poll timer.
 */
const LiveGlobe: React.FC = () => {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: Cleanup | undefined;

    (async () => {
      try {
        const mod = (await import(
          /* @vite-ignore */ `${window.location.origin}/js/ost-live-globe.js`
        )) as { initLiveGlobe: (el: HTMLElement, opts?: { mode?: string; pollMs?: number }) => Cleanup };
        if (cancelled || !root) return;
        cleanup = mod.initLiveGlobe(root, { mode: 'visitors', pollMs: 12_000 });
      } catch (err) {
        console.warn('[LiveGlobe] failed to load', err);
        const sub = root.querySelector('[data-g-sub]');
        if (sub) sub.textContent = 'live map offline';
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <aside
      ref={rootRef as React.RefObject<HTMLElement>}
      className="ost-stats-panel"
      data-oc-globe=""
      aria-label="Live visitors map — real traffic only"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-stats-mono text-[0.62rem] uppercase tracking-[0.16em] text-[var(--ost-accent)]">
          live map · real visitors
        </h2>
        <span className="font-stats-mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--ost-muted)]">
          GeoIP · live + all-time countries
        </span>
      </div>
      <div className="globe-grid">
        <div className="globe-wrap">
          <canvas className="globe-canvas" aria-label="Interactive globe of real visitors" />
        </div>
        <div className="globe-side min-w-0">
          <div className="g-count">
            <span className="g-num" data-g-live>
              —
            </span>
            <span className="g-lab">people on the site right now</span>
          </div>
          <p className="g-sub" data-g-sub>
            loading live map…
          </p>
          <div className="g-legend">
            <span>
              <i className="g-swatch live" aria-hidden />
              live visitors (<span data-g-pins>0</span>)
            </span>
            <span>
              <i className="g-swatch place" aria-hidden />
              countries all time
            </span>
          </div>
          <ul className="g-feed" data-g-feed />
          <div className="g-chips" data-g-regions hidden aria-label="Visitors by state" />
          <div className="g-chips" data-g-countries hidden aria-label="Visitors by country" />
        </div>
      </div>
    </aside>
  );
};

export default LiveGlobe;
