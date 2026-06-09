package handler

import (
	"encoding/json"
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/go-chi/chi/v5"
	"github.com/otel-analyzer/backend-api/internal/db"
)

type tracesBody struct {
	Roots []db.TraceRootRow `json:"roots"`
	Spans []db.SpanRow      `json:"spans"`
}

func PostTraces(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body tracesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(body.Roots) > 0 {
			if err := db.InsertTraceRoots(r.Context(), conn, body.Roots); err != nil {
				http.Error(w, "insert roots failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		if len(body.Spans) > 0 {
			if err := db.InsertSpans(r.Context(), conn, body.Spans); err != nil {
				http.Error(w, "insert spans failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetTraces(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := clampLimit(r.URL.Query().Get("limit"), 100)
		offset := parseInt(r.URL.Query().Get("offset"), 0)
		services := parseServices(r.URL.Query().Get("services"))
		method := r.URL.Query().Get("method")

		rows, err := db.QueryTraces(r.Context(), conn, limit, offset, services, method)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.TraceRootRow{}
		}
		writeJSON(w, rows)
	}
}

func GetTraceMethods(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		methods, err := db.QueryTraceMethods(r.Context(), conn)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if methods == nil {
			methods = []string{}
		}
		writeJSON(w, methods)
	}
}

func GetTraceSpans(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := chi.URLParam(r, "traceID")
		rows, err := db.QuerySpans(r.Context(), conn, traceID)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.SpanRow{}
		}
		writeJSON(w, rows)
	}
}

func DeleteTraces(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.TruncateTraces(r.Context(), conn); err != nil {
			http.Error(w, "truncate failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
