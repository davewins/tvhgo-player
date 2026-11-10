import { formatBytes, hoursLabel, percentUsed } from '@/utils/storage';
import { useEffect, useState } from 'react';

import { StorageStatus } from '@/clients/api/api.types';
import { getStorage } from '@/clients/api/api';
import styles from './StorageBar.module.scss';
import { useTranslation } from 'react-i18next';

// How much of the space Tvheadend allows for recordings is used, with the disk and the limits that decide it.
export default function StorageBar() {
  const { t } = useTranslation();
  const [s, setS] = useState<StorageStatus | null>(null);
  // the detail line is long: open on a wide screen, folded away on a phone
  const [open, setOpen] = useState(window.innerWidth > 700);

  useEffect(() => {
    let live = true;
    getStorage()
      .then((r) => live && setS(r.available ? r : null))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, []);

  if (!s) {
    return null;
  }

  const used = s.recordings.masterBytes + s.recordings.playableBytes;
  const pct = percentUsed(used, s.allowanceBytes);
  const level = pct >= 90 ? styles.high : pct >= 75 ? styles.warn : '';
  const hours = hoursLabel(s.hoursLeft);
  const limit =
    s.limits.minFreeBytes > 0 || s.limits.maxUsedBytes > 0
      ? [
          s.limits.minFreeBytes > 0 &&
            t('storage_keep_free', {
              size: formatBytes(s.limits.minFreeBytes),
            }),
          s.limits.maxUsedBytes > 0 &&
            t('storage_max_used', {
              size: formatBytes(s.limits.maxUsedBytes),
            }),
        ]
          .filter(Boolean)
          .join(' · ')
      : t('storage_no_limit');

  return (
    <div className={styles.panel} data-testid="storage-bar">
      <div className={styles.head}>
        <strong>{t('storage')}</strong>
        <span>
          {t('storage_used_of', {
            used: formatBytes(used),
            allowance: formatBytes(s.allowanceBytes),
            percent: pct,
          })}
        </span>
      </div>
      <div
        className={`${styles.bar} ${level}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('storage')}
      >
        <div
          className={styles.originals}
          style={{
            width: `${(s.recordings.masterBytes / s.allowanceBytes) * 100}%`,
          }}
          title={`${t('storage_originals')}: ${formatBytes(s.recordings.masterBytes)}`}
        />
        <div
          className={styles.copies}
          style={{
            width: `${(s.recordings.playableBytes / s.allowanceBytes) * 100}%`,
          }}
          title={`${t('storage_copies')}: ${formatBytes(s.recordings.playableBytes)}`}
        />
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.originalsDot} />
          {t('storage_originals')} {formatBytes(s.recordings.masterBytes)}
        </span>
        <span>
          <i className={styles.copiesDot} />
          {t('storage_copies')} {formatBytes(s.recordings.playableBytes)}
        </span>
      </div>
      <details
        className={styles.foot}
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>{t('storage_details')}</summary>
        {t('storage_disk', {
          used: formatBytes(s.disk.usedBytes),
          total: formatBytes(s.disk.totalBytes),
          free: formatBytes(s.disk.freeBytes),
        })}
        {' · '}
        {limit}
        {hours && ` · ${t('storage_hours_left', { hours })}`}
      </details>
    </div>
  );
}
