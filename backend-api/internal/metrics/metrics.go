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
	RequestsTotal    metric.Int64Counter
	RequestDuration  metric.Float64Histogram
	RequestsInFlight metric.Int64UpDownCounter
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
		semconv.ServiceNameKey.String("backend-api"),
	)

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exp,
			sdkmetric.WithInterval(5000*time.Millisecond),
		)),
		sdkmetric.WithResource(res),
	)

	meter := mp.Meter("backend-api")

	RequestsTotal, err = meter.Int64Counter("http.requests",
		metric.WithDescription("Total number of HTTP requests."))
	if err != nil {
		return mp.Shutdown, err
	}

	RequestDuration, err = meter.Float64Histogram("http.request.duration",
		metric.WithDescription("HTTP request duration in seconds."),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(.005, .01, .025, .05, .1, .25, .5, 1, 2.5),
	)
	if err != nil {
		return mp.Shutdown, err
	}

	RequestsInFlight, err = meter.Int64UpDownCounter("http.requests.in_flight",
		metric.WithDescription("Number of HTTP requests currently in flight."))
	if err != nil {
		return mp.Shutdown, err
	}

	return mp.Shutdown, nil
}
