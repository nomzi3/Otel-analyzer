package processor

import (
	"regexp"
	"strings"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

// rePattern combines all token-replacement regexes into a single pass.
// Order matters: UUID before hex (UUID contains hex runs), IPv4 before num.
var rePattern = regexp.MustCompile(
	`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}` +
		`|\b(?:0x[0-9a-fA-F]{6,}|[0-9a-fA-F]{8,})\b` +
		`|\b(?:\d{1,3}\.){3}\d{1,3}\b` +
		`|\b\d+(?:\.\d+)?[a-zA-Z]*\b` +
		`|\s+`,
)

func extractPattern(body string) string {
	result := rePattern.ReplaceAllStringFunc(body, func(m string) string {
		switch {
		case len(m) == 36 && m[8] == '-':
			return "{uuid}"
		case len(m) >= 2 && m[0] == '0' && (m[1] == 'x' || m[1] == 'X'):
			return "{hex}"
		case len(m) >= 8 && !strings.ContainsAny(m, "-"):
			// distinguish IPv4 from plain hex run: IPv4 has dots
			if strings.Count(m, ".") == 3 {
				return "{ip}"
			}
			return "{hex}"
		case strings.TrimSpace(m) == "":
			return " "
		default:
			return "{num}"
		}
	})
	return strings.TrimSpace(result)
}

func mapFromAttrs(attrs pcommon.Map) map[string]string {
	m := make(map[string]string)
	attrs.Range(func(k string, v pcommon.Value) bool {
		m[k] = v.AsString()
		return true
	})
	return m
}

func ProcessLogs(ld plog.Logs) []types.LogRow {
	total := 0
	for i := 0; i < ld.ResourceLogs().Len(); i++ {
		rl := ld.ResourceLogs().At(i)
		for j := 0; j < rl.ScopeLogs().Len(); j++ {
			total += rl.ScopeLogs().At(j).LogRecords().Len()
		}
	}
	rows := make([]types.LogRow, 0, total)

	for i := 0; i < ld.ResourceLogs().Len(); i++ {
		rl := ld.ResourceLogs().At(i)
		resAttrs := mapFromAttrs(rl.Resource().Attributes())

		for j := 0; j < rl.ScopeLogs().Len(); j++ {
			sl := rl.ScopeLogs().At(j)
			scopeAttrs := mapFromAttrs(sl.Scope().Attributes())

			for k := 0; k < sl.LogRecords().Len(); k++ {
				rec := sl.LogRecords().At(k)
				logAttrs := mapFromAttrs(rec.Attributes())

				body := rec.Body().AsString()
				row := types.LogRow{
					Timestamp:          rec.Timestamp().AsTime(),
					ObservedTimestamp:  rec.ObservedTimestamp().AsTime(),
					TraceID:            rec.TraceID().String(),
					SpanID:             rec.SpanID().String(),
					SeverityNumber:     uint8(rec.SeverityNumber()),
					SeverityText:       rec.SeverityText(),
					Body:               body,
					LogPattern:         extractPattern(body),
					ResourceAttributes: resAttrs,
					ScopeAttributes:    scopeAttrs,
					LogAttributes:      logAttrs,
				}
				rows = append(rows, row)
			}
		}
	}
	return rows
}

