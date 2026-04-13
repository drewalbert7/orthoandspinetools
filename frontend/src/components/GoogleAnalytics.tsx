import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SCRIPT_ID = 'ga4-gtag-js';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isValidGaMeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]+$/i.test(value.trim());
}

function getMeasurementId(): string {
  const raw = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? '';
  return isValidGaMeasurementId(raw) ? raw.trim() : '';
}

export default function GoogleAnalytics() {
  const location = useLocation();
  const measurementId = getMeasurementId();
  const [gtagReady, setGtagReady] = useState(false);

  useEffect(() => {
    if (!measurementId) return;

    window.dataLayer = window.dataLayer ?? [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer!.push(args);
      };
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      window.gtag('js', new Date());
      window.gtag('config', measurementId, { send_page_view: false });
      setGtagReady(true);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onload = () => {
      window.gtag!('js', new Date());
      window.gtag!('config', measurementId, { send_page_view: false });
      setGtagReady(true);
    };
    script.onerror = () => {};
    document.head.appendChild(script);
  }, [measurementId]);

  useEffect(() => {
    if (!measurementId || !gtagReady || typeof window.gtag !== 'function') return;
    const path = `${location.pathname}${location.search}`;
    window.gtag('config', measurementId, {
      page_path: path,
    });
  }, [measurementId, gtagReady, location.pathname, location.search]);

  return null;
}
