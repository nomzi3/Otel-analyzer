FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ingester ./cmd/ingester

FROM alpine:3.20

COPY --from=builder /ingester /ingester
CMD ["/ingester"]
