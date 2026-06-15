package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/otel-analyzer/backend-gateway/internal/metrics"
	"github.com/otel-analyzer/backend-gateway/internal/producer"
	"github.com/otel-analyzer/backend-gateway/internal/receiver"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	brokers := strings.Split(envOr("REDPANDA_BROKERS", "localhost:9092"), ",")
	logsTopic := envOr("KAFKA_TOPIC_LOGS", "otel-logs")
	metricsTopic := envOr("KAFKA_TOPIC_METRICS", "otel-metrics")
	tracesTopic := envOr("KAFKA_TOPIC_TRACES", "otel-traces")
	httpPort := envOr("HTTP_PORT", "4318")
	grpcPort := envOr("GRPC_PORT", "4317")
	collectorEndpoint := envOr("OTEL_COLLECTOR_ENDPOINT", "localhost:4317")

	ctx := context.Background()

	shutdownMetrics, err := metrics.Init(ctx, collectorEndpoint)
	if err != nil {
		log.Fatalf("failed to initialise metrics: %v", err)
	}
	defer func() {
		if err := shutdownMetrics(ctx); err != nil {
			log.Printf("metrics shutdown error: %v", err)
		}
	}()

	prod, err := producer.NewProducer(brokers)
	if err != nil {
		log.Fatalf("failed to create producer: %v", err)
	}
	defer prod.Close()

	httpRecv := receiver.NewHTTPReceiver(prod, logsTopic, metricsTopic, tracesTopic)
	go func() {
		if err := httpRecv.Start(httpPort); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP receiver error: %v", err)
		}
	}()

	grpcSrv := receiver.NewGRPCServer(prod, logsTopic, metricsTopic, tracesTopic)
	go func() {
		if err := grpcSrv.Start(grpcPort); err != nil {
			log.Fatalf("gRPC receiver error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	sig := <-quit
	log.Printf("received signal %s, shutting down", sig)
}
