package api

import (
	"net/http"

	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/rs/zerolog/log"
)

// WithTuners adds the tuner status service (optional: without it the endpoint reports "not available").
func (s *router) WithTuners(t core.TunerService) *router {
	s.tuners = t
	return s
}

// GetTuners godoc
//
//	@Summary	Get tuner usage and the channels that cannot be tuned right now
//	@Tags		tuners
//	@Produce	json
//	@Success	200	{object}	core.TunerStatus
//	@Security	JWT
//	@Router		/tuners [get]
func (s *router) GetTuners(w http.ResponseWriter, r *http.Request) {
	if s.tuners == nil {
		response.JSON(w, core.TunerStatus{Tuners: []core.Tuner{}, Blocked: []string{}}, 200)
		return
	}
	st, err := s.tuners.Status(r.Context())
	if err != nil {
		log.Error().Err(err).Msg("failed to get tuner status")
		response.InternalErrorCommon(w)
		return
	}
	response.JSON(w, st, 200)
}
