import { Link } from 'react-router-dom';
import styles from './TunerBadge.module.scss';
import { useRecordingNow } from '@/hooks/activity';
import { useTranslation } from 'react-i18next';

// "Recording Emmerdale" (just "REC" on a phone) while something is being recorded. Opens the Status page.
export default function RecordingBadge() {
  const { t } = useTranslation();
  const now = useRecordingNow();
  if (now.length === 0) {
    return null;
  }
  const label =
    now.length === 1
      ? `${t('status_recording')} ${now[0].title}`
      : t('status_recording_count', { count: now.length });
  return (
    <Link
      to="/status"
      className={`${styles.badge} ${styles.rec}`}
      title={now.map((r) => r.title).join(' · ')}
      data-testid="recording-badge"
    >
      <span className={styles.dot} />
      <span className={styles.long}>{label}</span>
      <span className={styles.short}>
        {t('status_rec_short')}
        {now.length > 1 && ` ${now.length}`}
      </span>
    </Link>
  );
}
