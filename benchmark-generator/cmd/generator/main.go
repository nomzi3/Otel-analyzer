package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel/log/global"

	"github.com/otel-analyzer/benchmark-generator/internal"
)

func main() {
	if err := rootCmd().Execute(); err != nil {
		log.Fatal(err)
	}
}

func rootCmd() *cobra.Command {
	var (
		endpoint string
		duration string
		signals  string
		interval string
	)

	cmd := &cobra.Command{
		Use:   "generator",
		Short: "Generate synthetic OTLP telemetry for load testing",
		RunE: func(cmd *cobra.Command, args []string) error {
			return run(endpoint, duration, signals, interval)
		},
	}

	cmd.Flags().StringVar(&endpoint, "endpoint", "http://localhost:4318", "OTLP HTTP endpoint")
	cmd.Flags().StringVar(&duration, "duration", "30s", "Total run duration (e.g. 30s, 5m, 1h)")
	cmd.Flags().StringVar(&signals, "signals", "all", "Comma-separated signals: logs,metrics,traces or all")
	cmd.Flags().StringVar(&interval, "interval", "10s", "Export interval (e.g. 10s)")

	return cmd
}

func run(endpoint, durationStr, signalsStr, intervalStr string) error {
	totalDuration, err := time.ParseDuration(durationStr)
	if err != nil {
		return fmt.Errorf("invalid duration %q: %w", durationStr, err)
	}

	intervalDur, err := time.ParseDuration(intervalStr)
	if err != nil {
		return fmt.Errorf("invalid interval %q: %w", intervalStr, err)
	}

	wantLogs, wantMetrics, wantTraces := parseSignals(signalsStr)
	fmt.Printf("Starting benchmark generator: endpoint=%s duration=%s interval=%s signals=%s\n",
		endpoint, durationStr, intervalStr, signalsStr)

	ctx, cancel := context.WithTimeout(context.Background(), totalDuration)
	defer cancel()

	// Handle OS signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	// Set up exporters
	tracerProvider, meterProvider, loggerProvider, shutdown, err := internal.SetupExporters(ctx, endpoint)
	if err != nil {
		return fmt.Errorf("setup exporters: %w", err)
	}

	// Register global logger provider
	global.SetLoggerProvider(loggerProvider)

	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer shutdownCancel()
		if err := shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown error: %v", err)
		}
	}()

	tracer := tracerProvider.Tracer("benchmark-generator")
	meter := meterProvider.Meter("benchmark-generator")
	logger := loggerProvider.Logger("benchmark-generator")

	metricsSetup := make(map[string]bool)

	ticker := time.NewTicker(intervalDur)
	defer ticker.Stop()

	tickCount := 0
	for {
		select {
		case <-ctx.Done():
			fmt.Printf("Generator finished after %d ticks.\n", tickCount)
			return nil
		case <-ticker.C:
			tickCount++
			fmt.Printf("[tick %d] Generating telemetry for %d services...\n", tickCount, len(internal.Services))
			for _, svc := range internal.Services {
				if wantTraces {
					if err := internal.GenerateTraces(ctx, svc, tracer); err != nil {
						log.Printf("traces error for %s: %v", svc.Name, err)
					}
				}
				if wantLogs {
					if err := internal.GenerateLogs(ctx, svc, logger); err != nil {
						log.Printf("logs error for %s: %v", svc.Name, err)
					}
				}
				if wantMetrics && !metricsSetup[svc.Name] {
					if err := internal.SetupMetrics(ctx, svc, meter); err != nil {
						log.Printf("metrics error for %s: %v", svc.Name, err)
					} else {
						metricsSetup[svc.Name] = true
					}
				}
			}
		}
	}
}

func parseSignals(s string) (logs, metrics, traces bool) {
	if strings.TrimSpace(s) == "all" {
		return true, true, true
	}
	parts := strings.Split(s, ",")
	for _, p := range parts {
		switch strings.TrimSpace(strings.ToLower(p)) {
		case "logs":
			logs = true
		case "metrics":
			metrics = true
		case "traces":
			traces = true
		case "all":
			return true, true, true
		}
	}
	return
}
