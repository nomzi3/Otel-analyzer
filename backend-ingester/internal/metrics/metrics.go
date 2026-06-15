package metrics

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

var (
	LogsProcessed       metric.Int64Counter
	RootTracesProcessed metric.Int64Counter
	DatapointsProcessed metric.Int64Counter
	IngestFailures      metric.Int64Counter
)

// Init creates the MeterProvider, initialises all instruments, and returns a
// shutdown function. The caller must call shutdown before exiting.
func Init(ctx context.Context, collectorEndpoint string) (shutdown func(context.Context) error, err error) {
	exp, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithEndpoint(collectorEndpoint),
		otlpmetricgrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceNameKey.String("backend-ingester"),
	)

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exp,
			sdkmetric.WithInterval(5000*time.Millisecond),
		)),
		sdkmetric.WithResource(res),
	)

	meter := mp.Meter("backend-ingester")

	LogsProcessed, err = meter.Int64Counter("ingester.logs.processed",
		metric.WithDescription("Total number of log records processed."))
	if err != nil {
		return mp.Shutdown, err
	}

	RootTracesProcessed, err = meter.Int64Counter("ingester.root_traces.processed",
		metric.WithDescription("Total number of root trace spans processed."))
	if err != nil {
		return mp.Shutdown, err
	}

	DatapointsProcessed, err = meter.Int64Counter("ingester.datapoints.processed",
		metric.WithDescription("Total number of metric data points processed."))
	if err != nil {
		return mp.Shutdown, err
	}

	IngestFailures, err = meter.Int64Counter("ingester.ingest.failures",
		metric.WithDescription("Total number of records dropped after all retries exhausted, by topic."))
	if err != nil {
		return mp.Shutdown, err
	}

	return mp.Shutdown, nil
}
