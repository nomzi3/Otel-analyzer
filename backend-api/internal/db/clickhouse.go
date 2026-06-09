package db

import (
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// NewConn opens a ClickHouse connection from a DSN string.
func NewConn(dsn string) (driver.Conn, error) {
	opts, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}
	opts.Settings = clickhouse.Settings{
		"async_insert":           1,
		"wait_for_async_insert":  0,
	}
	opts.MaxOpenConns = 100
	opts.MaxIdleConns = 30
	opts.ConnMaxLifetime = 10 * time.Minute

	return clickhouse.Open(opts)
}
