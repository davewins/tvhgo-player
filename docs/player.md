# Player, guide and thumbnails

Features this fork adds to tvhgo. Settings for everything on this page are in
[Configuration → Playback](configuration.md#playback-config-playback); setup is in [Installation](installation.md).

## Live TV

Click the **programme that is on now** or a **channel logo** in the guide (or the ▶ button on the channel pages).
A player opens on top of the page.

**Quality menu** (top right of the player):

| Option | What happens |
| --- | --- |
| **1080p / 720p / 480p / 360p** | tvhgo takes Tvheadend's *raw* stream and transcodes it with ffmpeg to H.264/AAC at that height and streams it as fragmented MP4. Works with any Tvheadend; **no profile setup** needed. Video is never enlarged, so an SD channel stays at its own 576p whatever you pick. Non-square-pixel SD video is shown at the correct shape. |
| **Auto (Tvheadend)** | Tvheadend does the transcoding with its own `webtv-*` stream profiles (Matroska/H.264 where the browser supports it, otherwise WebM/VP8). Needs ffmpeg in Tvheadend, and the resolution is whatever those profiles are set to. |

Your choice is remembered in the browser. The default is **720p**.

**Radio channels** play too. A radio channel has no video, so tvhgo detects the audio-only stream and the player shows
the station logo, a "Radio" label and a plain audio bar instead of a black video area. This works on any quality
setting, and with *Auto* as well. Radio *recordings* are converted to audio-only MP4 for playback in the same way.

Things to know:

- Each live viewer is one ffmpeg process (limit: `LIVE_MAX_STREAMS`, default 3). Pick a lower quality on a slow server.
- Starting takes a couple of seconds; the picture is a few seconds behind live.
- **Closing the player ends the stream and frees the tuner** (within about a second).
- Watching live uses a tuner like any other viewer. If both tuners are recording on other multiplexes Tvheadend
  will refuse another service.

## Recordings

On a finished recording, press **Play**. tvhgo looks for a browser-friendly MP4 in this order:

1. **`source_dir`** - ready-made MP4s mirroring Tvheadend's folder tree (`<root>/Show/Show - 1.ts` →
   `<source_dir>/Show/Show - 1.mp4`). Use it if you already have a pipeline or media server making MP4s; it is
   optional. Plays instantly.
2. **tvhgo's cache** - a copy it converted earlier.
3. **Convert now** (`convert: true`): ffmpeg re-encodes the recording to H.264/AAC while you wait. A progress bar
   shows how far along it is; it plays when done and the file stays in the cache for next time. Conversions run
   one at a time by default (others wait in a queue). For scale: a 27-minute HD recording took about 3½ minutes.

If none of these apply, the player says that no playable copy exists.

How conversions are made - and why:

- H.264 video (re-encoded with a keyframe about every 2 seconds and closed GOPs), AAC stereo audio, MP4 with the
  index at the front. A straight copy of broadcast video was tried first, but broadcast H.264 contains keyframes
  browsers cannot start from, so **seeking failed at some points in Chrome**; re-encoding fixes that.
- The main audio track is used, not an audio-description track.
- SD video with non-square pixels is converted to square pixels at its display aspect ratio.
- Interlaced video is deinterlaced.
- The result is checked (it must contain video and audio and have the same duration as the source) before it is used.
- The original recording is never modified or deleted; tvhgo only reads it.
- The cache is limited by `cache_max_gb` and `cache_max_age_days`; the least recently played files are removed first.

## Timeline guide (Channels page)

Channels are rows and time runs left to right, with a red **now** line.

- **Day tabs** for the next 8 days; today starts at the current half hour, other days open at 18:00.
- **Earlier / Now / Later** buttons scroll the time axis; use the scrollbar or swipe for more. **Search** filters channels.
- **Click the programme that is on now, or a channel logo → watch live.**
- **Click any other programme → its page**, where you can record it (existing tvhgo behaviour).
- A red dot on a programme means a recording is scheduled for it.
- The channel **number** opens that channel's own programme list.

The guide only has what Tvheadend has: programmes that have already ended are not kept by Tvheadend, so today's guide
starts from what is on now.

## Thumbnails

The recordings list and detail pages show a picture for each recording:

1. a **frame from the recording** - the `<name>-thumb.jpg` beside the MP4 in `source_dir` if there is one, otherwise
   one extracted by ffmpeg (about 15 % into the programme) and cached;
2. otherwise **[TMDb](https://www.themoviedb.org) artwork** for the programme (a landscape backdrop, else the
   poster), if you set a TMDb key. Recordings that are not finished yet - upcoming ones - have no frame, so they use this;
3. otherwise a blank block.

TMDb results are only used when the title matches **exactly** (ignoring case and punctuation) - a wrong picture is
worse than none. Lookups and images are cached in `cache_dir`; "no match" is remembered for a week.
See [TMDb artwork](configuration.md#tmdb-artwork) for how to get and set the key and what is sent to TMDb.

## Other changes

- The **Recordings** page opens on *Finished*; the *Removed* entry is gone from the filter dropdown (Tvheadend keeps
  those records, tvhgo just does not list them).
- Fix: when the browser closes a stream, tvhgo now ends the request to Tvheadend too (the original left it running,
  which could hold a tuner).
- Fix: the guide asks Tvheadend for programmes from a day earlier, because Tvheadend filters by *start* time, so the
  programme on now is included.

## API additions

All need a logged-in session (like the rest of the API).

| Endpoint | Purpose |
| --- | --- |
| `GET /api/channels/{number}/live?quality=720` | Live TV transcoded by tvhgo (fragmented MP4) |
| `GET /api/playback/live` | The selectable live qualities (`{"qualities":[1080,720,...]}`; empty if disabled) |
| `GET /api/recordings/{id}/playback` | Playback state: `none`, `queued`, `converting` (with `progress`), `ready` (`source`: library/cache), `failed` |
| `POST /api/recordings/{id}/playback` | Start converting if there is no playable copy (idempotent) |
| `GET /api/recordings/{id}/play` | The MP4, with HTTP range support (seekable) |
| `GET /api/recordings/{id}/thumb` | The thumbnail image |

## Browser support

- **Tested:** Google Chrome on desktop - live TV at all qualities, recording playback and seeking, the guide, all
  through an HTTPS reverse proxy.
- The numbered live qualities and recording playback need **H.264/AAC in MP4**, which every mainstream browser
  supports (Chromium builds without proprietary codecs, such as some Linux distributions' Chromium, do not - use
  *Auto* there, which falls back to WebM).
- **Not tested:** Firefox, Safari (macOS and iOS), Edge. They *should* work with standard HTML5 video but have not
  been verified, particularly for the live fragmented-MP4 stream.

## Limitations

- Transcoding and conversion use the CPU (no hardware acceleration yet).
- Whether a channel is radio is detected from its stream (no video), not from Tvheadend's channel data, so the quality
  menu simply disappears for radio.
- Audio-description tracks are skipped by choosing the main audio track; subtitles are not included in converted video.
- No Chromecast / AirPlay / external-player integration.
