package api

import (
	"net/http"
	"slices"
	"strconv"

	"github.com/davidborzek/tvhgo/api/request"
	"github.com/davidborzek/tvhgo/api/response"
	"github.com/davidborzek/tvhgo/core"
	"github.com/rs/zerolog/log"
)

// GetLiveQualities godoc
//
//	@Summary	Get the selectable live TV transcode heights (empty if live transcoding is disabled)
//	@Tags		channels
//	@Produce	json
//	@Success	200
//	@Security	JWT
//	@Router		/playback/live [get]
func (s *router) GetLiveQualities(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, map[string][]int{"qualities": s.playback.LiveQualities()}, http.StatusOK)
}

// StreamChannelLive godoc
//
//	@Summary	Watch a channel live in the browser, transcoded by tvhgo to the given height (fragmented MP4)
//	@Tags		channels
//	@Param		number	path	string	true	"Channel number"
//	@Param		quality	query	int		true	"Output height, e.g. 720"
//	@Produce	video/mp4
//	@Success	200
//	@Failure	400	{object}	response.ErrorResponse
//	@Failure	503	{object}	response.ErrorResponse
//	@Security	JWT
//	@Router		/channels/{number}/live [get]
func (s *router) StreamChannelLive(w http.ResponseWriter, r *http.Request) {
	number, err := request.NumericURLParam(r, "number")
	if err != nil {
		response.BadRequestf(w, "invalid value for parameter 'number'")
		return
	}
	quality, err := strconv.Atoi(r.URL.Query().Get("quality"))
	if err != nil || !slices.Contains(s.playback.LiveQualities(), quality) {
		response.BadRequestf(w, "unsupported quality")
		return
	}

	// raw MPEG-TS from tvheadend (no tvheadend-side transcoding); tied to this request, so it ends with the viewer
	res, err := s.streaming.GetChannelStream(r.Context(), number, "pass")
	if err != nil {
		log.Error().Int64("channel", number).Err(err).Msg("failed to get channel stream for live transcode")
		response.InternalErrorCommon(w)
		return
	}
	defer res.Body.Close()

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")

	if err := s.playback.StreamLive(r.Context(), res.Body, w, quality); err != nil {
		w.Header().Del("X-Accel-Buffering")
		switch err {
		case core.ErrLiveBusy:
			response.JSON(w, response.ErrorResponse{Message: err.Error()}, http.StatusServiceUnavailable)
		case core.ErrLiveDisabled, core.ErrLiveQuality:
			response.BadRequestf(w, "%s", err.Error())
		default:
			log.Error().Int64("channel", number).Err(err).Msg("live transcode failed")
			response.InternalErrorCommon(w)
		}
	}
}
