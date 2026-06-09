package receiver

import (
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/pmetric"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
)

// serviceNameFromResource extracts the "service.name" attribute value, or returns "unknown".
func serviceNameFromResource(attrs pcommon.Map) string {
	if v, ok := attrs.Get("service.name"); ok {
		return v.AsString()
	}
	return "unknown"
}

// countDataPoints returns the total number of data points for a metric regardless of type.
func countDataPoints(m pmetric.Metric) int {
	switch m.Type() {
	case pmetric.MetricTypeGauge:
		return m.Gauge().DataPoints().Len()
	case pmetric.MetricTypeSum:
		return m.Sum().DataPoints().Len()
	case pmetric.MetricTypeHistogram:
		return m.Histogram().DataPoints().Len()
	case pmetric.MetricTypeExponentialHistogram:
		return m.ExponentialHistogram().DataPoints().Len()
	case pmetric.MetricTypeSummary:
		return m.Summary().DataPoints().Len()
	default:
		return 0
	}
}

// serviceNameFromAttrs finds "service.name" in a proto attribute list.
func serviceNameFromAttrs(attrs []*commonpb.KeyValue) string {
	for _, kv := range attrs {
		if kv.Key == "service.name" {
			if sv, ok := kv.Value.GetValue().(*commonpb.AnyValue_StringValue); ok {
				return sv.StringValue
			}
		}
	}
	return "unknown"
}

// countDataPointsProto returns the number of data points in a proto Metric.
func countDataPointsProto(m *metricspb.Metric) int {
	if m == nil {
		return 0
	}
	switch d := m.Data.(type) {
	case *metricspb.Metric_Gauge:
		return len(d.Gauge.DataPoints)
	case *metricspb.Metric_Sum:
		return len(d.Sum.DataPoints)
	case *metricspb.Metric_Histogram:
		return len(d.Histogram.DataPoints)
	case *metricspb.Metric_ExponentialHistogram:
		return len(d.ExponentialHistogram.DataPoints)
	case *metricspb.Metric_Summary:
		return len(d.Summary.DataPoints)
	default:
		return 0
	}
}
