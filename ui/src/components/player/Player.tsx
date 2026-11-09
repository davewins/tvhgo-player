import {
  getLiveQualities,
  getPlayback,
  preparePlayback,
} from '@/clients/api/api';
import { useEffect, useRef, useState } from 'react';

import Modal from '@/components/common/modal/Modal';
import { PlaybackInfo } from '@/clients/api/api.types';
import styles from './Player.module.scss';
import { useTranslation } from 'react-i18next';

// Tvheadend's own browser transcode profiles ("Auto"), best first. (The mpegts one is not used: its muxer fails on
// newer ffmpeg.) The browser's own video element plays the progressive stream, no extra player library.
const AUTO_PROFILES = [
  {
    profile: 'webtv-h264-aac-matroska',
    mime: 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"',
  },
  {
    profile: 'webtv-vp8-vorbis-webm',
    mime: 'video/webm; codecs="vp8.0, vorbis"',
  },
];

const MP4_MIME = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
const QUALITY_KEY = 'tvhgo.liveQuality';
const AUTO = 'auto';

function pickAutoProfile(video: HTMLVideoElement): string | null {
  const match = AUTO_PROFILES.find((p) => video.canPlayType(p.mime) !== '');
  return match ? match.profile : null;
}

function loadQuality(): string | null {
  try {
    return localStorage.getItem(QUALITY_KEY);
  } catch {
    return null;
  }
}

function saveQuality(q: string) {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // ignore (private mode etc.)
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  // Live channel number (plays the live stream) ...
  channelNumber?: number;
  // ... or a finished recording id (plays the browser-friendly MP4 copy).
  recordingId?: string;
};

function Inner({
  title,
  channelNumber,
  recordingId,
}: Omit<Props, 'visible' | 'onClose'>) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<PlaybackInfo | null>(null);
  // live: heights tvhgo can transcode to (null = still loading) and the current choice ("auto" or a height)
  const [qualities, setQualities] = useState<number[] | null>(null);
  const [quality, setQuality] = useState<string>(AUTO);

  // --- live: find out which qualities are available and pick the remembered / a sensible default
  useEffect(() => {
    if (channelNumber === undefined) {
      return;
    }
    let cancelled = false;
    getLiveQualities()
      .then((list) => {
        if (cancelled) {
          return;
        }
        const saved = loadQuality();
        setQualities(list);
        if (saved && (saved === AUTO || list.includes(parseInt(saved)))) {
          setQuality(saved);
        } else if (list.includes(720)) {
          setQuality('720');
        } else {
          setQuality(AUTO);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQualities([]);
          setQuality(AUTO);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelNumber]);

  // --- live: (re)start the stream whenever the quality changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || channelNumber === undefined || qualities === null) {
      return;
    }
    setError(null);

    let url: string | null = null;
    if (quality !== AUTO && video.canPlayType(MP4_MIME) !== '') {
      url = `/api/channels/${channelNumber}/live?quality=${quality}`;
    } else {
      const profile = pickAutoProfile(video);
      if (profile) {
        url = `/api/channels/${channelNumber}/stream?profile=${profile}`;
      }
    }
    if (!url) {
      setError(t('player_live_unsupported'));
      return;
    }

    const start = () =>
      setTimeout(() => video.play().catch(() => undefined), 1500);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLoaded = () => {
      timer = start();
    };
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.src = url;

    return () => {
      // dropping the src aborts the request, which ends the transcode and the tvheadend subscription (frees the tuner)
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoaded);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [channelNumber, quality, qualities]);

  // --- recording: play the MP4 copy, asking the server to prepare one first if needed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !recordingId) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const play = () => {
      setPreparing(null);
      video.src = `/api/recordings/${recordingId}/play`;
      video.play().catch(() => undefined);
    };

    // ready -> play; otherwise ask the server to prepare a playable copy and poll its progress
    const poll = async (start: boolean) => {
      try {
        let info = await getPlayback(recordingId);
        if (info.status === 'ready') {
          return !cancelled && play();
        }
        if (
          start &&
          info.canConvert &&
          info.status !== 'queued' &&
          info.status !== 'converting'
        ) {
          info = await preparePlayback(recordingId);
        }
        if (cancelled) {
          return;
        }
        if (info.status === 'failed') {
          setPreparing(null);
          return setError(t('player_convert_failed'));
        }
        if (!info.canConvert && info.status === 'none') {
          setPreparing(null);
          return setError(t('player_no_copy'));
        }
        setPreparing(info);
        timer = setTimeout(() => poll(false), 2000);
      } catch {
        if (!cancelled) {
          setPreparing(null);
          setError(t('player_no_copy'));
        }
      }
    };
    poll(true);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [recordingId]);

  const onQualityChange = (q: string) => {
    saveQuality(q);
    setQuality(q);
  };

  return (
    <div className={styles.player}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {channelNumber !== undefined && qualities && qualities.length > 0 && (
          <label className={styles.quality}>
            {t('quality')}
            <select
              value={quality}
              onChange={(e) => onQualityChange(e.target.value)}
            >
              {qualities.map((q) => (
                <option key={q} value={String(q)}>
                  {q}p
                </option>
              ))}
              <option value={AUTO}>{t('quality_auto')}</option>
            </select>
          </label>
        )}
      </div>
      {preparing && (
        <div className={styles.preparing}>
          <span>
            {preparing.status === 'queued'
              ? t('player_queued')
              : t('player_preparing', { progress: preparing.progress })}
          </span>
          <div className={styles.bar}>
            <div
              className={styles.barFill}
              style={{ width: `${preparing.progress}%` }}
            />
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className={styles.video}
        style={preparing ? { display: 'none' } : undefined}
        controls
        playsInline
        onError={() =>
          setError(recordingId ? t('player_no_copy') : t('player_live_error'))
        }
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

export default function Player(props: Props) {
  const { visible, onClose, ...rest } = props;
  return (
    <Modal visible={visible} onClose={onClose} maxWidth="1100px">
      {/* only mounted while open, so closing the modal stops playback and releases the tuner */}
      {visible && <Inner {...rest} />}
    </Modal>
  );
}
