package core

type (
	// PipelineCurrent is the step the recording pipeline is working on right now.
	PipelineCurrent struct {
		// ID is the recording's id (tvheadend dvr uuid).
		ID    string `json:"id"`
		Title string `json:"title"`
		// Step is convert_mp4, comskip, thumbnail, strip_ad ...
		Step string `json:"step"`
		// Percent is nil while the step has no measurable progress.
		Percent *float64 `json:"percent"`
		Since   int64    `json:"since"`
	}

	// PipelineWaiting is a recording that still has steps to do.
	PipelineWaiting struct {
		ID    string   `json:"id"`
		Title string   `json:"title"`
		Steps []string `json:"steps"`
	}

	// PipelineFailure is a step that failed.
	PipelineFailure struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Step     string `json:"step"`
		Detail   string `json:"detail"`
		Attempts int    `json:"attempts"`
		// RetryAt is when it is tried again (unix seconds); nil once the pipeline has given up.
		RetryAt *int64 `json:"retry_at"`
	}

	// PipelineStatus is what the recording pipeline reports.
	PipelineStatus struct {
		// Available is false when no status file is configured or it is stale (the pipeline is not running).
		Available bool              `json:"available"`
		Current   *PipelineCurrent  `json:"current"`
		Queue     []PipelineWaiting `json:"queue"`
		Failed    []PipelineFailure `json:"failed"`
	}
)
