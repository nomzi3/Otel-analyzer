package producer

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/twmb/franz-go/pkg/kgo"
)

var produceErrors = promauto.NewCounter(prometheus.CounterOpts{
	Name: "gateway_produce_errors_total",
	Help: "Total number of async Kafka produce delivery failures.",
})

// Producer wraps a franz-go Kafka client for async batched producing.
type Producer struct {
	client *kgo.Client
}

// NewProducer creates a new Producer connected to the given brokers.
// Records are batched, compressed, and delivered asynchronously — the HTTP
// handler returns as soon as the record is enqueued, not after broker ack.
func NewProducer(brokers []string) (*Producer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ProducerBatchMaxBytes(4<<20),           // 4 MB batch ceiling
		kgo.ProducerBatchCompression(kgo.SnappyCompression(), kgo.NoCompression()),
		kgo.RecordDeliveryTimeout(30*time.Second),
		kgo.ProducerLinger(5*time.Millisecond),     // coalesce concurrent HTTP handlers
		kgo.MaxBufferedRecords(1_000_000),
	)
	if err != nil {
		return nil, fmt.Errorf("creating kafka client: %w", err)
	}
	return &Producer{client: client}, nil
}

// Produce enqueues a record for async delivery. It returns immediately without
// waiting for broker acknowledgment. Delivery failures are counted in metrics.
func (p *Producer) Produce(_ context.Context, topic string, key, value []byte) error {
	record := &kgo.Record{Topic: topic, Key: key, Value: value}
	p.client.TryProduce(context.Background(), record, func(_ *kgo.Record, err error) {
		if err != nil {
			produceErrors.Inc()
			log.Printf("kafka produce error topic=%s: %v", topic, err)
		}
	})
	return nil
}

// Flush blocks until all buffered records have been delivered or the context
// is cancelled. Call during graceful shutdown before Close.
func (p *Producer) Flush(ctx context.Context) error {
	return p.client.Flush(ctx)
}

// Close shuts down the Kafka client.
func (p *Producer) Close() {
	p.client.Close()
}
