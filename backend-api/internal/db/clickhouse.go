package db

import (
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
	opts.MaxOpenConns = 10
	opts.MaxIdleConns = 5

	return clickhouse.Open(opts)
}
