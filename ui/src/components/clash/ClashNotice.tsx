import { Clash } from '@/clients/api/api.types';
import moment from 'moment';
import styles from './ClashNotice.module.scss';
import { useTranslation } from 'react-i18next';

type Props = {
  clashes: Clash[];
  // headline override, e.g. "Recording this would clash"
  title?: string;
};

const muxCount = (c: Clash) => new Set(c.entries.map((e) => e.mux)).size;

// Lists periods in which more multiplexes are needed than there are tuners, with the recordings involved.
export default function ClashNotice({ clashes, title }: Props) {
  const { t } = useTranslation();
  if (clashes.length === 0) {
    return null;
  }

  return (
    <div className={styles.notice} role="alert" data-testid="clash-notice">
      <strong>
        {title ??
          (clashes.length === 1
            ? t('clash_summary_one')
            : t('clash_summary_many', { count: clashes.length }))}
      </strong>
      {clashes.map((c) => (
        <div className={styles.clash} key={`${c.start}-${c.end}`}>
          <div className={styles.when}>
            {t('clash_when', {
              day: moment.unix(c.start).format('ddd D MMM'),
              from: moment.unix(c.start).format('LT'),
              to: moment.unix(c.end).format('LT'),
            })}
          </div>
          <div>{t('clash_intro', { count: muxCount(c) })}</div>
          <ul>
            {c.entries.map((e) => (
              <li key={e.id}>
                {e.title || '?'}
                {e.channel ? ` · ${e.channel}` : ''}
                <span className={styles.mux}> ({e.mux})</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className={styles.tip}>{t('clash_tip')}</div>
    </div>
  );
}
