import { c } from '@/utils/classNames';
import moment from 'moment';
import styles from './GuideEvent.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  eventId: number;
  title: string;
  subtitle: string;
  description: string;
  startsAt: number;
  endsAt: number;
  showProgress?: boolean;
  dvrState?: string;
  showDate?: boolean;
  channel?: string;
  // show the programme's artwork beside the text; fallbackImage (e.g. the channel logo) stands in when there is none
  showThumb?: boolean;
  fallbackImage?: string;
  onClick: (eventId: number) => void;
};

function GuideEvent({
  eventId,
  title,
  subtitle,
  description,
  startsAt,
  endsAt,
  showProgress,
  dvrState,
  showDate,
  channel,
  showThumb,
  fallbackImage,
  onClick,
}: Props) {
  const { t } = useTranslation();
  const [noArt, setNoArt] = useState(false);

  const time = showDate
    ? t('event_datetime', { event: { startsAt, endsAt } })
    : t('event_time', { event: { startsAt, endsAt } });

  const extra = subtitle || description;

  const renderProgress = () => {
    const width = Math.floor(
      ((moment().unix() - startsAt) / (endsAt - startsAt)) * 100
    );

    if (width < 1) {
      return;
    }

    return (
      <div
        className={styles.progress}
        style={{
          width: `${width}%`,
        }}
      />
    );
  };

  const renderRecBadge = () => {
    if (dvrState === 'scheduled' || dvrState === 'recording') {
      return (
        <span className={styles.recBadge} title={t('recording_running')} />
      );
    }
  };

  const text = (
    <>
      <span title={title} className={c(styles.name, styles.attribute)}>
        {title}
      </span>
      <span title={extra} className={c(styles.subtitle, styles.attribute)}>
        {extra}
      </span>
      {channel && (
        <span title={channel} className={c(styles.channel, styles.attribute)}>
          {channel}
        </span>
      )}
      <span title={time} className={c(styles.time, styles.attribute)}>
        {time}
      </span>
    </>
  );

  const renderThumb = () =>
    noArt ? (
      <div className={styles.thumbFallback}>
        {fallbackImage && <img src={fallbackImage} alt="" loading="lazy" />}
      </div>
    ) : (
      <img
        className={styles.thumb}
        src={`/api/epg/events/${eventId}/thumb`}
        alt=""
        loading="lazy"
        onError={() => setNoArt(true)}
      />
    );

  return (
    <div
      className={c(styles.event, showThumb ? styles.withThumb : '')}
      onClick={() => onClick(eventId)}
      tabIndex={0}
    >
      {showThumb && renderThumb()}
      {showThumb ? <div className={styles.body}>{text}</div> : text}
      {showProgress && renderProgress()}
      {renderRecBadge()}
    </div>
  );
}

export default GuideEvent;
