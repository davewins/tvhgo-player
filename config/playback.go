package config

import "os/exec"

const (
	defaultPlaybackRoot       = "/recordings"
	defaultPlaybackCacheDir   = "/tvhgo/cache"
	defaultPlaybackCacheMaxGB = 50
	defaultPlaybackCacheDays  = 30
	defaultPlaybackMaxJobs    = 1
	defaultPlaybackPreset     = "veryfast"
	defaultPlaybackCRF        = 22
)

type (
	// PlaybackConfig configures in-browser playback of finished recordings.
	//
	// Browsers cannot play the MPEG-TS files tvheadend records, so tvhgo needs an MP4 to serve. It looks for one in
	// SourceDir first (e.g. made by your own pipeline or media server), then in its own cache, and if neither
	// exists and Convert is enabled it creates one on demand with ffmpeg.
	PlaybackConfig struct {
		// TvheadendRoot is the directory prefix of the recording paths that tvheadend reports.
		TvheadendRoot string `yaml:"tvheadend_root" env:"TVHEADEND_ROOT"`
		// RecordingsDir is where tvhgo sees that same directory (mount it read-only). Defaults to TvheadendRoot.
		RecordingsDir string `yaml:"recordings_dir" env:"RECORDINGS_DIR"`
		// SourceDir optionally points at ready-made MP4 files mirroring the recordings tree: the MP4 for
		// <TvheadendRoot>/a/b.ts is looked up at <SourceDir>/a/b.mp4. Empty disables the lookup.
		SourceDir string `yaml:"source_dir" env:"SOURCE_DIR"`
		// Convert enables on-demand conversion with ffmpeg (needs ffmpeg/ffprobe, RecordingsDir and a writable CacheDir).
		Convert bool `yaml:"convert" env:"CONVERT"`
		// CacheDir stores converted files.
		CacheDir string `yaml:"cache_dir" env:"CACHE_DIR"`
		// CacheMaxGB / CacheMaxAgeDays bound the cache; least recently played files are removed first.
		CacheMaxGB      int `yaml:"cache_max_gb" env:"CACHE_MAX_GB"`
		CacheMaxAgeDays int `yaml:"cache_max_age_days" env:"CACHE_MAX_AGE_DAYS"`
		// MaxJobs is the number of conversions that may run at the same time.
		MaxJobs int `yaml:"max_jobs" env:"MAX_JOBS"`
		// FFmpeg and FFprobe are the binaries to use.
		FFmpeg  string `yaml:"ffmpeg" env:"FFMPEG"`
		FFprobe string `yaml:"ffprobe" env:"FFPROBE"`
		// LiveTranscode enables the live TV quality choice: tvhgo takes tvheadend's raw stream and transcodes it with
		// ffmpeg to the chosen height. Default: on if ffmpeg is found. Costs CPU per viewer.
		LiveTranscode *bool `yaml:"live_transcode" env:"LIVE_TRANSCODE"`
		// LiveQualities are the selectable output heights, best first.
		LiveQualities []int `yaml:"live_qualities" env:"LIVE_QUALITIES"`
		// LiveMaxStreams limits concurrent live transcodes.
		LiveMaxStreams int `yaml:"live_max_streams" env:"LIVE_MAX_STREAMS"`
		// TMDBAPIKey (v3 key from themoviedb.org) enables programme artwork from TMDb as a fallback for recordings
		// without a frame. Programme titles are sent to TMDb to look them up. Empty disables it.
		TMDBAPIKey string `yaml:"tmdb_api_key" env:"TMDB_API_KEY"`
		// TMDBLanguage is the language for TMDb lookups (default en-GB).
		TMDBLanguage string `yaml:"tmdb_language" env:"TMDB_LANGUAGE"`
		// Preset and CRF are the x264 speed preset and quality (lower CRF = better/larger). SD uses CRF-2.
		// PipelineStatus is the status.json written by the tvh-pipeline container (what it is converting and how far).
		// Optional: without it tvhgo just shows its own on-demand conversions.
		PipelineStatus string `yaml:"pipeline_status" env:"PIPELINE_STATUS"`

		Preset string `yaml:"preset" env:"PRESET"`
		CRF    int    `yaml:"crf" env:"CRF"`
	}
)

func (c *PlaybackConfig) SetDefaults() {
	if c.TvheadendRoot == "" {
		c.TvheadendRoot = defaultPlaybackRoot
	}
	if c.RecordingsDir == "" {
		c.RecordingsDir = c.TvheadendRoot
	}
	if c.CacheDir == "" {
		c.CacheDir = defaultPlaybackCacheDir
	}
	if c.CacheMaxGB == 0 {
		c.CacheMaxGB = defaultPlaybackCacheMaxGB
	}
	if c.CacheMaxAgeDays == 0 {
		c.CacheMaxAgeDays = defaultPlaybackCacheDays
	}
	if c.MaxJobs < 1 {
		c.MaxJobs = defaultPlaybackMaxJobs
	}
	if c.FFmpeg == "" {
		c.FFmpeg = "ffmpeg"
	}
	if c.FFprobe == "" {
		c.FFprobe = "ffprobe"
	}
	if len(c.LiveQualities) == 0 {
		c.LiveQualities = []int{1080, 720, 480, 360}
	}
	if c.LiveMaxStreams < 1 {
		c.LiveMaxStreams = 3
	}
	if c.TMDBLanguage == "" {
		c.TMDBLanguage = "en-GB"
	}
	if c.Preset == "" {
		c.Preset = defaultPlaybackPreset
	}
	if c.CRF == 0 {
		c.CRF = defaultPlaybackCRF
	}
}

// LiveEnabled reports whether live transcoding is on (explicitly, or automatically when ffmpeg is installed).
func (c *PlaybackConfig) LiveEnabled() bool {
	if c.LiveTranscode != nil {
		return *c.LiveTranscode
	}
	_, err := exec.LookPath(c.FFmpeg)
	return err == nil
}
