package handler

import (
	"strconv"
	"strings"
)

func clampLimit(s string, defaultVal int) int {
	v := parseInt(s, defaultVal)
	if v <= 0 {
		return defaultVal
	}
	if v > 1000 {
		return 1000
	}
	return v
}

func parseServices(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) > 100 {
		return result[:100]
	}
	return result
}

func parseInt(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}
