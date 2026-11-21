import { Brand, Theme, useTheme } from '@/contexts/ThemeContext';

import MarkOnDark from '@/assets/brand/mark_on_dark.svg?react';
import MarkOnLight from '@/assets/brand/mark_on_light.svg?react';
import { TvhgoHorizontalLogo } from '@/assets';
import styles from './BrandLogo.module.scss';

type Props = {
  // `large` is the login card; the default is the header
  size?: 'large';
  className?: string;
};

// The app's logo: the original artwork, or the custom mark with the (unchanged) tvhgo name.
function BrandLogo({ size, className }: Props) {
  const { brand, theme } = useTheme();

  if (brand === Brand.ORIGINAL) {
    return <TvhgoHorizontalLogo className={className} />;
  }

  const Mark = theme === Theme.LIGHT ? MarkOnLight : MarkOnDark;
  return (
    <span
      className={`${styles.logo} ${size === 'large' ? styles.large : ''}`}
      aria-label="tvhgo"
      role="img"
    >
      <Mark className={styles.mark} aria-hidden="true" />
      <span className={styles.name}>tvhgo</span>
    </span>
  );
}

export default BrandLogo;
