package consumer

import (
	"context"
	"log"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/otel-analyzer/backend-ingester/internal/apiclient"
	"github.com/otel-analyzer/backend-ingester/internal/metrics"
	"github.com/otel-analyzer/backend-ingester/internal/processor"

	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

type Processor struct {
	apiClient    *apiclient.Client
	logsTopic    string
	metricsTopic string
	tracesTopic  string
}

func NewProcessor(apiClient *apiclient.Client, logsTopic, metricsTopic, tracesTopic string) *Processor {
	return &Processor{
		apiClient:    apiClient,
		logsTopic:    logsTopic,
		metricsTopic: metricsTopic,
		tracesTopic:  tracesTopic,
	}
}

func (p *Processor) handle(ctx context.Context, r *kgo.Record) {
	switch r.Topic {
	case p.logsTopic:
		var unmarshaler plog.ProtoUnmarshaler
		ld, err := unmarshaler.UnmarshalLogs(r.Value)
		if err != nil {
			log.Printf("unmarshal logs error: %v", err)
			return
		}
		rows := processor.ProcessLogs(ld)
		if len(rows) == 0 {
			return
		}
		if err := p.apiClient.PostLogs(ctx, rows); err != nil {
			log.Printf("post logs error: %v", err)
			return
		}
		metrics.LogsProcessed.Add(float64(len(rows)))

	case p.metricsTopic:
		var unmarshaler pmetric.ProtoUnmarshaler
		md, err := unmarshaler.UnmarshalMetrics(r.Value)
		if err != nil {
			log.Printf("unmarshal metrics error: %v", err)
			return
		}
		rows := processor.ProcessMetrics(md)
		if len(rows) == 0 {
			return
		}
		if err := p.apiClient.PostMetrics(ctx, rows); err != nil {
			log.Printf("post metrics error: %v", err)
			return
		}
		metrics.DatapointsProcessed.Add(float64(len(rows)))

	case p.tracesTopic:
		var unmarshaler ptrace.ProtoUnmarshaler
		td, err := unmarshaler.UnmarshalTraces(r.Value)
		if err != nil {
			log.Printf("unmarshal traces error: %v", err)
			return
		}
		roots, spans := processor.ProcessTraces(td)
		if len(roots) == 0 && len(spans) == 0 {
			return
		}
		if err := p.apiClient.PostTraces(ctx, roots, spans); err != nil {
			log.Printf("post traces error: %v", err)
			return
		}
		metrics.RootTracesProcessed.Add(float64(len(roots)))

	default:
		log.Printf("unknown topic: %s", r.Topic)
	}
}

type Consumer struct {
	client    *kgo.Client
	processor *Processor
}

func NewConsumer(brokers []string, groupID string, topics []string, proc *Processor) (*Consumer, error) {
	cl, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topics...),
	)
	if err != nil {
		return nil, err
	}
	return &Consumer{client: cl, processor: proc}, nil
}

func (c *Consumer) Run(ctx context.Context) error {
	for {
		fetches := c.client.PollFetches(ctx)
		if fetches.IsClientClosed() {
			return nil
		}
		fetches.EachError(func(t string, p int32, err error) {
			log.Printf("fetch error topic=%s partition=%d: %v", t, p, err)
		})
		fetches.EachRecord(func(r *kgo.Record) {
			c.processor.handle(ctx, r)
		})
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

func (c *Consumer) Close() {
	c.client.Close()
}
