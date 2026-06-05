API_BASE_URL ?= http://localhost:8080
N ?= 1
DURATION ?= 30s
SIGNALS ?= all
INTERVAL ?= 10s
SERVICE ?=

.PHONY: up down build reset scale-ingester test-telemetry logs status help

help:
	@printf "%-20s %s\n" "up"              "Start all services in the background"
	@printf "%-20s %s\n" "down"            "Stop and remove all containers"
	@printf "%-20s %s\n" "reset"           "Delete all telemetry data via the API"
	@printf "%-20s %s\n" "scale-ingester"  "Scale the ingester (N=<count>, default 1)"
	@printf "%-20s %s\n" "test-telemetry"  "Run benchmark generator (DURATION, SIGNALS, INTERVAL)"
	@printf "%-20s %s\n" "logs"            "Follow logs (SERVICE=<name> or all)"
	@printf "%-20s %s\n" "build"           "Force rebuild all images (no cache)"
	@printf "%-20s %s\n" "status"          "Show container status"

build:
	docker compose build --no-cache --pull

up:
	docker compose up -d

down:
	docker compose down

reset:
	curl -sf -X DELETE $(API_BASE_URL)/v1/logs || true
	curl -sf -X DELETE $(API_BASE_URL)/v1/metrics || true
	curl -sf -X DELETE $(API_BASE_URL)/v1/traces || true

scale-ingester:
	docker compose up --scale backend-ingester=$(N) -d

test-telemetry:
	docker compose --profile tools run --rm --build benchmark-generator \
		--endpoint=http://backend-gateway:4318 \
		--duration=$(DURATION) \
		--signals=$(SIGNALS) \
		--interval=$(INTERVAL)

logs:
	docker compose logs -f $(SERVICE)

status:
	docker compose ps
