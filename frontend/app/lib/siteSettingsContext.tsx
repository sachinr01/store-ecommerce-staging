'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface SiteSettings {
  placeholder_image: string;
  store_name: string;
  store_currency: string;
  enable_reviews: string;
  enable_ratings: string;
}

const DEFAULT_PLACEHOLDER = '/images/dummy.jpg';

const defaults: SiteSettings = {
  placeholder_image: DEFAULT_PLACEHOLDER,
  store_name: '',
  store_currency: '',
  enable_reviews: 'yes',
  enable_ratings: 'yes',
};

const SiteSettingsContext = createContext<SiteSettings>(defaults);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaults);

  useEffect(() => {
    fetch('/api/site-settings', { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success && json.data) {
          setSettings(prev => ({
            ...prev,
            ...json.data,
            // Ensure placeholder_image always has a valid fallback
            placeholder_image: json.data.placeholder_image || DEFAULT_PLACEHOLDER,
          }));
        }
      })
      .catch(() => {}); // silently keep defaults on error
  }, []);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export const useSiteSettings = () => useContext(SiteSettingsContext);

/** Convenience hook — returns just the placeholder image URL */
export const usePlaceholderImage = () => useContext(SiteSettingsContext).placeholder_image;
