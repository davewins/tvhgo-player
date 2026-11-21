import { createContext, useContext } from 'react';

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}

// Branding: the original tvhgo look, or the custom (vewins) kit, which follows the light/dark theme.
export enum Brand {
  ORIGINAL = 'original',
  VEWINS = 'vewins',
}

type ThemeContextProps = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  brand: Brand;
  setBrand: (brand: Brand) => void;
};

export const ThemeContext = createContext<ThemeContextProps>({
  theme: Theme.DARK,
  setTheme: () => {
    throw new Error('not implemented');
  },
  brand: Brand.VEWINS,
  setBrand: () => {
    throw new Error('not implemented');
  },
});

export const useTheme = () => {
  return useContext(ThemeContext);
};
