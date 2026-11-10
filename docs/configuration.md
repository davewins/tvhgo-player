tvhgo can be configured using environment variables or a config file.

> Note: Environment Variables will be overridden by the config file.

## Config via File

The configuration file in in the YAML format and looks like this:

```yaml
server:
  host: 127.0.0.1
  port: 8080

tvheadend:
  scheme: http
  host: <tvheadend_host>
  port: 9981
  username: <tvheadend_username>
  password: <tvheadend_password>

database:
  path: ./tvhgo.db
```

tvhgo will search for a config files at the following paths with the following order:

- `./config.yml`
- `./config.yaml`
- `/etc/tvhgo/config.yml`
- `/etc/tvhgo/config.yaml`

Alternatively, you can specify the path to the config file using the `TVHGO_CONFIG` environment variable
or the `--config` flag.

```bash
# Using the flag
tvhgo --config /path/to/config.yml

# Using the environment variable
TVHGO_CONFIG=/path/to/config.yml tvhgo
```

## Config via Environment Variable

To configure tvhgo using environment variables, you can use the following syntax:

```bash
TVHGO_<SECTION_NAMES...>_<CONFIG_PROPERTY>=<VALUE>
```

For example, to configure the tvheadend password:

```bash
TVHGO_TVHEADEND_PASSWORD=<YOUR_PASSWORD>
```

## Options

### Server config (server)

| Parameter  | Type       | Required | Default | Description                                                               |
| ---------- | ---------- | -------- | ------- | ------------------------------------------------------------------------- |
| host       | string     | false    |         | Bind host of the http server.                                             |
| port       | int        | false    | 8080    | Bind port of the http server. Ports below `1024` may require root rights. |
| swagger_ui | Swagger UI | false    |         | Swagger UI config.                                                        |

**Example**

```yaml
server:
  host: 127.0.0.1
  port: 1234
```

#### Swagger UI config (swagger_ui)

| Parameter | Type    | Required | Default | Description                      |
| --------- | ------- | -------- | ------- | -------------------------------- |
| enabled   | boolean | false    | true    | Enables the Swagger UI api docs. |

If enabled, you can access Swagger UI by visiting `http(s)://your-server(:8080)/api/swagger`.

**Example**

```yaml
server:
  swagger_ui:
    enabled: false
```

### Log config (log)

| Parameter | Type                                      | Required | Default | Description     |
| --------- | ----------------------------------------- | -------- | ------- | --------------- |
| level     | enum (debug, info, warning, error, fatal) | false    | info    | The log level.  |
| format    | enum(console, json)                       | false    | console | The log format. |

**Example**

```yaml
log:
  level: debug
  format: json
```

### Tvheadend config (tvheadend)

| Parameter | Type   | Required | Default | Description                                                                                      |
| --------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------------------ |
| scheme    | string | false    | http    | Scheme of the tvheadend server url.                                                              |
| host      | string | **true** |         | Host (hostname or ip) of the tvheadend server.                                                   |
| port      | int    | false    | 9981    | Port of the tvheadend server.                                                                    |
| username  | string | false    |         | Username of the tvheadend server.                                                                |
| password  | string | false    |         | Password of the tvheadend server. It is recommended to configure it via an environment variable. |
| status_username | string | false |         | Optional second account used **only** to read tuner status and the channel-to-multiplex map (`TVHGO_TVHEADEND_STATUS_USERNAME`). Tvheadend gives those only to admin users, and scheduled recordings need *Video recorder: View all*, so keep it separate from the main account. Without it the tuner display and clash warnings are simply off. |
| status_password | string | false |         | Password for `status_username` (`TVHGO_TVHEADEND_STATUS_PASSWORD`). Use an environment variable.   |

> NOTE: Currently only plain text authentication is supported. Set the authentication type in tvheadent either to `Plain (insecure)` or `Both plain and digest`.

**Example**

```yaml
tvheadend:
  scheme: https
  host: 10.0.0.2
  port: 5555
  username: my_user
  password: supersecret
```

### Database config (database)

| Parameter | Type                                                                                                        | Required | Default                                           | Description                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- | ------------------------------------------------- |
| type      | enum(`sqlite3`, `postgres`)                                                                                 | false    | sqlite3                                           | Type of the database.                             |
| path      | string                                                                                                      | false    | ./tvhgo.db (for the docker image: /data/tvhgo.db) | Path of the database file. (only for `sqlite3`)   |
| host      | string                                                                                                      | false    | localhost                                         | Host of the database. (only for `postgres`)       |
| port      | int                                                                                                         | false    | 5432                                              | Port of the database. (only for `postgres`)       |
| user      | string                                                                                                      | false    | tvhgo                                             | The database user. (only for `postgres`)          |
| database  | string                                                                                                      | false    | tvhgo                                             | The database name. (only for `postgres`)          |
| ssl_mode  | see [PostgresSQL Docs](https://www.postgresql.org/docs/current/libpq-ssl.html#LIBPQ-SSL-SSLMODE-STATEMENTS) | false    | disable                                           | SSL mode of the connection. (only for `postgres`) |

**Example: sqlite3**

```yaml
database:
  type: sqlite3
  path: /path/to/database.db
```

**Example: postgres**

```yaml
database:
  type: postgres
  host: 127.0.0.1
  password: supersecret
```

### Auth config (auth)

#### Session config (auth.session)

| Parameter                 | Type          | Required | Default       | Description                                                                                                           |
| ------------------------- | ------------- | -------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| cookie_name               | string        | false    | tvhgo_session | The name of the session cookie.                                                                                       |
| cookie_secure             | bool          | false    | false         | Sets the `secure` attribute of the session cookie.                                                                    |
| maximum_inactive_lifetime | time.Duration | false    | 168h          | The maximum inactive lifetime of a session. This configures the maximum lifetime of the session after the last login. |
| maximum_lifetime          | time.Duration | false    | 720h          | The maximum lifetime of a session.                                                                                    |
| token_rotation_interval   | time.Duration | false    | 30m           | The rotation interval of the token.                                                                                   |
| cleanup_interval          | time.Duration | false    | 12h           | The interval of the scheduler to cleanup expired sessions.                                                            |

**Example**

```yaml
auth:
  session:
    cookie_name: foobar_session
    cookie_secure: true
    maximum_inactive_lifetime: 24h
    maximum_lifetime: 168h
    token_rotation_interval: 1h
    cleanup_interval: 6h
```

#### TOTP config (auth.totp)

| Parameter | Type   | Required | Default | Description      |
| --------- | ------ | -------- | ------- | ---------------- |
| issuer    | string | false    | tvhgo   | The totp issuer. |

**Example**

```yaml
auth:
  totp:
    issuer: foobar
```

#### Reverse proxy auth config (auth.reverse_proxy)

| Parameter          | Type     | Required | Default      | Description                                                              |
| ------------------ | -------- | -------- | ------------ | ------------------------------------------------------------------------ |
| enabled            | bool     | false    | false        | Enable reverse proxy authentication.                                     |
| user_header        | string   | false    | Remote-User  | The header containing the username.                                      |
| email_header       | string   | false    | Remote-Email | The header containing the email.                                         |
| name_header        | string   | false    | Remote-Name  | The header containing the name.                                          |
| allowed_proxies    | []string | false    | []           | List of allowed proxies. If not set, all requests will be blocked.       |
| allow_registration | bool     | false    | false        | If this is enabled, not existing users will automatically be registered. |

### Metrics config (metrics)

| Parameter | Type   | Required | Default  | Description                                                                  |
| --------- | ------ | -------- | -------- | ---------------------------------------------------------------------------- |
| enabled   | bool   | false    | false    | This enables the metrics endpoint exposing metrics in the prometheus format. |
| path      | string | false    | /metrics | The http path where the metrics are exposed.                                 |
| host      | string | false    |          | Bind host of the metrics http server.                                        |
| port      | int    | false    | 8081     | The http port of the metrics server.                                         |
| token     | string | false    |          | Bearer authentication token of the http metrics endpoint.                    |

> NOTE: The port cannot be the same port as the normal tvhgo http server.

**Example**

```yaml
metrics:
  enabled: true
  path: /prometheus
  host: 127.0.0.1
  port: 2345
  token: supersecret
```

### Playback config (playback)

Settings for playing **finished recordings** in the browser. Browsers cannot play the MPEG-TS files Tvheadend
records, so tvhgo serves an MP4. It looks for one in this order: (1) `source_dir`, if you already have a pipeline or
media server that creates MP4 copies, (2) its own cache, (3) if `convert` is enabled, it creates one on demand with
ffmpeg the first time someone presses Play (progress is shown, afterwards it starts instantly and supports seeking).

Playing **live TV** needs none of this: it uses Tvheadend's `webtv-*` stream profiles (Tvheadend needs ffmpeg for
those; the `webtv-h264-aac-matroska` profile is used where the browser supports it, otherwise
`webtv-vp8-vorbis-webm`).

| Key                  | Env variable                       | Default            | Description                                                                                           |
| -------------------- | ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `tvheadend_root`     | `TVHGO_PLAYBACK_TVHEADEND_ROOT`    | `/recordings`      | Directory prefix of the recording file paths that Tvheadend reports.                                  |
| `recordings_dir`     | `TVHGO_PLAYBACK_RECORDINGS_DIR`    | `tvheadend_root`   | Where tvhgo sees that same directory. Mount it read-only into the container.                          |
| `source_dir`         | `TVHGO_PLAYBACK_SOURCE_DIR`        | _(empty)_          | Optional folder with ready-made MP4s mirroring the recordings tree: `<root>/a/b.ts` → `<source_dir>/a/b.mp4`. |
| `convert`            | `TVHGO_PLAYBACK_CONVERT`           | `false`            | Convert recordings on demand with ffmpeg (needs `ffmpeg`/`ffprobe`, `recordings_dir`, writable `cache_dir`). |
| `cache_dir`          | `TVHGO_PLAYBACK_CACHE_DIR`         | `/tvhgo/cache`     | Where converted files are stored.                                                                     |
| `cache_max_gb`       | `TVHGO_PLAYBACK_CACHE_MAX_GB`      | `50`               | Size limit of the cache. Least recently played files are removed first.                               |
| `cache_max_age_days` | `TVHGO_PLAYBACK_CACHE_MAX_AGE_DAYS`| `30`               | Files not played for this long are removed.                                                           |
| `max_jobs`           | `TVHGO_PLAYBACK_MAX_JOBS`          | `1`                | Number of conversions running at the same time (others wait in a queue).                              |
| `ffmpeg` / `ffprobe` | `TVHGO_PLAYBACK_FFMPEG` / `_FFPROBE` | `ffmpeg` / `ffprobe` | Binaries to use.                                                                                  |
| `pipeline_status`    | `TVHGO_PLAYBACK_PIPELINE_STATUS`   | _(empty)_          | Optional path of the `status.json` written by a recording pipeline ([tvh-pipeline](https://github.com/davewins/tvh-freeview-stack)): shows what it is converting, how far, what waits and what failed. Mount its state folder read-only. |
| `live_encoder`       | `TVHGO_PLAYBACK_LIVE_ENCODER`      | `cpu`              | How live TV is encoded: `cpu` (x264) or `vaapi` (GPU: Intel Broadwell or newer, or AMD). About 5x less CPU per stream. Falls back to the CPU on its own if the GPU is missing or fails. See [GPU live encoding](player.md#gpu-live-encoding-optional). |
| `live_vaapi_device`  | `TVHGO_PLAYBACK_LIVE_VAAPI_DEVICE` | `/dev/dri/renderD128` | The GPU render node used for `vaapi`. |
| `tmdb_api_key`       | `TVHGO_PLAYBACK_TMDB_API_KEY`      | _(empty)_          | Optional [TMDb](https://www.themoviedb.org) v3 API key: programme artwork for recordings without a frame (e.g. upcoming ones). Programme titles are sent to TMDb; only exact title matches are used, and if several shows share a title the UK-made one is preferred (otherwise the most popular); results are cached in `cache_dir`. |
| `tmdb_language`      | `TVHGO_PLAYBACK_TMDB_LANGUAGE`     | `en-GB`            | Language for TMDb lookups.                                                                            |
| `preset`             | `TVHGO_PLAYBACK_PRESET`            | `veryfast`         | x264 speed preset.                                                                                    |
| `crf`                | `TVHGO_PLAYBACK_CRF`               | `22`               | x264 quality (lower = better and larger). SD recordings use `crf - 2`.                                |

Conversions re-encode to H.264/AAC with a keyframe every ~2 seconds (so seeking works in every browser), pick the
main audio track (not the audio-description one) and convert non-square-pixel SD video to square pixels.

**Thumbnails:** the recordings list and detail pages show a still from the recording (from `source_dir`'s
`<name>-thumb.jpg` if present, otherwise extracted with ffmpeg and cached). Recordings without one (e.g. upcoming
ones) fall back to TMDb artwork if `tmdb_api_key` is set.

*This product uses the TMDB API but is not endorsed or certified by TMDB.*

### TMDb artwork

Optional. Recordings that are not finished yet (such as upcoming ones) have no frame to use as a thumbnail; with a
TMDb key tvhgo fetches the programme's artwork from [The Movie Database](https://www.themoviedb.org) instead.

**1. Get a key (free, for personal use)**

1. Create an account at <https://www.themoviedb.org/signup> and confirm your email.
2. Open *Settings → API* (<https://www.themoviedb.org/settings/api>) and request an API key (choose the *Developer*
   option and accept the [terms of use](https://www.themoviedb.org/api-terms-of-use)).
3. Copy the **API Key** - a 32-character string of letters and digits. (Not the long *API Read Access Token*;
   tvhgo uses the v3 key.)
4. Check it works: `curl "https://api.themoviedb.org/3/authentication?api_key=YOUR_KEY"` should answer `{"success":true,...}`.

**2. Give it to tvhgo - any one of these**

=== "Docker compose (recommended)"

    Put it in the `.env` file next to your compose file (this file is git-ignored; never commit a key):

    ```bash
    TMDB_API_KEY=0123456789abcdef0123456789abcdef
    ```

    The example compose file passes it through as `TVHGO_PLAYBACK_TMDB_API_KEY: ${TMDB_API_KEY:-}`. Then apply it:

    ```bash
    docker compose up -d
    ```

=== "Environment variable"

    ```bash
    TVHGO_PLAYBACK_TMDB_API_KEY=0123456789abcdef0123456789abcdef
    TVHGO_PLAYBACK_TMDB_LANGUAGE=en-GB     # optional
    ```

=== "Config file"

    ```yaml
    playback:
      tmdb_api_key: 0123456789abcdef0123456789abcdef
      tmdb_language: en-GB
    ```

    Settings in the config file override environment variables. Keep the file private (`chmod 600`).

=== "Portainer / other stack tools"

    Add a stack variable (for example `TVHGO_TMDB_KEY`) and reference it from the compose file as
    `TVHGO_PLAYBACK_TMDB_API_KEY: ${TVHGO_TMDB_KEY}`, so the key is stored in the stack's settings and not in the
    compose text.

**3. Check it**

Open *Recordings → Upcoming*. Programmes TMDb knows by their exact title (e.g. a soap or a drama series) get a
picture within a few seconds the first time. Programmes it has no exact match for (news, one-offs) correctly stay
blank. Pictures are cached in `<cache_dir>/art`; to force a fresh lookup delete that folder (a "no match" is
otherwise remembered for a week).

**Privacy and licence**

- tvhgo sends the **programme title** (for example `Emmerdale`) and your key to TMDb to look it up, and downloads the
  image. Nothing else is sent. Leave the key unset to switch this off completely.
- Use of the TMDb API is subject to their terms. *This product uses the TMDB API but is not endorsed or certified by TMDB.*

