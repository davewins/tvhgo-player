import { Brand, useTheme } from '@/contexts/ThemeContext';
import React, { PropsWithChildren } from 'react';

import BrandLogo from '../../brand/BrandLogo';
import styles from './LoginCard.module.scss';

type Props = {
  title?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
};

function LoginCard(props: PropsWithChildren<Props>) {
  const { brand } = useTheme();
  return (
    <div className={styles.card}>
      <div className={styles.imageHeader}>
        {brand === Brand.ORIGINAL ? (
          <img className={styles.image} src="/img/tvhgo.png" />
        ) : (
          <BrandLogo size="large" />
        )}
      </div>
      <form
        title={props.title}
        className={styles.form}
        onSubmit={props.onSubmit}
      >
        {props.children}
      </form>
    </div>
  );
}

export default LoginCard;
