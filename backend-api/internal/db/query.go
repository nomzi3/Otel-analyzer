package db

import "strings"

// joinClauses joins WHERE clause fragments with AND.
func joinClauses(clauses []string) string {
	return strings.Join(clauses, " AND ")
}
