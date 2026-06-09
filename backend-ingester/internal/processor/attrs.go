package processor

import "go.opentelemetry.io/collector/pdata/pcommon"

// attrsToMap converts a pcommon.Map into a map[string]string.
// Pre-allocated to attrs.Len() to avoid incremental re-allocation on the hot path.
func attrsToMap(attrs pcommon.Map) map[string]string {
	m := make(map[string]string, attrs.Len())
	attrs.Range(func(k string, v pcommon.Value) bool {
		m[k] = v.AsString()
		return true
	})
	return m
}
