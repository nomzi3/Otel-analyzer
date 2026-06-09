package processor

import (
	"regexp"
	"strings"

	"go.opentelemetry.io/collector/pdata/plog"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

var (
	reUUID   = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	reIPv4   = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	reHex    = regexp.MustCompile(`\b(?:0x[0-9a-fA-F]{6,}|[0-9a-fA-F]{8,})\b`)
	reNum    = regexp.MustCompile(`\b\d+(?:\.\d+)?[a-zA-Z]*\b`)
	reSpaces = regexp.MustCompile(`\s+`)
)

func extractPattern(body string) string {
	s := reUUID.ReplaceAllString(body, "{uuid}")
	s = reIPv4.ReplaceAllString(s, "{ip}")
	s = reHex.ReplaceAllString(s, "{hex}")
	s = reNum.ReplaceAllString(s, "{num}")
	s = reSpaces.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func ProcessLogs(ld plog.Logs) []types.LogRow {
	rows := make([]types.LogRow, 0, ld.ResourceLogs().Len()*10)

	for i := 0; i < ld.ResourceLogs().Len(); i++ {
		rl := ld.ResourceLogs().At(i)
		resAttrs := attrsToMap(rl.Resource().Attributes())

		for j := 0; j < rl.ScopeLogs().Len(); j++ {
			sl := rl.ScopeLogs().At(j)
			scopeAttrs := attrsToMap(sl.Scope().Attributes())

			for k := 0; k < sl.LogRecords().Len(); k++ {
				rec := sl.LogRecords().At(k)
				logAttrs := attrsToMap(rec.Attributes())

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

