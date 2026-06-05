package internal

import "go.opentelemetry.io/otel/attribute"

func stringAttr(key, value string) attribute.KeyValue {
	return attribute.String(key, value)
}
