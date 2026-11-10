import styles from './TunerBadge.module.scss';
import { summary } from '@/utils/pipeline';
import { usePipeline } from '@/hooks/pipeline';
import { useTranslation } from 'react-i18next';

// "Converting Emmerdale 62%" while the background pipeline works; amber if something failed. Hidden when idle.
export default function PipelineBadge() {
  const { t } = useTranslation();
  const s = summary(usePipeline());
  if (!s || s.idle) {
    return null;
  }

  const parts: string[] = [];
  if (s.current) {
    const pct =
      s.current.percent !== null ? ` ${Math.round(s.current.percent)}%` : '';
    parts.push(
      `${t(s.current.step === 'convert_mp4' ? 'pipeline_converting' : `pipeline_step_${s.current.step}`, { defaultValue: s.current.step })} ${s.current.title}${pct}`
    );
  }
  if (s.waiting > 0) {
    parts.push(t('pipeline_waiting', { count: s.waiting }));
  }
  if (s.failed > 0) {
    parts.push(t('pipeline_failed', { count: s.failed }));
  }
  const warn = s.failed > 0 && !s.current;

  return (
    <div
      className={`${styles.badge} ${warn ? styles.full : ''}`}
      title={parts.join(' · ')}
      data-testid="pipeline-badge"
    >
      <span className={styles.dot} />
      <span className={styles.long}>{parts[0]}</span>
      <span className={styles.short}>
        {s.current?.percent !== null && s.current?.percent !== undefined
          ? `${Math.round(s.current.percent)}%`
          : '…'}
      </span>
    </div>
  );
}
