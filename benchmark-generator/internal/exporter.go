package internal

import (
	"context"
	"fmt"
	"net/url"

	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// SetupExporters creates OTLP HTTP exporters and SDK providers targeting the given endpoint.
// endpoint should be a base URL such as "http://localhost:4318".
func SetupExporters(ctx context.Context, endpoint string) (
	tracerProvider *sdktrace.TracerProvider,
	meterProvider *sdkmetric.MeterProvider,
	loggerProvider *sdklog.LoggerProvider,
	shutdown func(context.Context) error,
	err error,
) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("parse endpoint URL: %w", err)
	}
	hostPort := u.Host
	insecure := u.Scheme == "http"

	// Trace exporter
	traceOpts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(hostPort)}
	if insecure {
		traceOpts = append(traceOpts, otlptracehttp.WithInsecure())
	}
	traceExp, err := otlptracehttp.New(ctx, traceOpts...)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("create trace exporter: %w", err)
	}
	tracerProvider = sdktrace.NewTracerProvider(sdktrace.WithBatcher(traceExp))

	// Metric exporter
	metricOpts := []otlpmetrichttp.Option{otlpmetrichttp.WithEndpoint(hostPort)}
	if insecure {
		metricOpts = append(metricOpts, otlpmetrichttp.WithInsecure())
	}
	metricExp, err := otlpmetrichttp.New(ctx, metricOpts...)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("create metric exporter: %w", err)
	}
	meterProvider = sdkmetric.NewMeterProvider(sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp)))

	// Log exporter
	logOpts := []otlploghttp.Option{otlploghttp.WithEndpoint(hostPort)}
	if insecure {
		logOpts = append(logOpts, otlploghttp.WithInsecure())
	}
	logExp, err := otlploghttp.New(ctx, logOpts...)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("create log exporter: %w", err)
	}
	loggerProvider = sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)))

	shutdown = func(ctx context.Context) error {
		var errs []error
		if err := tracerProvider.Shutdown(ctx); err != nil {
			errs = append(errs, err)
		}
		if err := meterProvider.Shutdown(ctx); err != nil {
			errs = append(errs, err)
		}
		if err := loggerProvider.Shutdown(ctx); err != nil {
			errs = append(errs, err)
		}
		if len(errs) > 0 {
			return fmt.Errorf("shutdown errors: %v", errs)
		}
		return nil
	}

	return tracerProvider, meterProvider, loggerProvider, shutdown, nil
}
