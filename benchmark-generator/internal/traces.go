package internal

import (
	"context"
	"fmt"
	"math/rand"

	oteltrace "go.opentelemetry.io/otel/trace"
)

// GenerateTraces creates synthetic trace data for the given service.
func GenerateTraces(ctx context.Context, svc ServiceDef, tracer oteltrace.Tracer) error {
	rootSpanNames := []string{
		"HTTP GET /api/v1/resource",
		"process-job",
		"db.query",
		"cache.lookup",
		"external.call",
	}

	childSpanNames := []string{
		"db.select", "cache.get", "http.request", "serialize", "validate",
		"transform", "publish", "consume", "encode", "decrypt",
	}

	numRoots := rand.Intn(5) + 1 // 1-5

	for r := 0; r < numRoots; r++ {
		rootName := rootSpanNames[rand.Intn(len(rootSpanNames))]
		_, rootSpan := tracer.Start(ctx, rootName,
			oteltrace.WithSpanKind(oteltrace.SpanKindServer),
		)
		rootSpan.SetAttributes(
			stringAttr("http.method", "GET"),
			stringAttr("http.url", fmt.Sprintf("/api/v1/%s", svc.Name)),
			stringAttr("http.status_code", "200"),
		)

		rootCtx := oteltrace.ContextWithSpan(ctx, rootSpan)
		numChildren := rand.Intn(11) + 10 // 10-20

		for c := 0; c < numChildren; c++ {
			childName := childSpanNames[rand.Intn(len(childSpanNames))]
			_, childSpan := tracer.Start(rootCtx, childName)
			childSpan.SetAttributes(
				stringAttr("db.system", "postgresql"),
				stringAttr("db.statement", "SELECT * FROM table WHERE id=?"),
			)
			childSpan.End()
		}

		rootSpan.End()
	}

	return nil
}
