package api

import (
	"net/http"
	"strconv"

	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/services/pipeline"
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

// GetTunerClashes godoc
//
//	@Summary	Scheduled recordings that need more multiplexes than there are tuners
//	@Tags		tuners
//	@Param		channelId	query	string	false	"Also check recording this programme: channel id"
//	@Param		start		query	int		false	"Programme start (unix seconds)"
//	@Param		end			query	int		false	"Programme end (unix seconds)"
//	@Param		title		query	string	false	"Programme title"
//	@Produce	json
//	@Success	200	{array}	core.Clash
//	@Security	JWT
//	@Router		/tuners/clashes [get]
func (s *router) GetTunerClashes(w http.ResponseWriter, r *http.Request) {
	if s.tuners == nil {
		response.JSON(w, []core.Clash{}, 200)
		return
	}
	var probe *core.ClashProbe
	q := r.URL.Query()
	if ch := q.Get("channelId"); ch != "" {
		start, _ := strconv.ParseInt(q.Get("start"), 10, 64)
		end, _ := strconv.ParseInt(q.Get("end"), 10, 64)
		if start > 0 && end > start {
			probe = &core.ClashProbe{ChannelID: ch, Title: q.Get("title"), Start: start, End: end}
		}
	}
	clashes, err := s.tuners.Clashes(r.Context(), probe)
	if err != nil {
		log.Error().Err(err).Msg("failed to check recording clashes")
		response.InternalErrorCommon(w)
		return
	}
	response.JSON(w, clashes, 200)
}

// WithPipeline adds the recording pipeline status reader (optional).
func (s *router) WithPipeline(p *pipeline.Reader) *router {
	s.pipe = p
	return s
}

// GetPipeline godoc
//
//	@Summary	What the recording pipeline is converting, what waits and what failed
//	@Tags		pipeline
//	@Produce	json
//	@Success	200	{object}	core.PipelineStatus
//	@Security	JWT
//	@Router		/pipeline [get]
func (s *router) GetPipeline(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, s.pipe.Status(), 200)
}
