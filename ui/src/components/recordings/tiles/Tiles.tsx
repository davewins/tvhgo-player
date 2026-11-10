import Checkbox from '@/components/common/checkbox/Checkbox';
import { Recording } from '@/clients/api/api.types';
import { Show } from '@/utils/shows';
import { TestIds } from '@/__test__/ids';
import { c } from '@/utils/classNames';
import styles from './Tiles.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function Thumb({
  id,
  className,
  onClick,
}: {
  id: string;
  className: string;
  onClick: () => void;
}) {
  const [noThumb, setNoThumb] = useState(false);
  return noThumb ? (
    <div className={className} onClick={onClick} />
  ) : (
    <img
      className={className}
      src={`/api/recordings/${id}/thumb`}
      alt=""
      loading="lazy"
      onClick={onClick}
      onError={() => setNoThumb(true)}
    />
  );
}

type ShowProps = { show: Show; layout: 'grid' | 'list'; onOpen: () => void };

// A show: the latest episode's picture, the title and how many episodes there are.
export function ShowTile({ show, layout, onOpen }: ShowProps) {
  const { t } = useTranslation();
  const count = show.episodes.length;
  return (
    <div
      className={c(styles.tile, layout === 'list' ? styles.row : '')}
      tabIndex={0}
      role="button"
      aria-label={show.title}
      data-testid={TestIds.SHOW_TILE}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.thumbWrap}>
        <Thumb id={show.latest.id} className={styles.thumb} onClick={onOpen} />
        {count > 1 && <span className={styles.badge}>{count}</span>}
      </div>
      <div className={styles.text}>
        <span className={styles.title}>{show.title}</span>
        <span className={styles.secondary}>
          {count > 1 ? `${t('episodes_count', { count })} • ` : ''}
          {t('short_date', { ts: show.latest.startsAt })}
        </span>
      </div>
    </div>
  );
}

type EpisodeProps = {
  recording: Recording;
  onOpen: () => void;
  selected: boolean;
  onSelection: (selected: boolean) => void;
};

// One recording as a card (the list layout reuses RecordingListItem).
export function EpisodeTile({
  recording,
  onOpen,
  selected,
  onSelection,
}: EpisodeProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.tile} tabIndex={0}>
      <div className={styles.thumbWrap}>
        <Thumb id={recording.id} className={styles.thumb} onClick={onOpen} />
        <div className={styles.check}>
          <Checkbox
            onChange={onSelection}
            checked={selected}
            testId={TestIds.SELECT_RECORDING_CHECKBOX}
          />
        </div>
      </div>
      <div className={styles.text} onClick={onOpen}>
        <span className={styles.title}>
          {recording.subtitle || recording.title}
        </span>
        <span className={styles.secondary}>
          {recording.channelName} • {t('event_datetime', { event: recording })}
        </span>
      </div>
    </div>
  );
}
