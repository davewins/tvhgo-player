import styles from './PipelineChip.module.scss';
import { usePipeline } from '@/hooks/pipeline';
import { useTranslation } from 'react-i18next';
import { workFor } from '@/utils/pipeline';

// A small label on a recording while the background pipeline is converting it, has it waiting, or has failed on it.
export default function PipelineChip({ recordingId }: { recordingId: string }) {
  const { t } = useTranslation();
  const work = workFor(usePipeline(), recordingId);
  if (!work) {
    return null;
  }

  if (work.kind === 'converting') {
    const label =
      work.step === 'convert_mp4'
        ? t('pipeline_converting')
        : t(`pipeline_step_${work.step}`, { defaultValue: work.step });
    return (
      <span className={styles.chip} data-testid="pipeline-chip">
        {label}
        {work.percent !== null && ` ${Math.round(work.percent)}%`}
        {work.percent !== null && (
          <span className={styles.bar}>
            <span style={{ width: `${work.percent}%` }} />
          </span>
        )}
      </span>
    );
  }
  if (work.kind === 'failed') {
    return (
      <span
        className={`${styles.chip} ${styles.failed}`}
        data-testid="pipeline-chip"
      >
        {work.giveUp ? t('pipeline_gave_up') : t('pipeline_failed_retry')}
      </span>
    );
  }
  return (
    <span className={styles.chip} data-testid="pipeline-chip">
      {t('pipeline_queued')}
    </span>
  );
}
