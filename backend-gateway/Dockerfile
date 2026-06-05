FROM golang:1.22-alpine AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /gateway ./cmd/gateway

FROM alpine:3.20

COPY --from=builder /gateway /gateway

EXPOSE 4317 4318 9090

CMD ["/gateway"]
