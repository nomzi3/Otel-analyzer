package internal

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Exporters holds the shared OTLP exporters, reused across all service providers.
type Exporters struct {
	trace  sdktrace.SpanExporter
	metric sdkmetric.Exporter
	log    sdklog.Exporter
}

// NewExporters creates OTLP HTTP exporters targeting the given base URL (e.g. "http://localhost:4318").
func NewExporters(ctx context.Context, endpoint string) (*Exporters, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse endpoint URL: %w", err)
	}
	hostPort := u.Host
	insecure := u.Scheme == "http"

	traceOpts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(hostPort)}
	if insecure {
		traceOpts = append(traceOpts, otlptracehttp.WithInsecure())
	}
	traceExp, err := otlptracehttp.New(ctx, traceOpts...)
	if err != nil {
		return nil, fmt.Errorf("create trace exporter: %w", err)
	}

	metricOpts := []otlpmetrichttp.Option{otlpmetrichttp.WithEndpoint(hostPort)}
	if insecure {
		metricOpts = append(metricOpts, otlpmetrichttp.WithInsecure())
	}
	metricExp, err := otlpmetrichttp.New(ctx, metricOpts...)
	if err != nil {
		return nil, fmt.Errorf("create metric exporter: %w", err)
	}

	logOpts := []otlploghttp.Option{otlploghttp.WithEndpoint(hostPort)}
	if insecure {
		logOpts = append(logOpts, otlploghttp.WithInsecure())
	}
	logExp, err := otlploghttp.New(ctx, logOpts...)
	if err != nil {
		return nil, fmt.Errorf("create log exporter: %w", err)
	}

	return &Exporters{trace: traceExp, metric: metricExp, log: logExp}, nil
}

// Shutdown closes the underlying OTLP connections. Call this once, after all
// ServiceProviders have been shut down.
func (e *Exporters) Shutdown(ctx context.Context) error {
	var errs []error
	if err := e.trace.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := e.metric.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := e.log.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if len(errs) > 0 {
		return fmt.Errorf("exporter shutdown errors: %v", errs)
	}
	return nil
}

// noopShutdownTraceExporter wraps a SpanExporter and makes Shutdown a no-op so
// that shutting down one TracerProvider does not close the shared exporter.
type noopShutdownTraceExporter struct{ sdktrace.SpanExporter }

func (n noopShutdownTraceExporter) Shutdown(context.Context) error { return nil }

// noopShutdownMetricExporter wraps a metric Exporter with a no-op Shutdown.
type noopShutdownMetricExporter struct{ sdkmetric.Exporter }

func (n noopShutdownMetricExporter) Shutdown(context.Context) error { return nil }

// noopShutdownLogExporter wraps a log Exporter with a no-op Shutdown.
type noopShutdownLogExporter struct{ sdklog.Exporter }

func (n noopShutdownLogExporter) Shutdown(context.Context) error { return nil }

// ServiceProviders bundles SDK providers for a single synthetic service.
type ServiceProviders struct {
	TracerProvider *sdktrace.TracerProvider
	MeterProvider  *sdkmetric.MeterProvider
	LoggerProvider *sdklog.LoggerProvider
}

// NewServiceProviders creates SDK providers for svc using its ResourceAttrs as the OTel resource.
// metricInterval controls how often the PeriodicReader exports metrics.
// The providers use no-op-shutdown wrappers around the shared exporters so that
// shutting down individual providers does not close the shared OTLP connections.
func NewServiceProviders(ctx context.Context, exp *Exporters, svc ServiceDef, metricInterval time.Duration) (*ServiceProviders, error) {
	kvs := make([]attribute.KeyValue, 0, len(svc.ResourceAttrs))
	for k, v := range svc.ResourceAttrs {
		kvs = append(kvs, attribute.String(k, v))
	}
	res := sdkresource.NewWithAttributes("", kvs...)

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(noopShutdownTraceExporter{exp.trace}),
		sdktrace.WithResource(res),
	)
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(
			noopShutdownMetricExporter{exp.metric},
			sdkmetric.WithInterval(metricInterval),
		)),
		sdkmetric.WithResource(res),
	)
	lp := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewBatchProcessor(noopShutdownLogExporter{exp.log})),
		sdklog.WithResource(res),
	)

	return &ServiceProviders{TracerProvider: tp, MeterProvider: mp, LoggerProvider: lp}, nil
}

// Shutdown flushes and shuts down the SDK providers. It does NOT close the
// underlying OTLP exporters — call Exporters.Shutdown() for that.
func (sp *ServiceProviders) Shutdown(ctx context.Context) error {
	var errs []error
	if err := sp.TracerProvider.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := sp.MeterProvider.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := sp.LoggerProvider.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if len(errs) > 0 {
		return fmt.Errorf("shutdown errors: %v", errs)
	}
	return nil
}
