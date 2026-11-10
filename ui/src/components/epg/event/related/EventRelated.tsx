import { EpgEvent } from '@/clients/api/api.types';
import { Link } from 'react-router-dom';
import styles from './EventRelated.module.scss';
import { useTranslation } from 'react-i18next';

type Props = {
  relatedEvents: EpgEvent[];
};

// Other showings of the programme: the day and time on the left, the channel and what is on in this one on the right.
function EventRelated({ relatedEvents }: Props) {
  const { t } = useTranslation();

  if (relatedEvents.length === 0) {
    return <></>;
  }

  return (
    <div className={styles.EventRelated}>
      <h2 className={styles.heading}>{t('related_events')}</h2>
      <div className={styles.list}>
        {relatedEvents.map((event) => {
          const text = event.subtitle || event.description;
          return (
            <Link
              key={event.id}
              className={styles.item}
              to={`/guide/events/${event.id}`}
              data-testid="related-event"
            >
              <div className={styles.when}>
                <span className={styles.day}>
                  {t('event_weekday_date', { ts: event.startsAt })}
                </span>
                <span className={styles.time}>
                  {t('event_time', { event })}
                </span>
              </div>
              <div className={styles.what}>
                <span className={styles.channel}>{event.channelName}</span>
                {text && (
                  <span className={styles.text} title={text}>
                    {text}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default EventRelated;
