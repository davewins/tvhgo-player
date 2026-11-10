import {
  getLiveQualities,
  getPlayback,
  preparePlayback,
  startLiveHLS,
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

// Safari and every browser on iOS (all WebKit) play HLS natively but not an endless fragmented MP4. Other browsers
// keep the fragmented MP4 stream: some of them (recent Chrome) claim native HLS support but do not play ours.
const HLS_MIME = 'application/vnd.apple.mpegurl';
function wantsHLS(video: HTMLVideoElement): boolean {
  const ua = navigator.userAgent;
  const webkit =
    /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
  const iPadOnMac =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (webkit || iPadOnMac) && video.canPlayType(HLS_MIME) !== '';
}
const MP4_MIME = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
const QUALITY_KEY = 'tvhgo.liveQuality';
const AUTO = 'auto';

function pickAutoProfile(video: HTMLVideoElement): string | null {
  const match = AUTO_PROFILES.find((p) => video.canPlayType(p.mime) !== '');
  return match ? match.profile : null;
}

function stopHLS(id: string) {
  // keepalive lets the request finish even while the page is closing
  fetch(`/api/live/hls/${id}`, {
    method: 'DELETE',
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
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
  // Channel logo, shown for radio (audio-only) streams instead of a black video area.
  picon?: string;
};

function Inner({
  title,
  channelNumber,
  recordingId,
  picon,
}: Omit<Props, 'visible' | 'onClose'>) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<PlaybackInfo | null>(null);
  // radio: the stream has no video, only audio
  const [audioOnly, setAudioOnly] = useState(false);
  // live: heights tvhgo can transcode to (null = still loading) and the current choice ("auto" or a height)
  const [qualities, setQualities] = useState<number[] | null>(null);
  const [quality, setQuality] = useState<string>(AUTO);
  // live radio has its own play/pause button; resuming restarts the stream so it is live again, not stale
  const [paused, setPaused] = useState(false);
  // the channel logo in the header (hidden if the channel has none)
  const [logoFailed, setLogoFailed] = useState(false);
  const [restart, setRestart] = useState(0);

  // Radio has no video track. Safari (HLS) reports 0x0 until the first frame is decoded, so a zero size is only
  // believed once playback has had a moment to start; any real size at any time means it is video after all.
  const audioTimer = useRef<ReturnType<typeof setTimeout>>();
  const liveRadio = audioOnly && channelNumber !== undefined;
  const checkVideo = (e: { currentTarget: HTMLVideoElement }) => {
    const v = e.currentTarget;
    clearTimeout(audioTimer.current);
    if (v.videoWidth > 0 || v.videoHeight > 0) {
      setAudioOnly(false);
      return;
    }
    audioTimer.current = setTimeout(() => {
      if (!v.paused && v.videoWidth === 0 && v.videoHeight === 0) {
        setAudioOnly(true);
      }
    }, 3000);
  };
  useEffect(() => () => clearTimeout(audioTimer.current), []);

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

    // HLS: ask the server for a session, play its playlist, and end the session when we leave
    if (wantsHLS(video) && qualities.length > 0) {
      const height =
        quality !== AUTO
          ? parseInt(quality)
          : qualities.includes(720)
            ? 720
            : qualities[0];
      let cancelled = false;
      let sessionId: string | null = null;
      const onCanPlay = () => video.play().catch(() => undefined);
      video.addEventListener('canplay', onCanPlay, { once: true });
      startLiveHLS(channelNumber, height)
        .then(({ id, url }) => {
          sessionId = id;
          if (cancelled) {
            stopHLS(id);
            return;
          }
          video.src = url;
        })
        .catch(() => !cancelled && setError(t('player_live_error')));
      return () => {
        cancelled = true;
        video.removeEventListener('canplay', onCanPlay);
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (sessionId) {
          stopHLS(sessionId);
        }
      };
    }

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
  }, [channelNumber, quality, qualities, restart]);

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
        <div className={styles.titleRow}>
          {picon &&
            channelNumber !== undefined &&
            !audioOnly &&
            !logoFailed && (
              <img
                className={styles.headerLogo}
                src={picon}
                alt=""
                onError={() => setLogoFailed(true)}
              />
            )}
          <h3 className={styles.title}>{title}</h3>
        </div>
        {channelNumber !== undefined &&
          !audioOnly &&
          qualities &&
          qualities.length > 0 && (
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
      {audioOnly && (
        <div className={styles.radio}>
          {picon && <img className={styles.radioLogo} src={picon} alt="" />}
          <span className={styles.radioLabel}>{t('radio')}</span>
          <div className={styles.eq} data-paused={paused} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          {liveRadio && (
            <button
              type="button"
              className={styles.radioButton}
              aria-label={paused ? t('play') : t('pause')}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (paused) {
                  setPaused(false);
                  setRestart((n) => n + 1);
                } else {
                  v.pause();
                  setPaused(true);
                }
              }}
            >
              {paused ? '▶' : '❚❚'}
            </button>
          )}
        </div>
      )}
      <video
        ref={videoRef}
        className={audioOnly ? styles.videoAudioOnly : styles.video}
        style={preparing ? { display: 'none' } : undefined}
        controls={!liveRadio}
        playsInline
        onLoadedMetadata={checkVideo}
        onLoadedData={checkVideo}
        onPlaying={checkVideo}
        onResize={checkVideo}
        onError={() => {
          // "Auto" uses tvheadend's own video profiles, which cannot carry a radio stream: retry with tvhgo's
          // own transcoder (it handles audio-only channels)
          if (
            channelNumber !== undefined &&
            quality === AUTO &&
            qualities &&
            qualities.length > 0
          ) {
            setQuality(String(qualities.includes(720) ? 720 : qualities[0]));
            return;
          }
          setError(recordingId ? t('player_no_copy') : t('player_live_error'));
        }}
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
