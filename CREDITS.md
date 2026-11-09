# Credits

This project stands on other people's work. Thank you to all of them.

## tvhgo - David Borzek and contributors

This repository is a **fork of [tvhgo](https://github.com/davidborzek/tvhgo)** by **David Borzek**
([@davidborzek](https://github.com/davidborzek)) and its contributors, released under the MIT licence.
Everything that makes tvhgo a good Tvheadend front end - the API, the web UI, authentication and two-factor
login, the guide, recording management, sessions and tokens, the metrics, the documentation and the project
structure - is their work. This fork only adds the in-browser player and the features listed in the
[README](README.md#what-this-fork-adds). The original copyright notice is kept in [LICENSE](LICENSE).

If you do not need the player, use the original project: <https://github.com/davidborzek/tvhgo>.

## Claude (Anthropic) - AI assistance

The additions in this fork were developed with [Claude](https://www.anthropic.com/claude), an AI model from Anthropic,
through Claude Code, directed and tested by davewins. Claude wrote most of the new code, tests and documentation.
See [AI assistance in the README](README.md#ai-assistance). Anthropic and Claude are trademarks of Anthropic, PBC;
this project is not affiliated with or endorsed by Anthropic.

## Tvheadend

[Tvheadend](https://tvheadend.org) is the TV streaming server and recorder that tvhgo is a front end for. All
tuning, EPG data, recording and streaming comes from Tvheadend and its contributors. tvhgo is not affiliated with or
endorsed by the Tvheadend project.

## TMDb

<img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" height="30" />

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

Optional programme artwork (the thumbnails for recordings that have no frame yet) is provided by
[The Movie Database (TMDb)](https://www.themoviedb.org). Use of the API is subject to the
[TMDb terms of use](https://www.themoviedb.org/api-terms-of-use); you need your own free API key. Programme titles
are sent to TMDb to look the artwork up, and the images are TMDb's / their contributors' property.

## Other components

- [FFmpeg](https://ffmpeg.org) and [x264](https://www.videolan.org/developers/x264.html) - converting recordings and
  transcoding live TV (installed in the Docker image from Alpine Linux packages; FFmpeg/x264 have their own licences,
  LGPL/GPL, which apply if you redistribute an image containing them).
- Go libraries (chi, zerolog, golang-migrate, Prometheus client and others) and the React, Vite and i18next
  ecosystem used by the original project - see `go.mod` and `ui/package.json`.
- [Playwright](https://playwright.dev) - used to test the player in a real browser while developing it.
