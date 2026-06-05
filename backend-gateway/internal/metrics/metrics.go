package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	LogsCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gateway_logs_received_total",
			Help: "Total number of log records received, by service name.",
		},
		[]string{"service_name"},
	)

	SpansCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gateway_spans_received_total",
			Help: "Total number of spans received, by service name.",
		},
		[]string{"service_name"},
	)

	DatapointsCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gateway_datapoints_received_total",
			Help: "Total number of metric data points received, by service name.",
		},
		[]string{"service_name"},
	)
)

func init() {
	prometheus.MustRegister(LogsCounter, SpansCounter, DatapointsCounter)
}
