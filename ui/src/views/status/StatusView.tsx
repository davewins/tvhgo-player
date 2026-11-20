import { convertEta, formatDuration, recordingFraction } from '@/utils/status';
import { useEffect, useState } from 'react';

import Headline from '@/components/common/headline/Headline';
import { PipelineStatus } from '@/clients/api/api.types';
import moment from 'moment';
import styles from './StatusView.module.scss';
import { usePipeline } from '@/hooks/pipeline';
import { useTranslation } from 'react-i18next';
import { useTuners } from '@/hooks/tuners';
import { useUpcoming } from '@/hooks/activity';
import { viewerLabel } from '@/utils/tuners';

const stepKey = (step: string) =>
  step === 'convert_mp4' ? 'pipeline_converting' : `pipeline_step_${step}`;

function Bar({ fraction }: { fraction: number }) {
  return (
    <span className={styles.bar}>
      <span style={{ width: `${Math.round(fraction * 100)}%` }} />
    </span>
  );
}

export function Component() {
  const { t } = useTranslation();
  const upcoming = useUpcoming();
  const pipeline: PipelineStatus | null = usePipeline();
  const tuners = useTuners();

  // re-render every few seconds so "time left" counts down between polls
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(id);
  }, []);

  const recording = (upcoming ?? []).filter((r) => r.status === 'recording');
  const next = (upcoming ?? [])
    .filter((r) => r.status !== 'recording' && r.startsAt > now)
    .slice(0, 6);
  const clock = (ts: number) => moment.unix(ts).format('LT');
  const when = (ts: number) =>
    moment.unix(ts).calendar(null, { sameElse: 'ddd D MMM [at] LT' });

  const waiting = pipeline
    ? pipeline.queue.filter((q) => q.id !== pipeline.current?.id)
    : [];
  const busyTuners = (tuners?.tuners ?? []).filter((x) => x.busy);

  return (
    <div className={styles.view} data-testid="status-view">
      <Headline>{t('status_title')}</Headline>

      <section className={styles.card}>
        <h3>{t('status_recording_now')}</h3>
        {recording.length === 0 ? (
          <p className={styles.none}>{t('status_nothing_recording')}</p>
        ) : (
          recording.map((r) => (
            <div key={r.id} className={styles.item} data-testid="status-rec">
              <div className={styles.head}>
                <span className={styles.title}>
                  <span className={styles.recDot} />
                  {r.title}
                </span>
                <span className={styles.meta}>
                  {t('status_on', { channel: r.channelName })}
                </span>
              </div>
              <Bar fraction={recordingFraction(r.startsAt, r.endsAt, now)} />
              <div className={styles.meta}>
                {t('status_started', { time: clock(r.startsAt) })} ·{' '}
                {t('status_ends', { time: clock(r.endsAt) })} ·{' '}
                <strong>
                  {t('status_left', {
                    time: formatDuration(r.endsAt - now),
                  })}
                </strong>
              </div>
              <div className={styles.hint}>{t('status_convert_after')}</div>
            </div>
          ))
        )}
      </section>

      <section className={styles.card}>
        <h3>{t('status_converting')}</h3>
        {pipeline === null ? (
          <p className={styles.none}>{t('status_pipeline_unavailable')}</p>
        ) : (
          <>
            {pipeline.current ? (
              <div className={styles.item} data-testid="status-converting">
                <div className={styles.head}>
                  <span className={styles.title}>{pipeline.current.title}</span>
                  <span className={styles.meta}>
                    {t(stepKey(pipeline.current.step), {
                      defaultValue: pipeline.current.step,
                    })}
                    {pipeline.current.percent !== null &&
                      ` ${Math.round(pipeline.current.percent)}%`}
                  </span>
                </div>
                {pipeline.current.percent !== null && (
                  <Bar fraction={pipeline.current.percent / 100} />
                )}
                <div className={styles.meta}>
                  {(() => {
                    const eta = convertEta(
                      pipeline.current.percent,
                      pipeline.current.since,
                      now
                    );
                    return eta === null
                      ? t('status_eta_unknown')
                      : t('status_eta', { time: formatDuration(eta) });
                  })()}{' '}
                  ·{' '}
                  {t('status_elapsed', {
                    time: formatDuration(now - pipeline.current.since),
                  })}
                </div>
              </div>
            ) : (
              <p className={styles.none}>{t('status_nothing_converting')}</p>
            )}

            {waiting.length > 0 && (
              <>
                <h4>
                  {t('status_waiting')} ({waiting.length})
                </h4>
                <ul className={styles.list}>
                  {waiting.map((q) => (
                    <li key={q.id}>{q.title}</li>
                  ))}
                </ul>
              </>
            )}

            {pipeline.failed.length > 0 && (
              <>
                <h4 className={styles.warn}>
                  {t('status_failed')} ({pipeline.failed.length})
                </h4>
                <ul className={styles.list}>
                  {pipeline.failed.map((f) => (
                    <li key={f.id}>
                      <strong>{f.title}</strong>
                      <span className={styles.meta}>
                        {' '}
                        {t(stepKey(f.step), { defaultValue: f.step })} ·{' '}
                        {f.retry_at === null
                          ? t('status_gave_up', { count: f.attempts })
                          : t('status_will_retry', {
                              time: formatDuration(f.retry_at - now),
                            })}
                      </span>
                      {f.detail && (
                        <div className={styles.detail}>{f.detail}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h3>{t('status_next')}</h3>
        {next.length === 0 ? (
          <p className={styles.none}>{t('status_nothing_next')}</p>
        ) : (
          <ul className={styles.list}>
            {next.map((r) => (
              <li key={r.id} data-testid="status-next">
                <strong>{r.title}</strong>
                <span className={styles.meta}>
                  {' '}
                  {when(r.startsAt)} · {r.channelName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h3>{t('status_tuners')}</h3>
        {busyTuners.length === 0 ? (
          <p className={styles.none}>{t('status_tuners_free')}</p>
        ) : (
          <ul className={styles.list}>
            {busyTuners.map((x) => (
              <li key={x.name}>
                <strong>{x.name}</strong>
                <span className={styles.meta}>
                  {' '}
                  {x.mux} ·{' '}
                  {x.users
                    .map((u) =>
                      u.kind === 'live'
                        ? [u.channel, t('status_live'), viewerLabel(u)]
                            .filter(Boolean)
                            .join(' · ')
                        : u.title
                    )
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

Component.displayName = 'StatusView';
