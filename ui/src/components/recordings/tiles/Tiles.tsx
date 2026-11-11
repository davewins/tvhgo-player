import { formatBytes, recordingBytes, totalBytes } from '@/utils/storage';
import { fraction, isWatched } from '@/utils/progress';
import { useLayoutEffect, useRef, useState } from 'react';

import Checkbox from '@/components/common/checkbox/Checkbox';
import PipelineChip from '@/components/pipeline/PipelineChip';
import { Recording } from '@/clients/api/api.types';
import { Show } from '@/utils/shows';
import { TestIds } from '@/__test__/ids';
import { c } from '@/utils/classNames';
import styles from './Tiles.module.scss';
import { useTranslation } from 'react-i18next';
import { useWatchProgress } from '@/hooks/progress';

function Thumb({
  id,
  className,
  onClick,
  fallback,
}: {
  id: string;
  className: string;
  onClick: () => void;
  // shown when the recording has no picture (nothing recorded yet and no artwork match): the channel logo
  fallback?: string;
}) {
  const [noThumb, setNoThumb] = useState(false);
  return noThumb ? (
    <div className={c(className, styles.thumbFallback)} onClick={onClick}>
      {fallback && <img src={fallback} alt="" loading="lazy" />}
    </div>
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

type ShowProps = {
  show: Show;
  layout: 'grid' | 'list';
  onOpen: () => void;
  // selecting a show selects all of its recordings
  selected?: boolean;
  // some, but not all, of its recordings are selected
  partial?: boolean;
  onSelection?: (selected: boolean) => void;
};

// A show: the latest episode's picture, the title and how many episodes there are.
// thin bar along the bottom of the picture: how far you have watched (full and dimmed once watched)
function WatchBar({ recordingId }: { recordingId: string }) {
  const { t } = useTranslation();
  const progress = useWatchProgress().get(recordingId);
  const f = fraction(progress);
  if (!progress || f <= 0) {
    return null;
  }
  const watched = isWatched(progress);
  return (
    <div
      className={c(styles.watch, watched ? styles.watched : '')}
      title={watched ? t('recording_watched') : undefined}
      data-testid="watch-bar"
    >
      <div style={{ width: `${watched ? 100 : f * 100}%` }} />
    </div>
  );
}

export function ShowTile({
  show,
  layout,
  onOpen,
  selected = false,
  partial = false,
  onSelection,
}: ShowProps) {
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
        <Thumb
          id={show.latest.id}
          className={styles.thumb}
          onClick={onOpen}
          fallback={`/api/picon/${show.latest.piconId}`}
        />
        {count > 1 && <span className={styles.badge}>{count}</span>}
        {onSelection && (
          <div
            className={styles.check}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              onChange={onSelection}
              checked={selected}
              indeterminate={partial}
              testId={TestIds.SELECT_SHOW_CHECKBOX}
            />
          </div>
        )}
      </div>
      <div className={styles.text}>
        <span className={styles.title}>{show.title}</span>
        <span className={styles.secondary}>
          {[
            count > 1 ? t('episodes_count', { count }) : '',
            totalBytes(show.episodes) > 0
              ? formatBytes(totalBytes(show.episodes))
              : '',
          ]
            .filter(Boolean)
            .join(' • ')}
        </span>
        <span className={styles.secondary}>
          {t('short_date', { ts: show.latest.startsAt })}
        </span>
      </div>
    </div>
  );
}

type EpisodeProps = {
  recording: Recording;
  // open the recording's page (details, padding, delete...)
  onOpen: () => void;
  // play it right away (finished recordings)
  onPlay?: () => void;
  selected: boolean;
  onSelection: (selected: boolean) => void;
};

// The programme text of a recording: Freeview often puts the synopsis in the subtitle.
export function describe(rec: Recording): string {
  return [rec.subtitle, rec.description]
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(' ')
    .trim();
}

// One recording as a card: click the picture to play, the text for the details, the box to select.
export function EpisodeTile({
  recording,
  onOpen,
  onPlay,
  selected,
  onSelection,
}: EpisodeProps) {
  const { t } = useTranslation();
  const text = describe(recording);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // is the description cut off? (then it can be expanded; on a phone there is no hover)
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !expanded) {
      setClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text, expanded]);

  return (
    <div className={styles.tile} tabIndex={0}>
      <div className={styles.thumbWrap}>
        <Thumb
          id={recording.id}
          className={c(styles.thumb, onPlay ? styles.playable : '')}
          onClick={onPlay ?? onOpen}
          fallback={`/api/picon/${recording.piconId}`}
        />
        <PipelineChip recordingId={recording.id} />
        <WatchBar recordingId={recording.id} />
        {onPlay && (
          <span className={styles.playIcon} aria-hidden="true">
            ▶
          </span>
        )}
        <div className={styles.check}>
          <Checkbox
            onChange={onSelection}
            checked={selected}
            testId={TestIds.SELECT_RECORDING_CHECKBOX}
          />
        </div>
      </div>
      <div className={styles.text}>
        <span className={styles.title} onClick={onOpen}>
          {t('short_date', { ts: recording.startsAt })}
        </span>
        <span className={c(styles.secondary, styles.wrap)}>
          {recording.channelName} • {t('event_time', { event: recording })}
          {recordingBytes(recording) > 0 &&
            ` • ${formatBytes(recordingBytes(recording))}`}
        </span>
        {text && (
          <>
            <p
              ref={textRef}
              className={c(styles.description, expanded ? styles.expanded : '')}
              title={text}
              onClick={() => setExpanded((e) => !e)}
            >
              {text}
            </p>
            {(clamped || expanded) && (
              <button
                type="button"
                className={styles.more}
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? t('show_less') : t('show_more')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
