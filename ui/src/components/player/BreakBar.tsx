import { nextBreak, previousBreak, timeAt } from '@/utils/breaks';

import { Chapter } from '@/clients/api/api.types';
import styles from './BreakBar.module.scss';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  breaks: Chapter[];
  duration: number;
  time: number;
  onSeek: (seconds: number) => void;
};

// A timeline under the video: the whole recording as a bar, the ad breaks as coloured stretches, and the playhead.
// Tap or drag to seek; previous / next break buttons jump between breaks. It is plain page content, so it works the
// same in every browser (the video's own controls keep working as they are).
export default function BreakBar({ breaks, duration, time, onSeek }: Props) {
  const { t } = useTranslation();
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  if (breaks.length === 0 || !(duration > 0)) {
    return null;
  }

  const seekTo = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (r) {
      onSeek(timeAt(clientX, r.left, r.width, duration));
    }
  };
  const prev = previousBreak(breaks, time);
  const next = nextBreak(breaks, time);
  const pct = (s: number) =>
    `${Math.min(100, Math.max(0, (s / duration) * 100))}%`;

  return (
    <div className={styles.root} data-testid="break-bar">
      <div
        ref={bar}
        className={styles.bar}
        role="slider"
        tabIndex={0}
        aria-label={t('break_bar_label')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && seekTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            onSeek(Math.min(duration, time + 10));
          } else if (e.key === 'ArrowLeft') {
            onSeek(Math.max(0, time - 10));
          }
        }}
      >
        {breaks.map((b) => (
          <div
            key={b.start}
            className={styles.ad}
            style={{ left: pct(b.start), width: pct(b.end - b.start) }}
            data-testid="break-segment"
          />
        ))}
        <div className={styles.played} style={{ width: pct(time) }} />
        <div className={styles.head} style={{ left: pct(time) }} />
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          disabled={prev === null}
          onClick={() => prev !== null && onSeek(prev)}
        >
          ‹ {t('break_prev')}
        </button>
        <span className={styles.count}>
          {t('break_count', { count: breaks.length })}
        </span>
        <button
          type="button"
          disabled={next === null}
          onClick={() => next !== null && onSeek(next)}
        >
          {t('break_next')} ›
        </button>
      </div>
    </div>
  );
}
