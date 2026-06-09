package receiver

import (
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/otel-analyzer/backend-gateway/internal/metrics"
	"github.com/otel-analyzer/backend-gateway/internal/producer"
	plog "go.opentelemetry.io/collector/pdata/plog"
	pmetric "go.opentelemetry.io/collector/pdata/pmetric"
	ptrace "go.opentelemetry.io/collector/pdata/ptrace"
)

// HTTPReceiver holds dependencies for the HTTP OTLP receiver.
type HTTPReceiver struct {
	producer      *producer.Producer
	logsTopic     string
	metricsTopic  string
	tracesTopic   string
}

// NewHTTPReceiver creates an HTTPReceiver.
func NewHTTPReceiver(p *producer.Producer, logsTopic, metricsTopic, tracesTopic string) *HTTPReceiver {
	return &HTTPReceiver{
		producer:     p,
		logsTopic:    logsTopic,
		metricsTopic: metricsTopic,
		tracesTopic:  tracesTopic,
	}
}

// Start registers handlers and begins listening on the given port.
func (r *HTTPReceiver) Start(port string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/logs", r.handleLogs)
	mux.HandleFunc("/v1/metrics", r.handleMetrics)
	mux.HandleFunc("/v1/traces", r.handleTraces)
	addr := fmt.Sprintf(":%s", port)
	log.Printf("HTTP OTLP receiver listening on %s", addr)
	return http.ListenAndServe(addr, mux)
}

func readBody(w http.ResponseWriter, req *http.Request) ([]byte, bool) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return nil, false
	}
	body, err := io.ReadAll(io.LimitReader(req.Body, 32<<20))
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return nil, false
	}
	return body, true
}

func writeEmptyProtoResponse(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/x-protobuf")
	w.WriteHeader(http.StatusOK)
}

func (r *HTTPReceiver) handleLogs(w http.ResponseWriter, req *http.Request) {
	body, ok := readBody(w, req)
	if !ok {
		return
	}

	unmarshaler := plog.ProtoUnmarshaler{}
	ld, err := unmarshaler.UnmarshalLogs(body)
	if err != nil {
		http.Error(w, "failed to parse logs", http.StatusBadRequest)
		return
	}

	var firstServiceName string
	rls := ld.ResourceLogs()
	for i := 0; i < rls.Len(); i++ {
		rl := rls.At(i)
		svcName := serviceNameFromResource(rl.Resource().Attributes())
		if firstServiceName == "" && svcName != "" {
			firstServiceName = svcName
		}
		count := 0
		sls := rl.ScopeLogs()
		for j := 0; j < sls.Len(); j++ {
			count += sls.At(j).LogRecords().Len()
		}
		if count > 0 {
			metrics.LogsCounter.WithLabelValues(svcName).Add(float64(count))
		}
	}

	if err := r.producer.Produce(req.Context(), r.logsTopic, []byte(firstServiceName), body); err != nil {
		log.Printf("failed to produce logs: %v", err)
		http.Error(w, "failed to produce", http.StatusInternalServerError)
		return
	}

	writeEmptyProtoResponse(w)
}

func (r *HTTPReceiver) handleMetrics(w http.ResponseWriter, req *http.Request) {
	body, ok := readBody(w, req)
	if !ok {
		return
	}

	unmarshaler := pmetric.ProtoUnmarshaler{}
	md, err := unmarshaler.UnmarshalMetrics(body)
	if err != nil {
		http.Error(w, "failed to parse metrics", http.StatusBadRequest)
		return
	}

	var firstServiceName string
	rms := md.ResourceMetrics()
	for i := 0; i < rms.Len(); i++ {
		rm := rms.At(i)
		svcName := serviceNameFromResource(rm.Resource().Attributes())
		if firstServiceName == "" && svcName != "" {
			firstServiceName = svcName
		}
		count := 0
		sms := rm.ScopeMetrics()
		for j := 0; j < sms.Len(); j++ {
			ms := sms.At(j).Metrics()
			for k := 0; k < ms.Len(); k++ {
				count += countDataPoints(ms.At(k))
			}
		}
		if count > 0 {
			metrics.DatapointsCounter.WithLabelValues(svcName).Add(float64(count))
		}
	}

	if err := r.producer.Produce(req.Context(), r.metricsTopic, []byte(firstServiceName), body); err != nil {
		log.Printf("failed to produce metrics: %v", err)
		http.Error(w, "failed to produce", http.StatusInternalServerError)
		return
	}

	writeEmptyProtoResponse(w)
}

func (r *HTTPReceiver) handleTraces(w http.ResponseWriter, req *http.Request) {
	body, ok := readBody(w, req)
	if !ok {
		return
	}

	unmarshaler := ptrace.ProtoUnmarshaler{}
	td, err := unmarshaler.UnmarshalTraces(body)
	if err != nil {
		http.Error(w, "failed to parse traces", http.StatusBadRequest)
		return
	}

	var firstServiceName string
	rss := td.ResourceSpans()
	for i := 0; i < rss.Len(); i++ {
		rs := rss.At(i)
		svcName := serviceNameFromResource(rs.Resource().Attributes())
		if firstServiceName == "" && svcName != "" {
			firstServiceName = svcName
		}
		count := 0
		sss := rs.ScopeSpans()
		for j := 0; j < sss.Len(); j++ {
			count += sss.At(j).Spans().Len()
		}
		if count > 0 {
			metrics.SpansCounter.WithLabelValues(svcName).Add(float64(count))
		}
	}

	if err := r.producer.Produce(req.Context(), r.tracesTopic, []byte(firstServiceName), body); err != nil {
		log.Printf("failed to produce traces: %v", err)
		http.Error(w, "failed to produce", http.StatusInternalServerError)
		return
	}

	writeEmptyProtoResponse(w)
}
