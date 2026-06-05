package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	LogsProcessed = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ingester_logs_processed_total",
		Help: "Total number of log records processed.",
	})

	RootTracesProcessed = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ingester_root_traces_processed_total",
		Help: "Total number of root trace spans processed.",
	})

	DatapointsProcessed = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ingester_datapoints_processed_total",
		Help: "Total number of metric data points processed.",
	})
)

func init() {
	prometheus.MustRegister(LogsProcessed, RootTracesProcessed, DatapointsProcessed)
}
