package receiver

import (
	"context"
	"fmt"
	"log"
	"net"

	"github.com/otel-analyzer/backend-gateway/internal/metrics"
	"github.com/otel-analyzer/backend-gateway/internal/producer"
	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
)

// GRPCServer composes the three OTLP collector service handlers.
type GRPCServer struct {
	logs    *logsHandler
	mets    *metricsHandler
	traces  *tracesHandler
}

// NewGRPCServer creates a GRPCServer.
func NewGRPCServer(p *producer.Producer, logsTopic, metricsTopic, tracesTopic string) *GRPCServer {
	return &GRPCServer{
		logs:   &logsHandler{producer: p, topic: logsTopic},
		mets:   &metricsHandler{producer: p, topic: metricsTopic},
		traces: &tracesHandler{producer: p, topic: tracesTopic},
	}
}

// RegisterServices registers all OTLP services on the given gRPC server.
func (s *GRPCServer) RegisterServices(server *grpc.Server) {
	collogspb.RegisterLogsServiceServer(server, s.logs)
	colmetricspb.RegisterMetricsServiceServer(server, s.mets)
	coltracepb.RegisterTraceServiceServer(server, s.traces)
}

// Start begins listening for gRPC connections on the given port.
func (s *GRPCServer) Start(port string) error {
	addr := fmt.Sprintf(":%s", port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("gRPC listen %s: %w", addr, err)
	}
	server := grpc.NewServer()
	s.RegisterServices(server)
	log.Printf("gRPC OTLP receiver listening on %s", addr)
	return server.Serve(lis)
}

// --- logs handler ---

type logsHandler struct {
	collogspb.UnimplementedLogsServiceServer
	producer *producer.Producer
	topic    string
}

func (h *logsHandler) Export(ctx context.Context, req *collogspb.ExportLogsServiceRequest) (*collogspb.ExportLogsServiceResponse, error) {
	raw, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}

	var firstSvc string
	for _, rl := range req.ResourceLogs {
		name := "unknown"
		if rl.Resource != nil {
			name = serviceNameFromAttrs(rl.Resource.Attributes)
		}
		if firstSvc == "" {
			firstSvc = name
		}
		var count int
		for _, sl := range rl.ScopeLogs {
			count += len(sl.LogRecords)
		}
		if count > 0 {
			metrics.LogsCounter.WithLabelValues(name).Add(float64(count))
		}
	}

	if err := h.producer.Produce(ctx, h.topic, []byte(firstSvc), raw); err != nil {
		log.Printf("gRPC logs produce error: %v", err)
	}
	return &collogspb.ExportLogsServiceResponse{}, nil
}

// --- metrics handler ---

type metricsHandler struct {
	colmetricspb.UnimplementedMetricsServiceServer
	producer *producer.Producer
	topic    string
}

func (h *metricsHandler) Export(ctx context.Context, req *colmetricspb.ExportMetricsServiceRequest) (*colmetricspb.ExportMetricsServiceResponse, error) {
	raw, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}

	var firstSvc string
	for _, rm := range req.ResourceMetrics {
		name := "unknown"
		if rm.Resource != nil {
			name = serviceNameFromAttrs(rm.Resource.Attributes)
		}
		if firstSvc == "" {
			firstSvc = name
		}
		var dpCount int
		for _, sm := range rm.ScopeMetrics {
			for _, m := range sm.Metrics {
				dpCount += countDataPointsProto(m)
			}
		}
		if dpCount > 0 {
			metrics.DatapointsCounter.WithLabelValues(name).Add(float64(dpCount))
		}
	}

	if err := h.producer.Produce(ctx, h.topic, []byte(firstSvc), raw); err != nil {
		log.Printf("gRPC metrics produce error: %v", err)
	}
	return &colmetricspb.ExportMetricsServiceResponse{}, nil
}

// --- traces handler ---

type tracesHandler struct {
	coltracepb.UnimplementedTraceServiceServer
	producer *producer.Producer
	topic    string
}

func (h *tracesHandler) Export(ctx context.Context, req *coltracepb.ExportTraceServiceRequest) (*coltracepb.ExportTraceServiceResponse, error) {
	raw, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}

	var firstSvc string
	for _, rs := range req.ResourceSpans {
		name := "unknown"
		if rs.Resource != nil {
			name = serviceNameFromAttrs(rs.Resource.Attributes)
		}
		if firstSvc == "" {
			firstSvc = name
		}
		var spanCount int
		for _, ss := range rs.ScopeSpans {
			spanCount += len(ss.Spans)
		}
		if spanCount > 0 {
			metrics.SpansCounter.WithLabelValues(name).Add(float64(spanCount))
		}
	}

	if err := h.producer.Produce(ctx, h.topic, []byte(firstSvc), raw); err != nil {
		log.Printf("gRPC traces produce error: %v", err)
	}
	return &coltracepb.ExportTraceServiceResponse{}, nil
}
