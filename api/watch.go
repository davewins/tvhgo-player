package api

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"

	"github.com/davidborzek/tvhgo/api/request"
	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
)

// WithWatchProgress adds the per-user watch progress store (optional).
func (s *router) WithWatchProgress(w core.WatchProgressRepository) *router {
	s.watch = w
	return s
}

// GetWatchProgress godoc
//
//	@Summary	How far the current user has watched their recordings
//	@Tags		recordings
//	@Produce	json
//	@Success	200	{array}	core.WatchProgress
//	@Security	JWT
//	@Router		/recordings/progress [get]
func (s *router) GetWatchProgress(w http.ResponseWriter, r *http.Request) {
	auth, ok := request.GetAuthContext(r.Context())
	if !ok || s.watch == nil {
		response.JSON(w, []core.WatchProgress{}, http.StatusOK)
		return
	}
	list, err := s.watch.List(r.Context(), auth.UserID)
	if err != nil {
		log.Error().Err(err).Msg("failed to list watch progress")
		response.InternalErrorCommon(w)
		return
	}
	response.JSON(w, list, http.StatusOK)
}

// SaveWatchProgress godoc
//
//	@Summary	Remember where the current user stopped watching a recording
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Success	204
//	@Security	JWT
//	@Router		/recordings/{id}/progress [put]
func (s *router) SaveWatchProgress(w http.ResponseWriter, r *http.Request) {
	auth, ok := request.GetAuthContext(r.Context())
	if !ok || s.watch == nil {
		response.InternalErrorCommon(w)
		return
	}
	var body struct {
		Position float64 `json:"position"`
		Duration float64 `json:"duration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		math.IsNaN(body.Position) || math.IsInf(body.Position, 0) ||
		math.IsNaN(body.Duration) || math.IsInf(body.Duration, 0) ||
		body.Position < 0 || body.Duration < 0 {
		response.Error(w, errors.New("invalid progress"), http.StatusBadRequest)
		return
	}
	p := &core.WatchProgress{RecordingID: chi.URLParam(r, "id"), Position: body.Position, Duration: body.Duration}
	if err := s.watch.Save(r.Context(), auth.UserID, p); err != nil {
		log.Error().Err(err).Msg("failed to save watch progress")
		response.InternalErrorCommon(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteWatchProgress godoc
//
//	@Summary	Forget where the current user stopped watching a recording
//	@Tags		recordings
//	@Param		id	path	string	true	"Recording id"
//	@Success	204
//	@Security	JWT
//	@Router		/recordings/{id}/progress [delete]
func (s *router) DeleteWatchProgress(w http.ResponseWriter, r *http.Request) {
	auth, ok := request.GetAuthContext(r.Context())
	if !ok || s.watch == nil {
		response.InternalErrorCommon(w)
		return
	}
	if err := s.watch.Delete(r.Context(), auth.UserID, chi.URLParam(r, "id")); err != nil {
		log.Error().Err(err).Msg("failed to delete watch progress")
		response.InternalErrorCommon(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
