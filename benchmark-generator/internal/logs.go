package internal

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	otelog "go.opentelemetry.io/otel/log"
)

// GenerateLogs emits synthetic log records for the given service.
func GenerateLogs(ctx context.Context, svc ServiceDef, logger otelog.Logger) error {
	templates := []string{
		"User %s logged in from %s",
		"Request %s processed in %dms",
		"Database query executed: SELECT * FROM users WHERE id=%s took %dms",
		"Cache miss for key %s, loading from database",
		"Payment %s processed successfully for amount %d",
		"Error connecting to service %s: connection timeout after %dms",
		"Scheduled job %s completed with status %s",
		"File %s uploaded by user %s, size %d bytes",
	}

	severities := []struct {
		text   string
		number otelog.Severity
	}{
		{"INFO", otelog.SeverityInfo},
		{"INFO", otelog.SeverityInfo},
		{"INFO", otelog.SeverityInfo},
		{"INFO", otelog.SeverityInfo},
		{"WARN", otelog.SeverityWarn},
		{"ERROR", otelog.SeverityError},
	}

	statuses := []string{"success", "failed", "partial", "skipped"}

	numLogs := rand.Intn(11) + 10 // 10-20

	for i := 0; i < numLogs; i++ {
		tplIdx := rand.Intn(len(templates))
		sev := severities[i%len(severities)]

		var msg string
		switch tplIdx {
		case 0:
			msg = fmt.Sprintf(templates[0], randomUUID(), randomIP())
		case 1:
			msg = fmt.Sprintf(templates[1], randomUUID(), rand.Intn(500)+1)
		case 2:
			msg = fmt.Sprintf(templates[2], randomUUID(), rand.Intn(300)+1)
		case 3:
			msg = fmt.Sprintf(templates[3], randomCacheKey())
		case 4:
			msg = fmt.Sprintf(templates[4], randomUUID(), rand.Intn(10000)+1)
		case 5:
			msg = fmt.Sprintf(templates[5], svc.Name, rand.Intn(5000)+1000)
		case 6:
			msg = fmt.Sprintf(templates[6], randomUUID(), statuses[rand.Intn(len(statuses))])
		case 7:
			msg = fmt.Sprintf(templates[7], randomFilename(), randomUUID(), rand.Intn(1024*1024*10)+1)
		}

		var rec otelog.Record
		rec.SetTimestamp(time.Now())
		rec.SetObservedTimestamp(time.Now())
		rec.SetSeverityText(sev.text)
		rec.SetSeverity(sev.number)
		rec.SetBody(otelog.StringValue(msg))
		logger.Emit(ctx, rec)
	}

	return nil
}

func randomUUID() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		rand.Uint32(),
		rand.Uint32()&0xffff,
		rand.Uint32()&0xffff,
		rand.Uint32()&0xffff,
		rand.Uint64()&0xffffffffffff,
	)
}

func randomIP() string {
	return fmt.Sprintf("%d.%d.%d.%d",
		rand.Intn(223)+1,
		rand.Intn(256),
		rand.Intn(256),
		rand.Intn(254)+1,
	)
}

func randomCacheKey() string {
	prefixes := []string{"user", "session", "product", "order", "cart"}
	return fmt.Sprintf("%s:%s", prefixes[rand.Intn(len(prefixes))], randomUUID()[:8])
}

func randomFilename() string {
	exts := []string{"pdf", "png", "jpg", "csv", "zip", "tar.gz"}
	return fmt.Sprintf("file_%d.%s", rand.Intn(99999), exts[rand.Intn(len(exts))])
}
