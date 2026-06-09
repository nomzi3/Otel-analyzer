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

	"github.com/otel-analyzer/backend-gateway/internal/producer"
	"github.com/otel-analyzer/backend-gateway/internal/receiver"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	metricsPort := envOr("METRICS_PORT", "9090")

	prod, err := producer.NewProducer(brokers)
	if err != nil {
		log.Fatalf("failed to create producer: %v", err)
	}
	defer prod.Close()

	// HTTP OTLP receiver
	httpRecv := receiver.NewHTTPReceiver(prod, logsTopic, metricsTopic, tracesTopic)
	go func() {
		if err := httpRecv.Start(httpPort); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP receiver error: %v", err)
		}
	}()

	// gRPC OTLP receiver
	grpcSrv := receiver.NewGRPCServer(prod, logsTopic, metricsTopic, tracesTopic)
	go func() {
		if err := grpcSrv.Start(grpcPort); err != nil {
			log.Fatalf("gRPC receiver error: %v", err)
		}
	}()

	// Prometheus metrics server
	go func() {
		mux := http.NewServeMux()
		mux.Handle("/metrics", promhttp.Handler())
		addr := ":" + metricsPort
		log.Printf("Prometheus metrics server listening on %s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil && err != http.ErrServerClosed {
			log.Fatalf("metrics server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	sig := <-quit
	log.Printf("received signal %s, shutting down", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := prod.Flush(ctx); err != nil {
		log.Printf("flush producer: %v", err)
	}
}
