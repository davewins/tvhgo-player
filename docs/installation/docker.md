# Installation with Docker

This guide installs **this fork of tvhgo** (with the in-browser player) using Docker. It is a fork of
[davidborzek/tvhgo](https://github.com/davidborzek/tvhgo) - credit to the original author, see
[CREDITS](https://github.com/davewins/tvhgo-player/blob/main/CREDITS.md). The image is **built from source**; there is
no published image yet.

## How it fits together

```
 browser ──HTTPS──► [reverse proxy, optional] ──► tvhgo ──HTTP──► Tvheadend ◄── your TV tuners
                                                    │
                                                    ├── reads recordings (read-only mount)
                                                    └── runs ffmpeg for conversions / live transcodes
```

tvhgo talks to Tvheadend over its normal HTTP API with a limited user. It never needs write access to your
recordings.

## Prerequisites

- **Docker** with the Compose plugin (`docker compose`) and `git`.
- **Tvheadend 4.3** reachable from the machine running tvhgo. Tested with 4.3-2897 (the LinuxServer.io image).
- For the **Auto** live-TV option, Tvheadend itself needs ffmpeg (the LinuxServer.io image has it). The numbered
  quality options (1080p...360p) are transcoded by tvhgo and need nothing extra in Tvheadend.
- Your **recordings folder**, mounted into the tvhgo container (read-only is enough) if you want to play
  recordings.
- A modern browser. Tested: Google Chrome on desktop. See [browser support](../player.md#browser-support).

## 1. Create a limited Tvheadend user for tvhgo

Do **not** give tvhgo your admin login. In the Tvheadend web UI (*Configuration → Users*; menu names can differ a
little between versions):

1. **Passwords:** add a user, e.g. `tvhgo`, with a strong password.
2. **Access Entries:** add an entry for that username with:

   | Setting | Value |
   | --- | --- |
   | Enabled | yes |
   | Web interface | **yes** |
   | Streaming | **Basic** and **Advanced** |
   | Video recorder | **Basic**, **View all**, **Manage all** and **View only failed** |
   | Administrator | **no** |
   | Network prefix | the address of the machine running tvhgo, or your LAN, e.g. `192.168.1.0/24` (default is everywhere) |

   These are the rights tvhgo was developed and tested with. Streaming *Advanced* is what lets tvhgo use Tvheadend's
   stream profiles for the **Auto** option.

3. Check it: `curl -u tvhgo:PASSWORD http://TVHEADEND:9981/api/channel/grid?limit=1` returns channels, and
   `curl -u tvhgo:PASSWORD http://TVHEADEND:9981/api/config/load` returns *403* (not an admin).

!!! tip "Live resolution of Tvheadend's own profile"
    The **Auto** option uses Tvheadend's `webtv-h264-aac-matroska` profile, which scales video to a fixed height
    (384 pixels by default). To change it, edit the codec profile `webtv-h264` in Tvheadend's *Configuration → Stream*
    section and set *Height*. The numbered qualities in tvhgo's player are independent of this.

## 2. Get the code and configure

```bash
git clone https://github.com/davewins/tvhgo-player.git tvhgo
cd tvhgo
cp .env.example .env
```

Edit `.env`: set `TVHEADEND_HOST` (hostname or IP of Tvheadend as seen from the container - not `localhost`),
`TVHEADEND_USERNAME`, `TVHEADEND_PASSWORD`, and optionally `TMDB_API_KEY`
([how to get one](../configuration.md#tmdb-artwork)). `.env` is git-ignored: keep secrets there, never in the compose file.

Copy `docker-compose.example.yml` to `docker-compose.yml` if you want to keep your changes (or keep using the
example file by name with `-f`). Then adapt the two things that are specific to your system:

- **The recordings volume** - the last line: `/path/to/tvheadend/recordings:/recordings:ro`. Use the folder where
  Tvheadend stores recordings *as it is on this machine*.
- **`TVHGO_PLAYBACK_TVHEADEND_ROOT`** - the folder prefix **Tvheadend reports** for recording files (*Configuration →
  Recording → Digital Video Recorder profile → Recording system path*, e.g. `/recordings` in the LinuxServer.io
  Tvheadend image). `TVHGO_PLAYBACK_RECORDINGS_DIR` is where *tvhgo's container* sees that same folder. If both are
  `/recordings` (as in the example) you need no change. If Tvheadend's path is `/media/tv`, set
  `TVHGO_PLAYBACK_TVHEADEND_ROOT=/media/tv` and mount your folder at whatever you set for `RECORDINGS_DIR`.

Everything else has sensible defaults - the full list is in [Configuration](../configuration.md#playback-config-playback).

## 3. Build and start

```bash
mkdir -p data && sudo chown 1000:1000 data        # the container runs as uid 1000
docker compose up -d --build                      # or: docker compose -f docker-compose.example.yml up -d --build
docker compose logs -f tvhgo                      # look for "starting the http server"
```

The first build takes a few minutes (it builds the web UI and the server and installs ffmpeg).

## 4. Create your login

```bash
docker compose exec tvhgo tvhgo admin user add
```

Follow the prompts, or do it non-interactively (the password is read from the environment so it is not in your shell
history's process list):

```bash
docker compose exec -e TVHGO_PASSWORD='a-strong-password' tvhgo \
  tvhgo admin user add -u dave -n "Dave" -e dave@example.com
```

Open <http://SERVER:8080> and sign in. There is no way to read a password back; to reset one, delete and re-create
the user (`tvhgo admin user delete -u dave`, then add it again - this signs that user out everywhere).

## 5. Check that everything works

| Check | Expected |
| --- | --- |
| *Channels* page | The timeline guide with logos and programmes |
| Click the programme that is on now | The player opens and live TV starts within a few seconds; the *Quality* menu offers 1080p-360p |
| *Recordings → Finished*, open one, press **Play** | Plays, and you can skip around. If no MP4 exists yet you see *Preparing recording for playback…* first |
| Close the player | The tuner is released (check *Status → Subscriptions* in Tvheadend) |

## Reverse proxy and HTTPS

For access from outside your LAN, put tvhgo behind a reverse proxy that terminates HTTPS, and set
`TVHGO_AUTH_SESSION_COOKIE_SECURE=true` once you only use it over HTTPS (with it on, login over plain HTTP no longer
works). Video is **long-lived streaming**, so the proxy must not buffer it or cut it off:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;       # live streams and long recordings
    proxy_send_timeout 3600s;
}
# live TV: do not buffer (tvhgo also sends X-Accel-Buffering: no on the transcoded /live stream)
location ~ ^/api/channels/[0-9]+/(live|stream)$ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

!!! note
    This fork was tested behind **BunkerWeb** (nginx-based) with 3600 s proxy timeouts: login, a 1080p live stream
    running in real time, and seeking in a 90-minute recording all worked. The nginx snippet above follows the same
    idea but has not itself been run as written. tvhgo needs no WebSocket support.

## Mounting recordings from a network share

The recordings mount can be an NFS/SMB share mounted on the Docker host. Read-only is fine. The on-demand cache and
the database live in `./data` - if you convert a lot, point `TVHGO_PLAYBACK_CACHE_DIR` at a volume with enough
space (see `CACHE_MAX_GB`, default 50).

## Updating

```bash
cd tvhgo && git pull
docker compose up -d --build
```

The database and cache in `./data` are kept. Back up `./data/tvhgo.db` if you care about your users and sessions.

## Uninstalling

```bash
docker compose down            # keeps ./data
rm -rf data                    # removes the database and cache - this is permanent
```

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Container exits at start, log says the Tvheadend host is required | `TVHEADEND_HOST` empty in `.env` |
| Login page works but channels/guide are empty or errors | Wrong Tvheadend credentials, or the user lacks the *Web interface* right. Test with the `curl` commands in step 1 |
| `permission denied` creating the database | `./data` is not writable by uid 1000: `sudo chown 1000:1000 data` |
| Recording says *no playable copy* and no progress appears | On-demand conversion is off: set `TVHGO_PLAYBACK_CONVERT=true` (and mount the recordings, step 2) |
| Conversion fails immediately | The recordings mount path does not match Tvheadend's: check `TVHGO_PLAYBACK_TVHEADEND_ROOT` against the file path shown in Tvheadend (*Recordings* → the file name column) and the mount. The log (`docker compose logs tvhgo`) shows the file it could not find |
| Live TV does not start, but other channels do | Both tuners are busy with recordings on other multiplexes: Tvheadend refuses a third service. Try a channel on a multiplex that is already in use, or wait |
| Live TV stutters | Pick a lower quality; each live stream uses CPU. Check `LIVE_MAX_STREAMS` and your CPU load |
| Quality menu is missing | `TVHGO_PLAYBACK_LIVE_TRANSCODE=false`, or ffmpeg is not in the image (build with `Dockerfile.player`) |
| **Auto** live option fails but numbered ones work | Tvheadend's browser profiles need ffmpeg in the Tvheadend container; some newer ffmpeg builds break Tvheadend's MPEG-TS profile (tvhgo therefore uses the Matroska and WebM ones) |
| No thumbnails for upcoming recordings | Expected without a TMDb key - they have no recording to take a frame from. See [TMDb artwork](../configuration.md#tmdb-artwork) |
| Cannot log in over HTTP after enabling HTTPS | `COOKIE_SECURE=true` requires HTTPS; browse via the HTTPS address |
