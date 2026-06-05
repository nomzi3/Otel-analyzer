package producer

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Producer wraps a franz-go Kafka client for synchronous producing.
type Producer struct {
	client *kgo.Client
}

// NewProducer creates a new Producer connected to the given brokers.
func NewProducer(brokers []string) (*Producer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
	)
	if err != nil {
		return nil, fmt.Errorf("creating kafka client: %w", err)
	}
	return &Producer{client: client}, nil
}

// Produce synchronously produces a record to the given topic.
// key is the service name bytes (for partition affinity by service).
func (p *Producer) Produce(ctx context.Context, topic string, key, value []byte) error {
	record := &kgo.Record{
		Topic: topic,
		Key:   key,
		Value: value,
	}
	results := p.client.ProduceSync(ctx, record)
	return results.FirstErr()
}

// Close shuts down the Kafka client.
func (p *Producer) Close() {
	p.client.Close()
}
