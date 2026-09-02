import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { apiService } from '../services/apiService';

function shouldTrackPath(pathname: string): boolean {
  if (!pathname || pathname.length > 512) return false;
  if (/^\/(admin|login|register|forgot-password|reset-password|verify-email|create-post)(\/|$)/.test(pathname)) {
    return false;
  }
  if (/^\/post\/[^/]+\/edit$/.test(pathname)) return false;
  return true;
}

export default function SiteAnalytics() {
  const location = useLocation();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!shouldTrackPath(location.pathname)) return;
    if (lastTracked.current === path) return;
    lastTracked.current = path;

    void apiService.recordPageView(path, document.referrer || undefined).catch(() => {});
  }, [location.pathname, location.search]);

  return null;
}
