package processor

import (
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/pmetric"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

func resAttrsToMap(attrs pcommon.Map) map[string]string {
	m := make(map[string]string)
	attrs.Range(func(k string, v pcommon.Value) bool {
		m[k] = v.AsString()
		return true
	})
	return m
}

func ProcessMetrics(md pmetric.Metrics) []types.MetricRow {
	var rows []types.MetricRow

	for i := 0; i < md.ResourceMetrics().Len(); i++ {
		rm := md.ResourceMetrics().At(i)
		resAttrs := resAttrsToMap(rm.Resource().Attributes())
		serviceName := resAttrs["service.name"]

		for j := 0; j < rm.ScopeMetrics().Len(); j++ {
			sm := rm.ScopeMetrics().At(j)

			for k := 0; k < sm.Metrics().Len(); k++ {
				m := sm.Metrics().At(k)
				name := m.Name()

				switch m.Type() {
				case pmetric.MetricTypeGauge:
					dps := m.Gauge().DataPoints()
					for d := 0; d < dps.Len(); d++ {
						dp := dps.At(d)
						attrs := resAttrsToMap(dp.Attributes())
						var val float64
						if dp.ValueType() == pmetric.NumberDataPointValueTypeDouble {
							val = dp.DoubleValue()
						} else {
							val = float64(dp.IntValue())
						}
						rows = append(rows, types.MetricRow{
							Timestamp:          dp.Timestamp().AsTime(),
							MetricName:         name,
							MetricType:         "gauge",
							Value:              val,
							ServiceName:        serviceName,
							ResourceAttributes: resAttrs,
							MetricAttributes:   attrs,
						})
					}

				case pmetric.MetricTypeSum:
					dps := m.Sum().DataPoints()
					for d := 0; d < dps.Len(); d++ {
						dp := dps.At(d)
						attrs := resAttrsToMap(dp.Attributes())
						var val float64
						if dp.ValueType() == pmetric.NumberDataPointValueTypeDouble {
							val = dp.DoubleValue()
						} else {
							val = float64(dp.IntValue())
						}
						rows = append(rows, types.MetricRow{
							Timestamp:          dp.Timestamp().AsTime(),
							MetricName:         name,
							MetricType:         "sum",
							Value:              val,
							ServiceName:        serviceName,
							ResourceAttributes: resAttrs,
							MetricAttributes:   attrs,
						})
					}

				case pmetric.MetricTypeHistogram:
					dps := m.Histogram().DataPoints()
					for d := 0; d < dps.Len(); d++ {
						dp := dps.At(d)
						attrs := resAttrsToMap(dp.Attributes())
						rows = append(rows, types.MetricRow{
							Timestamp:          dp.Timestamp().AsTime(),
							MetricName:         name,
							MetricType:         "histogram",
							Value:              dp.Sum(),
							ServiceName:        serviceName,
							ResourceAttributes: resAttrs,
							MetricAttributes:   attrs,
						})
					}

				case pmetric.MetricTypeExponentialHistogram:
					dps := m.ExponentialHistogram().DataPoints()
					for d := 0; d < dps.Len(); d++ {
						dp := dps.At(d)
						attrs := resAttrsToMap(dp.Attributes())
						rows = append(rows, types.MetricRow{
							Timestamp:          dp.Timestamp().AsTime(),
							MetricName:         name,
							MetricType:         "exponential_histogram",
							Value:              dp.Sum(),
							ServiceName:        serviceName,
							ResourceAttributes: resAttrs,
							MetricAttributes:   attrs,
						})
					}

				case pmetric.MetricTypeSummary:
					dps := m.Summary().DataPoints()
					for d := 0; d < dps.Len(); d++ {
						dp := dps.At(d)
						attrs := resAttrsToMap(dp.Attributes())
						rows = append(rows, types.MetricRow{
							Timestamp:          dp.Timestamp().AsTime(),
							MetricName:         name,
							MetricType:         "summary",
							Value:              dp.Sum(),
							ServiceName:        serviceName,
							ResourceAttributes: resAttrs,
							MetricAttributes:   attrs,
						})
					}
				}
			}
		}
	}
	return rows
}
