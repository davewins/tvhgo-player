package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
)

// GetAutorecs godoc
//
//	@Summary	Get the series rules (tvheadend autorec entries)
//	@Tags		dvr
//	@Produce	json
//	@Success	200	{array}	core.Autorec
//	@Security	JWT
//	@Router		/dvr/autorec [get]
func (s *router) GetAutorecs(w http.ResponseWriter, r *http.Request) {
	list, err := s.recordings.GetAutorecs(r.Context())
	if err != nil {
		log.Error().Err(err).Msg("failed to get series rules")
		response.InternalErrorCommon(w)
		return
	}
	response.JSON(w, list, http.StatusOK)
}

// CreateAutorec godoc
//
//	@Summary	Create a series rule from a programme (this channel only unless anyChannel is set)
//	@Tags		dvr
//	@Accept		json
//	@Produce	json
//	@Param		body	body		core.CreateAutorecByEvent	true	"Rule options"
//	@Success	201		{object}	core.Autorec
//	@Failure	404		{object}	response.ErrorResponse
//	@Failure	409		{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/dvr/autorec [post]
func (s *router) CreateAutorec(w http.ResponseWriter, r *http.Request) {
	var opts core.CreateAutorecByEvent
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil || opts.EventID == 0 {
		response.BadRequestf(w, "an eventId is required")
		return
	}
	rule, err := s.recordings.CreateAutorecByEvent(r.Context(), opts)
	switch {
	case err == nil:
		response.JSON(w, rule, http.StatusCreated)
	case errors.Is(err, core.ErrAutorecExists):
		response.JSON(w, response.ErrorResponse{Message: err.Error()}, http.StatusConflict)
	case errors.Is(err, core.ErrEpgEventNotFound):
		response.NotFound(w, err)
	default:
		log.Error().Err(err).Msg("failed to create series rule")
		response.InternalErrorCommon(w)
	}
}

// UpdateAutorec godoc
//
//	@Summary	Enable or disable a series rule
//	@Tags		dvr
//	@Accept		json
//	@Param		id		path	string					true	"Rule id"
//	@Param		body	body	map[string]bool	true	"{\"enabled\": true}"
//	@Success	204
//	@Security	JWT
//	@Router		/dvr/autorec/{id} [patch]
func (s *router) UpdateAutorec(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Enabled == nil {
		response.BadRequestf(w, "enabled is required")
		return
	}
	if err := s.recordings.SetAutorecEnabled(r.Context(), chi.URLParam(r, "id"), *body.Enabled); err != nil {
		log.Error().Err(err).Msg("failed to update series rule")
		response.InternalErrorCommon(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteAutorec godoc
//
//	@Summary	Delete a series rule (recordings it already made are kept)
//	@Tags		dvr
//	@Param		id	path	string	true	"Rule id"
//	@Success	204
//	@Security	JWT
//	@Router		/dvr/autorec/{id} [delete]
func (s *router) DeleteAutorec(w http.ResponseWriter, r *http.Request) {
	if err := s.recordings.RemoveAutorec(r.Context(), chi.URLParam(r, "id")); err != nil {
		log.Error().Err(err).Msg("failed to delete series rule")
		response.InternalErrorCommon(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
