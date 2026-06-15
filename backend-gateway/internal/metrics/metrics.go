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
	LogsCounter       metric.Int64Counter
	SpansCounter      metric.Int64Counter
	DatapointsCounter metric.Int64Counter
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
		semconv.ServiceNameKey.String("backend-gateway"),
	)

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exp,
			sdkmetric.WithInterval(5000*time.Millisecond),
		)),
		sdkmetric.WithResource(res),
	)

	meter := mp.Meter("backend-gateway")

	LogsCounter, err = meter.Int64Counter("gateway.logs.received",
		metric.WithDescription("Total number of log records received, by service name."))
	if err != nil {
		return mp.Shutdown, err
	}

	SpansCounter, err = meter.Int64Counter("gateway.spans.received",
		metric.WithDescription("Total number of spans received, by service name."))
	if err != nil {
		return mp.Shutdown, err
	}

	DatapointsCounter, err = meter.Int64Counter("gateway.datapoints.received",
		metric.WithDescription("Total number of metric data points received, by service name."))
	if err != nil {
		return mp.Shutdown, err
	}

	return mp.Shutdown, nil
}
