package internal

import (
	"context"
	"math/rand"

	otelmetric "go.opentelemetry.io/otel/metric"
)

// SetupMetrics registers observable gauge metrics for the given service.
// Call once per service — callbacks are invoked by the SDK on each collection cycle.
func SetupMetrics(_ context.Context, svc ServiceDef, meter otelmetric.Meter) error {
	if svc.IsK8s {
		return setupK8sMetrics(svc, meter)
	}
	return setupVMMetrics(svc, meter)
}

type metricDef struct {
	name string
	min  float64
	max  float64
}

func setupK8sMetrics(svc ServiceDef, meter otelmetric.Meter) error {
	k8sMetrics := []metricDef{
		{"k8s.pod.cpu.usage", 0.0, 4.0},
		{"k8s.pod.memory.usage", 0, 1024 * 1024 * 512},
		{"k8s.pod.network.rx_bytes", 0, 1024 * 1024 * 100},
		{"k8s.pod.network.tx_bytes", 0, 1024 * 1024 * 100},
		{"k8s.node.cpu.usage", 0.0, 64.0},
		{"k8s.node.memory.usage", 0, 1024 * 1024 * 1024 * 32},
		{"k8s.container.cpu.limit", 0.5, 8.0},
		{"k8s.container.memory.limit", 1024 * 1024 * 128, 1024 * 1024 * 1024 * 4},
		{"k8s.deployment.replicas", 1, 20},
		{"k8s.hpa.current_replicas", 1, 20},
		{"k8s.pod.restart_count", 0, 10},
		{"k8s.namespace.pod_count", 1, 100},
		{"k8s.ingress.request_count", 0, 10000},
		{"k8s.service.endpoint_count", 1, 10},
		{"k8s.pvc.capacity", 1024 * 1024 * 1024, 1024 * 1024 * 1024 * 100},
		{"k8s.pvc.used", 0, 1024 * 1024 * 1024 * 50},
		{"k8s.job.completion_time", 0, 3600},
		{"k8s.cronjob.last_schedule", 0, 86400},
		{"k8s.daemonset.desired", 1, 10},
		{"k8s.statefulset.replicas", 1, 5},
	}

	for _, m := range k8sMetrics {
		m := m // capture loop var
		_, err := meter.Float64ObservableGauge(m.name,
			otelmetric.WithFloat64Callback(func(_ context.Context, o otelmetric.Float64Observer) error {
				o.Observe(m.min + rand.Float64()*(m.max-m.min))
				return nil
			}),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func setupVMMetrics(svc ServiceDef, meter otelmetric.Meter) error {
	vmMetrics := []metricDef{
		{"system.cpu.utilization", 0.0, 1.0},
		{"system.memory.utilization", 0.0, 1.0},
		{"system.disk.io.read", 0, 1024 * 1024 * 500},
		{"system.disk.io.write", 0, 1024 * 1024 * 200},
		{"system.network.connections", 0, 10000},
		{"process.cpu.time", 0, 3600},
		{"process.memory.physical_usage", 1024 * 1024 * 10, 1024 * 1024 * 1024 * 8},
		{"process.open_file_descriptors", 0, 1024},
		{"system.filesystem.utilization", 0.0, 1.0},
		{"system.load_average.1m", 0.0, 32.0},
	}

	for _, m := range vmMetrics {
		m := m // capture loop var
		_, err := meter.Float64ObservableGauge(m.name,
			otelmetric.WithFloat64Callback(func(_ context.Context, o otelmetric.Float64Observer) error {
				o.Observe(m.min + rand.Float64()*(m.max-m.min))
				return nil
			}),
		)
		if err != nil {
			return err
		}
	}
	return nil
}
