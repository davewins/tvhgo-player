import { EpgChannel, EpgEvent } from '@/clients/api/api.types';
import {
  LoaderFunctionArgs,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from 'react-router-dom';
import {
  openingScrollPx,
  scrollForMinutes,
  viewedMinutes,
} from '@/utils/guideScroll';
import { useEffect, useMemo, useRef, useState } from 'react';

import Button from '@/components/common/button/Button';
import EmptyState from '@/components/common/emptyState/EmptyState';
import Player from '@/components/player/Player';
import { getEpg } from '@/clients/api/api';
import moment from 'moment';
import styles from './ChannelGuideView.module.scss';
import { useTranslation } from 'react-i18next';

// Layout: 1 minute = PX_PER_MIN pixels. The guide covers the selected day from `axisStart` to `axisEnd`.
const PX_PER_MIN = 5;
// how much of the past is shown to the left of the now line when the guide opens or Now is pressed
const NOW_LEAD_MIN = 10;
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
  // today starts one half hour before the previous half hour: the programme on now overlaps it, and the now line is
  // always 30-60 minutes in, never hidden under the sticky channel column (as it was exactly on the half hour).
  // Other days start at midnight.
  const axisStart = isToday
    ? Math.floor(moment().unix() / 1800) * 1800 - 1800
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

// a programme matches the search if its title or subtitle contains the (lower-cased) text
const matches = (e: EpgEvent, q: string) =>
  q !== '' && `${e.title} ${e.subtitle || ''}`.toLowerCase().includes(q);

const px = (seconds: number) => (seconds / 60) * PX_PER_MIN;

function GuideRow({
  channel,
  axisStart,
  axisEnd,
  now,
  search,
  onPlay,
  onEvent,
  onChannel,
}: {
  channel: EpgChannel;
  axisStart: number;
  axisEnd: number;
  now: number;
  search: string;
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
              className={`${styles.event} ${live ? styles.live : ''} ${past ? styles.past : ''} ${search && matches(e, search) ? styles.match : ''} ${search && !matches(e, search) ? styles.dim : ''}`}
              style={{
                left: px(start - axisStart),
                width: px(end - start) - 2,
              }}
              title={`${e.title}\n${moment.unix(e.startsAt).format('LT')} - ${moment.unix(e.endsAt).format('LT')}${detail ? `\n${detail}` : ''}`}
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
  // the time of day being looked at when another day is chosen: the new day opens at the same time
  const carriedMinutes = useRef<number | null>(null);
  const [now, setNow] = useState(moment().unix());
  const search = searchParams.get('q') || '';
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

  // Choosing another day keeps the time of day being looked at (scroll today to 7pm, then pick tomorrow: 7pm tomorrow,
  // and back to today: 7pm today). Without that, today opens with "now" just right of the channel column (a little of
  // the past in view) and another day at the current time of day. The Now button forgets the carried time.
  useEffect(() => {
    if (scroller.current) {
      const minutes = carriedMinutes.current;
      carriedMinutes.current = null;
      scroller.current.scrollLeft =
        minutes !== null
          ? scrollForMinutes({
              minutes,
              dayStart,
              axisStart,
              pxPerMin: PX_PER_MIN,
            })
          : openingScrollPx({
              isToday,
              axisStart,
              now: new Date(),
              pxPerMin: PX_PER_MIN,
              leadMin: NOW_LEAD_MIN,
            });
    }
  }, [dayStart]);

  const query = search.trim().toLowerCase();
  // this guide only holds the selected day; the search page looks through the whole guide
  const searchAllDays = () =>
    navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  const channels = useMemo(
    () =>
      query === ''
        ? epg
        : epg.filter(
            (c) =>
              c.channelName.toLowerCase().includes(query) ||
              c.events.some((e) => matches(e, query))
          ),
    [epg, query]
  );

  // jump to the first matching programme that is on now or later
  useEffect(() => {
    if (query === '' || !scroller.current) {
      return;
    }
    let first: number | null = null;
    for (const c of channels) {
      for (const e of c.events) {
        if (e.endsAt > now && matches(e, query)) {
          const at = Math.max(e.startsAt, axisStart);
          first = first === null ? at : Math.min(first, at);
        }
      }
    }
    if (first !== null) {
      scroller.current.scrollTo({
        left: Math.max(0, px(first - axisStart) - 20),
        behavior: 'smooth',
      });
    }
  }, [query]);

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
              onClick={() => {
                const target = d.isSame(moment(), 'day')
                  ? moment().startOf('day').unix()
                  : d.unix();
                if (target !== dayStart && scroller.current) {
                  carriedMinutes.current = viewedMinutes({
                    scrollLeft: scroller.current.scrollLeft,
                    axisStart,
                    dayStart,
                    pxPerMin: PX_PER_MIN,
                  });
                }
                setSearchParams((prev) => {
                  if (d.isSame(moment(), 'day')) {
                    prev.delete('day');
                  } else {
                    prev.set('day', `${d.unix()}`);
                  }
                  return prev;
                });
              }}
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
            onClick={() => {
              if (!isToday) {
                // "now" is not on this day's grid: go back to today (which opens at the current time)
                carriedMinutes.current = null;
                setSearchParams((prev) => {
                  prev.delete('day');
                  return prev;
                });
                return;
              }
              scroller.current?.scrollTo({
                left: Math.max(0, nowX - NOW_LEAD_MIN * PX_PER_MIN),
                behavior: 'smooth',
              });
            }}
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
        </div>
      </div>

      {channels.length === 0 && query !== '' ? (
        <EmptyState
          title={t('guide_no_match', { query: search.trim() })}
          subtitle={t('guide_no_match_hint')}
        >
          <Button
            label={t('guide_search_all')}
            onClick={() => searchAllDays()}
          />
        </EmptyState>
      ) : channels.length === 0 ? (
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
                search={query}
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
          picon={`/api/picon/${playing.piconId}`}
        />
      )}
    </div>
  );
}

Component.displayName = 'ChannelGuideView';
