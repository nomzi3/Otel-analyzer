package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/otel-analyzer/backend-api/internal/metrics"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// REDMetrics is a chi middleware that records R.E.D. metrics per route.
func REDMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		method := r.Method
		ctx := r.Context()

		metrics.RequestsInFlight.Add(ctx, 1,
			metric.WithAttributes(attribute.String("method", method), attribute.String("path", r.URL.Path)))

		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)

		path := r.URL.Path
		if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
			path = rc.RoutePattern()
		}
		status := fmt.Sprintf("%d", rw.statusCode)
		duration := time.Since(start).Seconds()

		baseAttrs := metric.WithAttributes(attribute.String("method", method), attribute.String("path", path))
		fullAttrs := metric.WithAttributes(
			attribute.String("method", method),
			attribute.String("path", path),
			attribute.String("status", status),
		)

		metrics.RequestsInFlight.Add(context.Background(), -1, baseAttrs)
		metrics.RequestsTotal.Add(ctx, 1, fullAttrs)
		metrics.RequestDuration.Record(ctx, duration, fullAttrs)
	})
}
