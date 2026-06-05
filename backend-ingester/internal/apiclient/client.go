package apiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) post(ctx context.Context, path string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	var lastErr error
	delay := 100 * time.Millisecond
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
			delay *= 2
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("http do: %w", err)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("non-2xx status: %d", resp.StatusCode)
	}
	return fmt.Errorf("all retries exhausted: %w", lastErr)
}

func (c *Client) PostLogs(ctx context.Context, rows []types.LogRow) error {
	return c.post(ctx, "/v1/logs", rows)
}

func (c *Client) PostMetrics(ctx context.Context, rows []types.MetricRow) error {
	return c.post(ctx, "/v1/metrics", rows)
}

func (c *Client) PostTraces(ctx context.Context, roots []types.TraceRootRow, spans []types.SpanRow) error {
	type tracesBody struct {
		Roots []types.TraceRootRow `json:"roots"`
		Spans []types.SpanRow      `json:"spans"`
	}
	return c.post(ctx, "/v1/traces", tracesBody{Roots: roots, Spans: spans})
}
