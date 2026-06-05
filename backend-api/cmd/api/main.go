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
	metricsPort := getEnv("METRICS_PORT", "9091")

	conn, err := db.NewConn(dsn)
	if err != nil {
		log.Fatalf("clickhouse connect: %v", err)
	}
	defer conn.Close()

	// --- API router ---
	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.REDMetrics)

	r.Get("/health", handler.Health)

	r.Route("/v1/logs", func(r chi.Router) {
		r.Post("/", handler.PostLogs(conn))
		r.Get("/", handler.GetLogs(conn))
		r.Delete("/", handler.DeleteLogs(conn))
	})

	r.Route("/v1/metrics", func(r chi.Router) {
		r.Post("/", handler.PostMetrics(conn))
		r.Get("/", handler.GetMetrics(conn))
		r.Delete("/", handler.DeleteMetrics(conn))
	})

	r.Route("/v1/traces", func(r chi.Router) {
		r.Post("/", handler.PostTraces(conn))
		r.Get("/", handler.GetTraces(conn))
		r.Delete("/", handler.DeleteTraces(conn))
		r.Get("/{traceID}/spans", handler.GetTraceSpans(conn))
	})

	apiSrv := &http.Server{
		Addr:    ":" + httpPort,
		Handler: r,
	}

	// --- Metrics router ---
	mux := http.NewServeMux()
	mux.Handle("/metrics", metrics.Handler())
	metricsSrv := &http.Server{
		Addr:    ":" + metricsPort,
		Handler: mux,
	}

	// Start both servers in goroutines.
	go func() {
		log.Printf("API server listening on :%s", httpPort)
		if err := apiSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	go func() {
		log.Printf("Metrics server listening on :%s", metricsPort)
		if err := metricsSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Metrics server error: %v", err)
		}
	}()

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := apiSrv.Shutdown(ctx); err != nil {
		log.Printf("API server shutdown error: %v", err)
	}
	if err := metricsSrv.Shutdown(ctx); err != nil {
		log.Printf("Metrics server shutdown error: %v", err)
	}
	log.Println("Shutdown complete.")
}
