package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type ThroughputResponse struct {
	LogsPerSec       float64 `json:"logs_per_sec"`
	SpansPerSec      float64 `json:"spans_per_sec"`
	DatapointsPerSec float64 `json:"datapoints_per_sec"`
}

type promQueryResponse struct {
	Data struct {
		Result []struct {
			Value [2]json.RawMessage `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

// queryRate calls the Prometheus instant query API and sums all returned series.
func queryRate(prometheusURL, expr string) (float64, error) {
	resp, err := http.Get(prometheusURL + "/api/v1/query?query=" + url.QueryEscape(expr))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("prometheus returned %d", resp.StatusCode)
	}
	var pr promQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return 0, err
	}
	var total float64
	for _, r := range pr.Data.Result {
		if len(r.Value) < 2 {
			continue
		}
		var s string
		if err := json.Unmarshal(r.Value[1], &s); err != nil {
			continue
		}
		var v float64
		fmt.Sscanf(s, "%f", &v)
		total += v
	}
	return total, nil
}

func GetThroughput(prometheusURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var out ThroughputResponse
		// Errors from Prometheus result in 0 — UI shows 0 rather than failing.
		out.LogsPerSec, _ = queryRate(prometheusURL, "rate(gateway_logs_received_total[1m])")
		out.SpansPerSec, _ = queryRate(prometheusURL, "rate(gateway_spans_received_total[1m])")
		out.DatapointsPerSec, _ = queryRate(prometheusURL, "rate(gateway_datapoints_received_total[1m])")
		writeJSON(w, out)
	}
}
