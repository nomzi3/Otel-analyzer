package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/otel-analyzer/backend-ingester/internal/apiclient"
	"github.com/otel-analyzer/backend-ingester/internal/consumer"
	"github.com/otel-analyzer/backend-ingester/internal/metrics"
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
	collectorEndpoint := envOr("OTEL_COLLECTOR_ENDPOINT", "localhost:4317")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	shutdownMetrics, err := metrics.Init(ctx, collectorEndpoint)
	if err != nil {
		log.Fatalf("failed to initialise metrics: %v", err)
	}
	defer func() {
		if err := shutdownMetrics(context.Background()); err != nil {
			log.Printf("metrics shutdown error: %v", err)
		}
	}()

	apiClient := apiclient.NewClient(apiBaseURL)
	proc := consumer.NewProcessor(apiClient, logsTopic, metricsTopic, tracesTopic)

	topics := []string{logsTopic, metricsTopic, tracesTopic}
	c, err := consumer.NewConsumer(brokers, "otel-ingester", topics, proc)
	if err != nil {
		log.Fatalf("create consumer: %v", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		log.Printf("starting consumer on brokers %v", brokers)
		if err := c.Run(ctx); err != nil {
			log.Printf("consumer stopped: %v", err)
		}
	}()

	<-sigCh
	log.Println("shutting down...")
	cancel()
	c.Close()
}
