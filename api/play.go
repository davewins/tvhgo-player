package api

import (
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
)

func (s *router) recordingForPlayback(w http.ResponseWriter, r *http.Request) *core.Recording {
	id := chi.URLParam(r, "id")
	rec, err := s.recordings.Get(r.Context(), id)
	if err != nil {
		if err == core.ErrRecordingNotFound {
			response.NotFound(w, err)
			return nil
		}
		log.Error().Str("id", id).Err(err).Msg("failed to get recording for playback")
		response.InternalErrorCommon(w)
		return nil
	}
	return rec
}

// GetPlaybackStatus godoc
//
//	@Summary	Get the browser playback state of a recording
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Produce	json
//	@Success	200	{object}	core.PlaybackInfo
//	@Failure	404	{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/recordings/{id}/playback [get]
func (s *router) GetPlaybackStatus(w http.ResponseWriter, r *http.Request) {
	rec := s.recordingForPlayback(w, r)
	if rec == nil {
		return
	}
	if rec.Status != "completed" {
		response.JSON(w, core.PlaybackInfo{Status: core.PlaybackNone}, http.StatusOK)
		return
	}
	response.JSON(w, s.playback.Status(rec), http.StatusOK)
}

// PreparePlayback godoc
//
//	@Summary	Start creating a browser-playable copy of a recording (if none exists)
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Produce	json
//	@Success	202	{object}	core.PlaybackInfo
//	@Failure	404	{object}	response.ErrorResponse
//	@Failure	409	{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/recordings/{id}/playback [post]
func (s *router) PreparePlayback(w http.ResponseWriter, r *http.Request) {
	rec := s.recordingForPlayback(w, r)
	if rec == nil {
		return
	}
	if rec.Status != "completed" {
		response.BadRequestf(w, "recording is not finished")
		return
	}
	info, err := s.playback.Prepare(rec)
	if err != nil {
		switch err {
		case core.ErrPlaybackConversionDisabled, core.ErrPlaybackNoSource:
			response.JSON(w, response.ErrorResponse{Message: err.Error()}, http.StatusConflict)
		default:
			log.Error().Str("id", rec.ID).Err(err).Msg("failed to prepare playback")
			response.InternalErrorCommon(w)
		}
		return
	}
	response.JSON(w, info, http.StatusAccepted)
}

// PlayRecording godoc
//
//	@Summary	Play a recording in the browser (MP4, supports seeking via HTTP range requests); with ?download=1 as an attachment
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Produce	video/mp4
//	@Success	200
//	@Failure	404	{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/recordings/{id}/play [get]
func (s *router) PlayRecording(w http.ResponseWriter, r *http.Request) {
	rec := s.recordingForPlayback(w, r)
	if rec == nil {
		return
	}
	p, ok := s.playback.File(rec)
	if !ok {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	f, err := os.Open(p)
	if err != nil {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	if r.URL.Query().Get("download") != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": downloadName(rec)}))
	}
	http.ServeContent(w, r, filepath.Base(p), fi.ModTime(), f)
}

// downloadName names the MP4 download after the recording as Tvheadend named it ("Show - 2026-11-09 20.00.mp4").
func downloadName(rec *core.Recording) string {
	base := filepath.Base(rec.Filename)
	name := strings.TrimSuffix(base, filepath.Ext(base))
	if name == "" || name == "." || name == "/" {
		name = strings.NewReplacer("/", "-", "\\", "-").Replace(rec.Title)
	}
	if name == "" {
		name = "recording"
	}
	return name + ".mp4"
}

// GetRecordingThumb godoc
//
//	@Summary	Get a thumbnail for a recording (a frame from the recording, else TMDb artwork)
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Produce	image/jpeg
//	@Success	200
//	@Failure	404	{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/recordings/{id}/thumb [get]
func (s *router) GetRecordingThumb(w http.ResponseWriter, r *http.Request) {
	rec := s.recordingForPlayback(w, r)
	if rec == nil {
		return
	}
	p, ok := s.playback.Thumb(r.Context(), rec)
	if !ok {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	f, err := os.Open(p)
	if err != nil {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		response.NotFound(w, core.ErrRecordingNotFound)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, filepath.Base(p), fi.ModTime(), f)
}
