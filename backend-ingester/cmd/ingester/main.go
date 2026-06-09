package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/otel-analyzer/backend-ingester/internal/consumer"
	_ "github.com/otel-analyzer/backend-ingester/internal/metrics" // register metrics
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	brokers := strings.Split(envOr("REDPANDA_BROKERS", "localhost:9092"), ",")
	clickhouseDSN := envOr("CLICKHOUSE_DSN", "clickhouse://localhost:9000/default")
	logsTopic := envOr("KAFKA_TOPIC_LOGS", "otel-logs")
	metricsTopic := envOr("KAFKA_TOPIC_METRICS", "otel-metrics")
	tracesTopic := envOr("KAFKA_TOPIC_TRACES", "otel-traces")
	metricsPort := envOr("METRICS_PORT", "9093")

	opts, err := clickhouse.ParseDSN(clickhouseDSN)
	if err != nil {
		log.Fatalf("parse clickhouse DSN: %v", err)
	}
	opts.Settings = clickhouse.Settings{
		"async_insert":          1,
		"wait_for_async_insert": 0,
	}
	opts.MaxOpenConns = 50
	opts.MaxIdleConns = 20
	opts.ConnMaxLifetime = 10 * time.Minute

	conn, err := clickhouse.Open(opts)
	if err != nil {
		log.Fatalf("open clickhouse: %v", err)
	}
	defer conn.Close()

	proc := consumer.NewProcessor(conn, logsTopic, metricsTopic, tracesTopic)

	topics := []string{logsTopic, metricsTopic, tracesTopic}
	c, err := consumer.NewConsumer(brokers, "otel-ingester", topics, proc)
	if err != nil {
		log.Fatalf("create consumer: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		log.Printf("starting consumer on brokers %v", brokers)
		if err := c.Run(ctx); err != nil {
			log.Printf("consumer stopped: %v", err)
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{
		Addr:    ":" + metricsPort,
		Handler: mux,
	}
	go func() {
		log.Printf("metrics server listening on :%s", metricsPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("metrics server error: %v", err)
		}
	}()

	<-sigCh
	log.Println("shutting down...")
	cancel()
	c.Close()

	flushCtx, flushCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer flushCancel()
	proc.Stop(flushCtx)

	srv.Close()
}
