package config

import (
	"errors"
	"net"
	"net/url"
	"strconv"
)

const (
	defaultTvheadendScheme = "http"
	defaultTvheadendPort   = 9981
)

type (
	TvheadendConfig struct {
		Scheme   string `yaml:"scheme"   env:"SCHEME"`
		Host     string `yaml:"host"     env:"HOST"`
		Port     int    `yaml:"port"     env:"PORT"`
		Username string `yaml:"username" env:"USERNAME"`
		Password string `yaml:"password" env:"PASSWORD,unset"`
		// Optional second account used only to read tuner status and the channel to multiplex map. Tvheadend only
		// gives those to admin accounts, so keep this separate from the main (non-admin) account.
		StatusUsername string `yaml:"status_username" env:"STATUS_USERNAME"`
		StatusPassword string `yaml:"status_password" env:"STATUS_PASSWORD,unset"`
	}
)

func (c *TvheadendConfig) Validate() error {
	if c.Host == "" {
		return errors.New("tvheadend host is not set")
	}

	return nil
}

func (c *TvheadendConfig) SetDefaults() {
	if c.Scheme == "" {
		c.Scheme = defaultTvheadendScheme
	}
	if c.Port == 0 {
		c.Port = defaultTvheadendPort
	}
}

func (c *TvheadendConfig) URL() string {
	tvhUrl := url.URL{
		Scheme: c.Scheme,
		Host: net.JoinHostPort(
			c.Host,
			strconv.Itoa(c.Port),
		),
	}
	return tvhUrl.String()
}
