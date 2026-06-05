package internal

import "fmt"

// ServiceDef describes a synthetic service and its resource attributes.
type ServiceDef struct {
	Name          string
	ResourceAttrs map[string]string
	IsK8s         bool
}

// Services holds all 50 synthetic service definitions.
var Services []ServiceDef

func init() {
	k8sNames := []string{
		"frontend-svc", "auth-service", "payment-api", "order-processor", "inventory-svc",
		"notification-svc", "user-profile", "search-svc", "recommendation-engine", "cart-service",
		"checkout-svc", "shipping-tracker", "billing-api", "analytics-worker", "report-generator",
		"session-manager", "config-server", "api-gateway", "event-bus", "scheduler-svc",
		"audit-logger", "media-processor", "file-storage", "cache-warmer", "rate-limiter",
	}

	namespaces := []string{"production", "staging"}
	nodes := []string{"node-1", "node-2", "node-3", "node-4", "node-5"}

	for i, name := range k8sNames {
		Services = append(Services, ServiceDef{
			Name:  name,
			IsK8s: true,
			ResourceAttrs: map[string]string{
				"service.name":            name,
				"service.version":         "1.0.0",
				"deployment.environment":  "production",
				"k8s.namespace.name":      namespaces[i%2],
				"k8s.pod.name":            fmt.Sprintf("%s-abc12", name),
				"k8s.node.name":           nodes[i%5],
				"k8s.cluster.name":        "prod-cluster",
			},
		})
	}

	vmNames := []string{
		"nginx-proxy", "haproxy-lb", "mysql-primary", "postgres-replica", "redis-sentinel",
		"rabbitmq-node", "kafka-broker", "zookeeper", "elasticsearch-master", "kibana",
		"logstash", "memcached", "mongodb-primary", "cassandra-node", "influxdb",
		"prometheus-server", "grafana", "vault-agent", "consul-node", "etcd-member",
		"minio-server", "nats-server", "envoy-proxy", "traefik", "jenkins-agent",
	}

	for i, name := range vmNames {
		j := i % 255
		if j == 0 {
			j = 1
		}
		Services = append(Services, ServiceDef{
			Name:  name,
			IsK8s: false,
			ResourceAttrs: map[string]string{
				"service.name":           name,
				"service.version":        "1.0.0",
				"deployment.environment": "production",
				"host.name":              fmt.Sprintf("%s-host", name),
				"host.ip":                fmt.Sprintf("10.0.%d.%d", (i/255)+1, j),
				"os.type":                "linux",
				"os.description":         "Ubuntu 22.04.3 LTS",
			},
		})
	}
}
