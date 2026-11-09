import { EpgChannel, EpgEvent } from '@/clients/api/api.types';
import {
  LoaderFunctionArgs,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

import EmptyState from '@/components/common/emptyState/EmptyState';
import Player from '@/components/player/Player';
import { getEpg } from '@/clients/api/api';
import moment from 'moment';
import styles from './ChannelGuideView.module.scss';
import { useTranslation } from 'react-i18next';

// Layout: 1 minute = PX_PER_MIN pixels. The guide covers the selected day from `axisStart` to `axisEnd`.
const PX_PER_MIN = 5;
const SPAN_HOURS = 30; // the day plus the early hours of the next one
const DAYS = 8;

type LoaderData = {
  epg: EpgChannel[];
  dayStart: number;
  axisStart: number;
  axisEnd: number;
  isToday: boolean;
};

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<LoaderData> {
  const day = new URL(request.url).searchParams.get('day');
  const todayStart = moment().startOf('day').unix();
  const dayStart = day
    ? Math.max(parseInt(day, 10) || todayStart, todayStart)
    : todayStart;
  const isToday = dayStart === todayStart;
  // today starts at the previous half hour (the programme on now overlaps it); other days at midnight
  const axisStart = isToday
    ? Math.floor(moment().unix() / 1800) * 1800
    : dayStart;
  const axisEnd = dayStart + SPAN_HOURS * 3600;
  // tvheadend filters by programme START, so ask from a day earlier to include programmes that began before the
  // left edge (e.g. the one on now); the grid clips them at axisStart
  const epg = await getEpg({
    startsAt: axisStart - 24 * 3600,
    endsAt: axisEnd,
    sort_key: 'channelNumber',
    limit: 1000,
  });
  return { epg: epg || [], dayStart, axisStart, axisEnd, isToday };
}

const px = (seconds: number) => (seconds / 60) * PX_PER_MIN;

function GuideRow({
  channel,
  axisStart,
  axisEnd,
  now,
  onPlay,
  onEvent,
  onChannel,
}: {
  channel: EpgChannel;
  axisStart: number;
  axisEnd: number;
  now: number;
  onPlay: (c: EpgChannel) => void;
  onEvent: (e: EpgEvent) => void;
  onChannel: (c: EpgChannel) => void;
}) {
  const { t } = useTranslation();
  // a channel without a logo (id 0, or the image fails to load) shows its name instead
  const [noLogo, setNoLogo] = useState(channel.piconId === 0);
  return (
    <div className={styles.row}>
      <div className={styles.channel}>
        <span
          className={styles.number}
          title={t('channel_programmes')}
          onClick={() => onChannel(channel)}
        >
          {channel.channelNumber}
        </span>
        <button
          type="button"
          className={styles.logo}
          title={`${t('watch_live')}: ${channel.channelName}`}
          aria-label={`${t('watch_live')}: ${channel.channelName}`}
          onClick={() => onPlay(channel)}
        >
          {noLogo ? (
            <span className={styles.logoName}>{channel.channelName}</span>
          ) : (
            <img
              className={styles.picon}
              src={`/api/picon/${channel.piconId}`}
              alt={channel.channelName}
              loading="lazy"
              onError={() => setNoLogo(true)}
            />
          )}
        </button>
      </div>
      <div className={styles.events} style={{ width: px(axisEnd - axisStart) }}>
        {channel.events.map((e) => {
          const start = Math.max(e.startsAt, axisStart);
          const end = Math.min(e.endsAt, axisEnd);
          if (end <= start) {
            return null;
          }
          const live = e.startsAt <= now && now < e.endsAt;
          const past = e.endsAt <= now;
          const recording =
            e.dvrState === 'scheduled' || e.dvrState === 'recording';
          const detail = e.subtitle || e.description;
          return (
            <div
              key={e.id}
              className={`${styles.event} ${live ? styles.live : ''} ${past ? styles.past : ''}`}
              style={{
                left: px(start - axisStart),
                width: px(end - start) - 2,
              }}
              title={`${e.title}\n${moment.unix(e.startsAt).format('LT')} - ${moment.unix(e.endsAt).format('LT')}${detail ? '\n' + detail : ''}`}
              onClick={() => (live ? onPlay(channel) : onEvent(e))}
            >
              <span className={styles.title}>
                {recording && (
                  <span
                    className={styles.rec}
                    aria-label={t('recording_scheduled')}
                  />
                )}
                {e.title}
              </span>
              <span className={styles.meta}>
                {moment.unix(e.startsAt).format('LT')}
                {detail ? ` · ${detail}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Component() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const { epg, dayStart, axisStart, axisEnd, isToday } =
    useLoaderData() as LoaderData;

  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(moment().unix());
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<EpgChannel | null>(null);

  // keep the "now" line moving, and refresh the data now and then so ended programmes drop out
  useEffect(() => {
    const tick = setInterval(() => setNow(moment().unix()), 30000);
    const refresh = setInterval(
      () => {
        if (isToday && !playing) {
          revalidator.revalidate();
        }
      },
      5 * 60 * 1000
    );
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [isToday, playing]);

  // initial scroll: today starts at "now"; other days open at 18:00
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollLeft = isToday ? 0 : px(18 * 3600);
    }
  }, [dayStart]);

  const channels = useMemo(
    () =>
      epg.filter((c) =>
        c.channelName.toLowerCase().includes(search.toLowerCase())
      ),
    [epg, search]
  );

  const ticks = useMemo(() => {
    const list: { at: number; hour: boolean }[] = [];
    const first = Math.ceil(axisStart / 1800) * 1800;
    for (let at = first; at < axisEnd; at += 1800) {
      list.push({ at, hour: moment.unix(at).minutes() === 0 });
    }
    return list;
  }, [axisStart, axisEnd]);

  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) =>
        moment().startOf('day').add(i, 'day')
      ),
    []
  );

  const scrollBy = (hours: number) =>
    scroller.current?.scrollBy({ left: px(hours * 3600), behavior: 'smooth' });

  const nowX = px(now - axisStart);
  const showNow = now >= axisStart && now <= axisEnd;

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.days}>
          {days.map((d) => (
            <button
              key={d.unix()}
              type="button"
              className={`${styles.day} ${d.unix() === dayStart ? styles.active : ''}`}
              onClick={() =>
                setSearchParams((prev) => {
                  d.isSame(moment(), 'day')
                    ? prev.delete('day')
                    : prev.set('day', `${d.unix()}`);
                  return prev;
                })
              }
            >
              <span>{d.format('ddd')}</span>
              <span>{d.format('D')}</span>
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.nav}
            onClick={() => scrollBy(-2)}
          >
            ‹ {t('guide_earlier')}
          </button>
          <button
            type="button"
            className={styles.nav}
            onClick={() =>
              scroller.current?.scrollTo({
                left: Math.max(0, nowX - 30 * PX_PER_MIN),
                behavior: 'smooth',
              })
            }
          >
            {t('guide_now')}
          </button>
          <button
            type="button"
            className={styles.nav}
            onClick={() => scrollBy(2)}
          >
            {t('guide_later')} ›
          </button>
          <input
            className={styles.search}
            type="search"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {channels.length === 0 ? (
        <EmptyState title={t('no_epg')} />
      ) : (
        <div className={styles.scroller} ref={scroller}>
          <div
            className={styles.grid}
            style={{ width: 150 + px(axisEnd - axisStart) }}
          >
            <div className={styles.ruler}>
              <div className={styles.corner} />
              <div
                className={styles.ticks}
                style={{ width: px(axisEnd - axisStart) }}
              >
                {ticks.map((tk) => (
                  <span
                    key={tk.at}
                    className={`${styles.tick} ${tk.hour ? styles.hour : ''}`}
                    style={{ left: px(tk.at - axisStart) }}
                  >
                    {moment.unix(tk.at).format('LT')}
                  </span>
                ))}
              </div>
            </div>
            {showNow && (
              <div className={styles.nowLine} style={{ left: 150 + nowX }} />
            )}
            {channels.map((c) => (
              <GuideRow
                key={c.channelId}
                channel={c}
                axisStart={axisStart}
                axisEnd={axisEnd}
                now={now}
                onPlay={setPlaying}
                onEvent={(e) => navigate(`/guide/events/${e.id}`)}
                onChannel={(ch) => navigate(`/channels/${ch.channelId}`)}
              />
            ))}
          </div>
        </div>
      )}

      {playing && (
        <Player
          visible
          onClose={() => setPlaying(null)}
          title={playing.channelName}
          channelNumber={playing.channelNumber}
        />
      )}
    </div>
  );
}

Component.displayName = 'ChannelGuideView';
