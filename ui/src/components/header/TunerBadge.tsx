import { busyList, isFull, joinNames } from '@/utils/tuners';

import styles from './TunerBadge.module.scss';
import { useTranslation } from 'react-i18next';
import { useTuners } from '@/hooks/tuners';

// Shows how many tuners are in use, only while something is using one. Amber when none is free.
export default function TunerBadge() {
  const { t } = useTranslation();
  const status = useTuners();

  if (!status || status.busy === 0) {
    return null;
  }

  const full = isFull(status);
  const using = joinNames(busyList(status));
  return (
    <div
      className={`${styles.badge} ${full ? styles.full : ''}`}
      title={using ? `${t('tuners_in_use')}: ${using}` : t('tuners_in_use')}
      data-testid="tuner-badge"
    >
      <span className={styles.dot} />
      <span className={styles.long}>{t('tuners_in_use')}&nbsp;</span>
      {status.busy}/{status.total}
    </div>
  );
}
