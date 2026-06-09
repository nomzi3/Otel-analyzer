package handler

import (
	"encoding/json"
	"net/http"
)

// writeJSON marshals v and writes it as an application/json response.
// Headers are only written after a successful marshal, preventing a 200
// with a truncated body when encoding fails after the status line flushes.
func writeJSON(w http.ResponseWriter, v any) {
	buf, err := json.Marshal(v)
	if err != nil {
		http.Error(w, "encoding error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(buf)
}
