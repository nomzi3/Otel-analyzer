package processor

import (
	"time"

	"go.opentelemetry.io/collector/pdata/ptrace"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

func ProcessTraces(td ptrace.Traces) (roots []types.TraceRootRow, spans []types.SpanRow) {
	for i := 0; i < td.ResourceSpans().Len(); i++ {
		rs := td.ResourceSpans().At(i)
		resAttrs := attrsToMap(rs.Resource().Attributes())
		serviceName := resAttrs["service.name"]

		for j := 0; j < rs.ScopeSpans().Len(); j++ {
			ss := rs.ScopeSpans().At(j)

			for k := 0; k < ss.Spans().Len(); k++ {
				span := ss.Spans().At(k)
				spanAttrs := attrsToMap(span.Attributes())

				startTime := span.StartTimestamp().AsTime()
				endTime := span.EndTimestamp().AsTime()
				durationMs := float64(endTime.Sub(startTime)) / float64(time.Millisecond)

				traceID := span.TraceID().String()
				spanID := span.SpanID().String()
				parentSpanID := span.ParentSpanID().String()

				spanRow := types.SpanRow{
					TraceID:            traceID,
					SpanID:             spanID,
					ParentSpanID:       parentSpanID,
					ServiceName:        serviceName,
					Name:               span.Name(),
					StartTime:          startTime,
					EndTime:            endTime,
					DurationMs:         durationMs,
					StatusCode:         uint8(span.Status().Code()),
					ResourceAttributes: resAttrs,
					SpanAttributes:     spanAttrs,
				}
				spans = append(spans, spanRow)

				if span.ParentSpanID().IsEmpty() {
					root := types.TraceRootRow{
						TraceID:            traceID,
						RootSpanID:         spanID,
						ServiceName:        serviceName,
						RootName:           span.Name(),
						StartTime:          startTime,
						EndTime:            endTime,
						DurationMs:         durationMs,
						StatusCode:         uint8(span.Status().Code()),
						ResourceAttributes: resAttrs,
						SpanAttributes:     spanAttrs,
					}
					roots = append(roots, root)
				}
			}
		}
	}
	return roots, spans
}
