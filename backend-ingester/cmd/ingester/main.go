package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/otel-analyzer/backend-ingester/internal/apiclient"
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
	apiBaseURL := envOr("API_BASE_URL", "http://localhost:8080")
	logsTopic := envOr("KAFKA_TOPIC_LOGS", "otel-logs")
	metricsTopic := envOr("KAFKA_TOPIC_METRICS", "otel-metrics")
	tracesTopic := envOr("KAFKA_TOPIC_TRACES", "otel-traces")
	metricsPort := envOr("METRICS_PORT", "9093")

	apiClient := apiclient.NewClient(apiBaseURL)
	proc := consumer.NewProcessor(apiClient, logsTopic, metricsTopic, tracesTopic)

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
	srv.Close()
}
