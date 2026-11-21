import { Brand, Theme, ThemeContext } from '@/contexts/ThemeContext';
import { PropsWithChildren, ReactElement, useEffect, useState } from 'react';

const LOCAL_STORAGE_KEY = 'tvhgo_theme';
const BRAND_STORAGE_KEY = 'tvhgo_brand';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const saved = read(LOCAL_STORAGE_KEY);
const savedBrand = read(BRAND_STORAGE_KEY);

// Favicon, home-screen icon, manifest and browser colour follow the brand.
const BRAND_HEAD = {
  [Brand.ORIGINAL]: {
    icon: '/favicon.ico',
    apple: '/logo192.png',
    manifest: '/manifest.webmanifest',
  },
  [Brand.VEWINS]: {
    icon: '/img/vewins/favicon.svg',
    apple: '/img/vewins/apple-touch-icon.png',
    manifest: '/vewins.webmanifest',
  },
};

function applyHead(brand: Brand) {
  const head = BRAND_HEAD[brand];
  const set = (selector: string, href: string) => {
    const el = document.querySelector<HTMLLinkElement>(selector);
    if (el) {
      el.href = href;
    }
  };
  set('link[rel="icon"]', head.icon);
  set('link[rel="apple-touch-icon"]', head.apple);
  set('link[rel="manifest"]', head.manifest);
}

export function ThemeProvider({
  children,
}: PropsWithChildren<unknown>): ReactElement {
  const [theme, setTheme] = useState<Theme>(Theme.DARK);
  const [brand, setBrand] = useState<Brand>(
    Object.values(Brand).includes(savedBrand as Brand)
      ? (savedBrand as Brand)
      : Brand.VEWINS
  );

  useEffect(() => {
    if (!Object.values(Theme).includes(saved as Theme)) {
      return;
    }

    setTheme(saved as Theme);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.setAttribute('data-brand', brand);
    applyHead(brand);
  }, [brand]);

  function setThemePersistent(theme: Theme) {
    setTheme(theme);
    localStorage.setItem(LOCAL_STORAGE_KEY, theme);
  }

  function setBrandPersistent(brand: Brand) {
    setBrand(brand);
    localStorage.setItem(BRAND_STORAGE_KEY, brand);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: setThemePersistent,
        brand,
        setBrand: setBrandPersistent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
