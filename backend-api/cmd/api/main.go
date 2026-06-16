package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/otel-analyzer/backend-api/internal/db"
	"github.com/otel-analyzer/backend-api/internal/handler"
	"github.com/otel-analyzer/backend-api/internal/metrics"
	"github.com/otel-analyzer/backend-api/internal/middleware"
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	dsn := getEnv("CLICKHOUSE_DSN", "clickhouse://localhost:9000/default")
	httpPort := getEnv("HTTP_PORT", "8080")
	collectorEndpoint := getEnv("OTEL_COLLECTOR_ENDPOINT", "localhost:4317")
	prometheusURL := getEnv("PROMETHEUS_URL", "http://localhost:9090")

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

	conn, err := db.NewConn(dsn)
	if err != nil {
		log.Fatalf("clickhouse connect: %v", err)
	}
	defer conn.Close()

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.REDMetrics)

	r.Get("/health", handler.Health)
	r.Get("/v1/throughput", handler.GetThroughput(prometheusURL))
	r.Get("/v1/stats", handler.GetStats(conn, prometheusURL))
	r.Get("/v1/services", handler.GetServices(conn))
	r.Get("/v1/resource-attributes", handler.GetResourceAttributeKeys(conn))
	r.Get("/v1/resource-attributes/values", handler.GetResourceAttributeValues(conn))

	r.Route("/v1/logs", func(r chi.Router) {
		r.Post("/", handler.PostLogs(conn))
		r.Get("/", handler.GetLogs(conn))
		r.Delete("/", handler.DeleteLogs(conn))
		r.Get("/patterns", handler.GetLogPatterns(conn))
		r.Get("/severities", handler.GetLogSeverities(conn))
		r.Get("/log-services", handler.GetLogServices(conn))
	})

	r.Route("/v1/metrics", func(r chi.Router) {
		r.Post("/", handler.PostMetrics(conn))
		r.Get("/", handler.GetMetrics(conn))
		r.Delete("/", handler.DeleteMetrics(conn))
		r.Get("/names", handler.GetMetricNames(conn))
		r.Get("/services-summary", handler.GetMetricsServicesSummary(conn))
	})

	r.Route("/v1/traces", func(r chi.Router) {
		r.Post("/", handler.PostTraces(conn))
		r.Get("/", handler.GetTraces(conn))
		r.Delete("/", handler.DeleteTraces(conn))
		r.Get("/methods", handler.GetTraceMethods(conn))
		r.Get("/{traceID}/spans", handler.GetTraceSpans(conn))
	})

	apiSrv := &http.Server{
		Addr:    ":" + httpPort,
		Handler: r,
	}

	go func() {
		log.Printf("API server listening on :%s", httpPort)
		if err := apiSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit
	log.Println("Shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := apiSrv.Shutdown(shutdownCtx); err != nil {
		log.Printf("API server shutdown error: %v", err)
	}
	log.Println("Shutdown complete.")
}
