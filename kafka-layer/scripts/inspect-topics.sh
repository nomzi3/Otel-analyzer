#!/usr/bin/env bash
set -euo pipefail

RPK="docker compose exec -T redpanda rpk"

echo "=== Topic partition offsets ==="
$RPK topic describe otel-logs otel-metrics otel-traces --brokers localhost:9092

echo ""
echo "=== Consumer group lag (otel-ingester) ==="
$RPK group describe otel-ingester --brokers localhost:9092
