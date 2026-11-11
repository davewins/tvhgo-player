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

**Safari and iPhone/iPad:** Apple's browsers cannot play an endless fragmented MP4, so there tvhgo serves the same
transcode as **HLS** instead (rolling 2-second MPEG-TS segments, still H.264/AAC). It is automatic. *Auto* is not
offered as a separate mode there (Tvheadend's Matroska/WebM streams are not playable in Safari): it uses 720p, or the
highest quality you have enabled. HLS needs the live quality transcoding to be enabled. A session ends when you close
the player, or 25 seconds after the browser stops fetching it, which frees the tuner.

**Radio channels** play too. A radio channel has no video, so tvhgo detects the audio-only stream and the player shows
the station logo, a "Radio" label and a plain audio bar instead of a black video area. This works on any quality
setting, and with *Auto* as well. Radio *recordings* are converted to audio-only MP4 for playback in the same way.

Things to know:

- Each live viewer is one ffmpeg process (limit: `LIVE_MAX_STREAMS`, default 3). Pick a lower quality on a slow server.
- Starting takes a couple of seconds; the picture is a few seconds behind live.
- **Closing the player ends the stream and frees the tuner** (within about a second).
- Watching live uses a tuner like any other viewer. If both tuners are recording on other multiplexes Tvheadend
  will refuse another service.

### GPU live encoding (optional)
By default live TV is encoded on the CPU with x264, which costs roughly 0.25 of a core per SD stream and 0.7 per HD
stream. With `TVHGO_PLAYBACK_LIVE_ENCODER=vaapi` the deinterlacing, scaling and H.264 encoding run on the GPU
(decoding stays on the CPU, which copes better with the damaged packets of a live broadcast). Measured on an Intel UHD 730
(i5-14400) with three simultaneous streams at 720p: about 0.9 of a core in total, against 4.8 cores for x264, with
comparable picture quality and bitrate (the GPU uses constant-quality mode, `ICQ`, matched to the x264 CRF values).

To use it:
1. Pass the render node into the container and let the container's user open it:
   ```yaml
   devices: ["/dev/dri/renderD128:/dev/dri/renderD128"]
   group_add: ["<gid of the host 'render' group>"]    # getent group render
   ```
2. Set `TVHGO_PLAYBACK_LIVE_ENCODER=vaapi` (and `TVHGO_PLAYBACK_LIVE_VAAPI_DEVICE` if it is not `renderD128`).
3. The image includes the Intel media driver (`intel-media-driver`). For an AMD GPU add `mesa-va-gallium` to the
   Dockerfile instead.

On first use tvhgo encodes a few test frames; if that fails (no device, no permission, no driver) it logs a warning and
uses the CPU. If the GPU later fails on a stream before producing any output, GPU encoding is switched off until
tvhgo restarts. The Recording conversion (MP4 for playback) always uses the CPU: broadcast TV compresses noticeably
better with x264 than with a hardware encoder, and that file is the one you keep.

Both the fragmented-MP4 stream (Chrome, Firefox) and the HLS stream (Safari, iOS) use the GPU. The GPU is shared with
anything else using it (for example Frigate), so keep `live_max_streams` modest.

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
- **Earlier / Now / Later** buttons scroll the time axis (Now goes back to today from another day); use the scrollbar or swipe for more.
- **Click the programme that is on now, or a channel logo → watch live.**
- **Click any other programme → its page**, where you can record it (existing tvhgo behaviour).
- **Search** - there is one search box, in the top bar. On the Channels page it filters the guide as you type: it
  matches channel names *and* programme titles on the day shown, hides channels with no match, highlights the matching
  programmes and jumps to the first one. The filter stays when you change day. The guide only holds one day, so if
  nothing matches it says so; press **Enter** (or *Search all days*) to search the whole guide on the search page.
  On other pages the same box goes straight to that search page.
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
| `GET /api/recordings/{id}/playback` | Playback state: `none`, `queued`, `converting` (with `progress`), `ready` (`source`: library/cache), `failed`; `source: "pipeline"` while the recording pipeline is converting it, and `ahead` for a queued conversion |
| `POST /api/recordings/{id}/playback` | Start converting if there is no playable copy (idempotent) |
| `GET /api/recordings/{id}/play` | The MP4, with HTTP range support (seekable) |
| `GET /api/recordings/{id}/thumb` | The thumbnail image |
| `POST /api/channels/{n}/live/hls?quality=H` | Start a live HLS session (Safari/iOS); returns `{id, url}` of the playlist |
| `GET /api/live/hls/{id}/index.m3u8` and `seg*.ts` | The session's playlist and segments |
| `DELETE /api/live/hls/{id}` | End the session |
| `GET /api/recordings/{id}/chapters` | The MP4's chapters, advert breaks flagged (`advert: true`) |
| `GET /api/recordings/{id}/play?download=1` | The MP4 as a named download (attachment) |
| `GET /api/epg/events/{id}/thumb` | TMDb artwork for the programme's title (404 if none) |
| `GET/POST /api/dvr/autorec` | List series rules / create one from a programme (`eventId`, `anyChannel`, `recordRepeats`) |
| `PATCH/DELETE /api/dvr/autorec/{id}` | Enable or disable / delete a series rule |
| `GET /api/tuners` | Tuner usage (`total`, `busy`, what each tuner is doing) and `blocked`, the channel ids that cannot be tuned while every tuner is busy; `available: false` without a status account |
| `GET /api/tuners/clashes` | Periods in the next 14 days needing more multiplexes than tuners, with the recordings involved. Optional `channelId`, `start`, `end`, `title` add one more programme ("would recording this clash?") |
| `GET /api/recordings/storage` | Disk total/used/free, what the recordings take (`masterBytes`, `playableBytes`, `hours`), Tvheadend's `limits` (`minFreeBytes`, `maxUsedBytes`), the resulting `allowanceBytes` and an estimate of `hoursLeft` |
| `GET /api/pipeline` | The recording pipeline's status (`current`, `queue`, `failed`); `available: false` if not configured or not running |

## Recordings by show

On **DVR → Recordings → Finished**, recordings are grouped into **shows** (by title, whatever the channel), like Sky Q:

- A **grid** (or list) of shows, each with the latest episode's picture, an episode count and the date of the latest
  episode. Click one to see its episodes, again as a grid or list; **‹ Shows** goes back.
- **Click the picture to play** a recording straight away; click its date/text for the recording's page (details,
  padding, delete). A play button is drawn on the picture. Each card shows the date, channel and time and up to three
  lines of the programme description, with **More / Less** to read it all (hover also shows the full text).
- **Tick the box** on one or more recordings to **Download** or **Delete** them. Download gives the **MP4** (named
  like the recording, e.g. `Emmerdale - 2026-11-09 20.00.mp4`), making it first if there is none yet. Only if no MP4
  can be made does it fall back to the original Tvheadend file. Several recordings download one after another; your
  browser may ask permission to allow multiple downloads.
- **Sort** by newest, oldest, title A-Z or (for shows) most episodes. The grid/list choice is remembered in the browser.
- **All recordings** switches to the plain list (with the original sort and paging); **Shows** switches back.
- Upcoming and Failed stay as plain lists.

This only changes how the list is displayed. It does not change how Tvheadend records or where files are stored, and
it works alongside a folder-per-show layout such as a media server uses (the grouping mirrors it).

## Storage
The Recordings page (shows view) opens with a **Storage** bar: what the recordings take (the broadcast originals plus
the MP4 copies) against the room Tvheadend allows for them. That room is worked out from the DVR profile's limits:
"maintain free disk space" (Tvheadend removes old recordings to keep at least that much free) and, if set,
"maintain used disk space". The used-space limit counts only the recordings Tvheadend keeps (the originals), not the MP4
copies made next to them, so tvhgo allows for the copies on top: with a 500 GB limit and copies about as big as the
originals the bar's allowance is about 1 TB in all. Below the bar are the disk's total, used and free space, the limits, and an estimate of how
many more hours could be recorded at the average size so far. A show shows its total size, and each recording its own
(original + MP4 copy), in the show's page and in the list. Each show tile has a checkbox that selects all of its
recordings, so whole shows can be deleted (or downloaded) at once; the confirmation says how many recordings and how much
space that is. `GET /api/recordings/storage` returns the same numbers; the
recordings list includes `size` and `playableSize` (bytes).

## Programme pages and series rules

A programme's page shows artwork from TMDb when a key is configured and the title matches exactly (nothing is shown
otherwise), then the title and the **Record** / **Record series** buttons.

On a programme's page, **Record** records that one broadcast. **Record series** makes a *series rule* (a Tvheadend
"autorec" entry) that records every upcoming programme with the same title:

- **This channel only** is the default; **Any channel** matches the title wherever it is shown.
- **Skip repeats** is on by default: a broadcast whose description was already recorded is not recorded again.
  Untick it to record repeats too.
- A rule made here matches the exact title (and the channel), like the rules you would write by hand in Tvheadend.
  Making the same rule twice is refused.
- Broadcasters tag titles ("New: Lingo", "Final: Lingo"). The tag is ignored: the rule is for "Lingo" and also matches
  the tagged episodes, artwork is looked up for "Lingo", and recordings are grouped as one show. Only a few known
  tags are removed (New, New Series, Final, Last, Last in Series, Return(s), Premiere); a title like
  "DIY SOS: The Big Build" is left alone.
- A programme already covered by a rule says so on its page, with a link to the rules.

**DVR → Series rules** lists every rule (including ones made in Tvheadend itself), with **Disable / Enable** and
**Delete**. Deleting a rule keeps recordings it already made and removes its not-yet-recorded entries. Rules only
schedule ordinary recordings, so anything that processes your recordings afterwards (a conversion script, a media
server) works as for any other recording.

## Skipping adverts

Recordings from commercial channels contain the adverts. If the MP4 has chapters named **Commercial** (or Ad, Advert,
Intermission), the player shows a **Skip ad break** button over the picture while a break is playing; one click jumps
to the end of the break. It reads the chapters from the MP4 itself (`GET /api/recordings/{id}/chapters`), so it works on
any browser and phone. On an iPhone it is shown in the normal player, but not while the video is in Apple's own
full-screen view, which only shows the system controls.

tvhgo does not find the breaks itself. They come from whatever writes the chapters; the author's setup runs
[Comskip](https://github.com/erikkaashoek/Comskip) on each new recording and writes the breaks into the MP4 as chapters
(see *Finding adverts with Comskip* below). Media servers that read chapters, such as Jellyfin with the Intro Skipper
plugin, can then offer their own skip buttons from the same chapters.

### Finding adverts with Comskip (optional, outside tvhgo)

A small example job is in the author's repository (`scripts/tvh-comskip-sync.py`): for every finished recording it runs
Comskip in a throwaway container, converts the break times to chapters ("Commercial" for each break, "Part N" for the
programme, the lead-in before the programme included), checks the new file (same duration, same streams, size within
1%) and only then replaces the MP4. BBC channels are skipped because they have no adverts. Comskip is accurate on ITV and
Channel 4 recordings but not perfect, so the job refuses a result where almost half the recording would be "adverts".

## Resume where you left off

The player remembers, per user, how far you got in each recording (saved every 10 seconds, when you pause and when you
close the player; stored in tvhgo's own database, table `watch_progress`). Opening the recording again continues about
5 seconds before where you stopped, with a "Resumed at 23:10 · Start from beginning" notice. Less than 15 seconds in, or
within the last minute, counts as not started / watched and plays from the top. Episode tiles show a thin progress bar
(dimmed and full once watched).

API: `GET /api/recordings/progress`, `PUT /api/recordings/{id}/progress` (`{"position": s, "duration": s}`),
`DELETE /api/recordings/{id}/progress`. This is separate from Jellyfin's own resume position.

## Channel groups (Channels page)
A row of chips above the guide (All, HD, +1, News, Kids, Shopping, Radio) filters the channel list. The groups are worked
out from the channel number and name using UK Freeview numbering (HD 101-199, news 231-236, radio 700 and up,
names ending in `+1`, ...), so nothing needs setting up in Tvheadend. A group with no channels is not shown; the
choice is kept in the URL (`?group=radio`). The rules are in `ui/src/utils/channelGroups.ts`.

## Tuner warnings (optional)
Tvheadend ties a tuner to a whole **multiplex**, so recordings and streams on the same multiplex share one tuner. With
a second account configured (`status_username`, see [configuration](configuration.md#tvheadend-config-tvheadend)):
- A header badge shows how many tuners are in use ("Tuners in use 1/2"), amber when none is free; hovering lists what is
  using them.
- When every tuner is busy, the guide shows a banner naming what holds them and which multiplexes are reachable.
  Channels on other multiplexes are dimmed and tapping one explains why instead of failing to play.
- **Clash warnings:** scheduled recordings in the next 14 days are checked (including the recording padding) for times
  that need more distinct multiplexes than there are tuners. The Upcoming list shows each clash with the recordings
  involved, and a programme's page says "Recording this would clash" before you press Record. A channel carried on
  several multiplexes is assumed to use one that is already needed. Live viewing is not predicted.

## Background pipeline progress (optional)
With `pipeline_status` set, tvhgo reads the status file of a recording pipeline. A header badge shows
"Converting <title> 41%" (plus how many are waiting or failed), recordings being processed get a chip with a progress
bar, and pressing Play on a recording the pipeline is already converting shows its progress instead of starting a
second conversion. A status file older than about 90 seconds means the pipeline is not running and nothing is shown.

## Browser support

- **Tested:** Google Chrome on desktop - live TV at all qualities, recording playback and seeking, the guide, all
  through an HTTPS reverse proxy.
- The numbered live qualities and recording playback need **H.264/AAC in MP4**, which every mainstream browser
  supports (Chromium builds without proprietary codecs, such as some Linux distributions' Chromium, do not - use
  *Auto* there, which falls back to WebM).
- **Safari / iOS live TV** uses HLS (above). The HLS stream was verified to be valid and to play with hls.js in
  Chrome, and the server side was tested end to end, but it has **not been confirmed on a real iPhone or Safari by the
  author**. Please report problems.
- **Not tested:** Firefox, Edge, and recording playback on Safari/iOS. They *should* work with standard HTML5 video.

## Limitations

- Transcoding and conversion use the CPU (no hardware acceleration yet).
- Whether a channel is radio is detected from its stream (no video), not from Tvheadend's channel data, so the quality
  menu simply disappears for radio.
- Audio-description tracks are skipped by choosing the main audio track; subtitles are not included in converted video.
- No Chromecast / AirPlay / external-player integration.
