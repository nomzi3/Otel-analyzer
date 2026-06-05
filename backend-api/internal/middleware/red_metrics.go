package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/otel-analyzer/backend-api/internal/metrics"
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

		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Resolve the route pattern after routing is complete.
		// We need to call next first, so we defer the metric recording.
		method := r.Method

		metrics.RequestsInFlight.WithLabelValues(method, r.URL.Path).Inc()
		defer func() {
			// At this point routing has happened, so RouteContext is populated.
			path := r.URL.Path
			if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
				path = rc.RoutePattern()
			}
			status := fmt.Sprintf("%d", rw.statusCode)
			duration := time.Since(start).Seconds()

			metrics.RequestsInFlight.WithLabelValues(method, path).Dec()
			metrics.RequestsTotal.WithLabelValues(method, path, status).Inc()
			metrics.RequestDuration.WithLabelValues(method, path, status).Observe(duration)
		}()

		next.ServeHTTP(rw, r)
	})
}
