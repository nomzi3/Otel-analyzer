package consumer

import (
	"context"
	"log"
	"runtime"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/otel-analyzer/backend-ingester/internal/batchwriter"
	"github.com/otel-analyzer/backend-ingester/internal/metrics"
	"github.com/otel-analyzer/backend-ingester/internal/processor"
	"github.com/otel-analyzer/backend-ingester/internal/types"

	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

const (
	channelDepth  = 10_000
	batchSize     = 2_000
	batchWait     = 100 * time.Millisecond
)

// workersPerTopic is GOMAXPROCS*4, capped at 32.
func workersPerTopic() int {
	n := runtime.GOMAXPROCS(0) * 4
	if n > 32 {
		return 32
	}
	return n
}

// Processor fans Kafka records out to typed worker pools that write directly
// to ClickHouse, bypassing the HTTP API hop entirely.
type Processor struct {
	conn         driver.Conn
	logsTopic    string
	metricsTopic string
	tracesTopic  string

	logsWriter    *batchwriter.Writer[types.LogRow]
	metricsWriter *batchwriter.Writer[types.MetricRow]
	rootsWriter   *batchwriter.Writer[types.TraceRootRow]
	spansWriter   *batchwriter.Writer[types.SpanRow]
}

func NewProcessor(conn driver.Conn, logsTopic, metricsTopic, tracesTopic string) *Processor {
	p := &Processor{
		conn:         conn,
		logsTopic:    logsTopic,
		metricsTopic: metricsTopic,
		tracesTopic:  tracesTopic,
	}

	p.logsWriter = batchwriter.New(batchSize, batchWait, func(ctx context.Context, rows []types.LogRow) error {
		return insertLogs(ctx, conn, rows)
	})
	p.metricsWriter = batchwriter.New(batchSize, batchWait, func(ctx context.Context, rows []types.MetricRow) error {
		return insertMetrics(ctx, conn, rows)
	})
	p.rootsWriter = batchwriter.New(batchSize, batchWait, func(ctx context.Context, rows []types.TraceRootRow) error {
		return insertTraceRoots(ctx, conn, rows)
	})
	p.spansWriter = batchwriter.New(batchSize, batchWait, func(ctx context.Context, rows []types.SpanRow) error {
		return insertSpans(ctx, conn, rows)
	})
	return p
}

func (p *Processor) Stop(ctx context.Context) {
	p.logsWriter.Stop(ctx)
	p.metricsWriter.Stop(ctx)
	p.rootsWriter.Stop(ctx)
	p.spansWriter.Stop(ctx)
}

func (p *Processor) handleLog(ctx context.Context, r *kgo.Record) {
	var u plog.ProtoUnmarshaler
	ld, err := u.UnmarshalLogs(r.Value)
	if err != nil {
		log.Printf("unmarshal logs error: %v", err)
		return
	}
	rows := processor.ProcessLogs(ld)
	if len(rows) == 0 {
		return
	}
	p.logsWriter.Add(ctx, rows)
	metrics.LogsProcessed.Add(float64(len(rows)))
}

func (p *Processor) handleMetric(ctx context.Context, r *kgo.Record) {
	var u pmetric.ProtoUnmarshaler
	md, err := u.UnmarshalMetrics(r.Value)
	if err != nil {
		log.Printf("unmarshal metrics error: %v", err)
		return
	}
	rows := processor.ProcessMetrics(md)
	if len(rows) == 0 {
		return
	}
	p.metricsWriter.Add(ctx, rows)
	metrics.DatapointsProcessed.Add(float64(len(rows)))
}

func (p *Processor) handleTrace(ctx context.Context, r *kgo.Record) {
	var u ptrace.ProtoUnmarshaler
	td, err := u.UnmarshalTraces(r.Value)
	if err != nil {
		log.Printf("unmarshal traces error: %v", err)
		return
	}
	roots, spans := processor.ProcessTraces(td)
	if len(roots) == 0 && len(spans) == 0 {
		return
	}
	if len(roots) > 0 {
		p.rootsWriter.Add(ctx, roots)
		metrics.RootTracesProcessed.Add(float64(len(roots)))
	}
	if len(spans) > 0 {
		p.spansWriter.Add(ctx, spans)
	}
}

type Consumer struct {
	client    *kgo.Client
	processor *Processor

	logsCh    chan *kgo.Record
	metricsCh chan *kgo.Record
	tracesCh  chan *kgo.Record
}

func NewConsumer(brokers []string, groupID string, topics []string, proc *Processor) (*Consumer, error) {
	cl, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topics...),
		kgo.FetchMaxBytes(50<<20),  // 50 MB per fetch
		kgo.FetchMinBytes(1),
	)
	if err != nil {
		return nil, err
	}
	return &Consumer{
		client:    cl,
		processor: proc,
		logsCh:    make(chan *kgo.Record, channelDepth),
		metricsCh: make(chan *kgo.Record, channelDepth),
		tracesCh:  make(chan *kgo.Record, channelDepth),
	}, nil
}

func (c *Consumer) Run(ctx context.Context) error {
	n := workersPerTopic()
	for i := 0; i < n; i++ {
		go c.logsWorker(ctx)
		go c.metricsWorker(ctx)
		go c.tracesWorker(ctx)
	}
	log.Printf("consumer started with %d workers per topic", n)

	for {
		fetches := c.client.PollFetches(ctx)
		if fetches.IsClientClosed() {
			return nil
		}
		fetches.EachError(func(t string, p int32, err error) {
			log.Printf("fetch error topic=%s partition=%d: %v", t, p, err)
		})
		fetches.EachRecord(func(r *kgo.Record) {
			switch r.Topic {
			case c.processor.logsTopic:
				select {
				case c.logsCh <- r:
				default:
					log.Printf("logs channel full, dropping record")
				}
			case c.processor.metricsTopic:
				select {
				case c.metricsCh <- r:
				default:
					log.Printf("metrics channel full, dropping record")
				}
			case c.processor.tracesTopic:
				select {
				case c.tracesCh <- r:
				default:
					log.Printf("traces channel full, dropping record")
				}
			}
		})
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

func (c *Consumer) logsWorker(ctx context.Context) {
	for {
		select {
		case r := <-c.logsCh:
			c.processor.handleLog(ctx, r)
		case <-ctx.Done():
			return
		}
	}
}

func (c *Consumer) metricsWorker(ctx context.Context) {
	for {
		select {
		case r := <-c.metricsCh:
			c.processor.handleMetric(ctx, r)
		case <-ctx.Done():
			return
		}
	}
}

func (c *Consumer) tracesWorker(ctx context.Context) {
	for {
		select {
		case r := <-c.tracesCh:
			c.processor.handleTrace(ctx, r)
		case <-ctx.Done():
			return
		}
	}
}

func (c *Consumer) Close() {
	c.client.Close()
}
