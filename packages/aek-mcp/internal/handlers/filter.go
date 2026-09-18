package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/cheezmil/aek-mcp/internal/services"
)

// groupToolFilterMiddleware wraps the MCP /mcp handler and enforces group
// tool whitelists. Requires ?group=<name> on every request.
//
// Behaviour:
//   - No ?group=      -> 400
//   - Group not found -> 400
//   - tools/list      -> response truncated to AllowedTools (empty = all)
//   - tools/call      -> request rejected with 403 if tool not in AllowedTools
//
// /mcp serves SSE. We intercept at the HTTP-ResponseWriter level so the
// upstream library streams as usual; we rewrite individual SSE data lines
// that are JSON-RPC tools/list responses.
func GroupToolFilterMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		groupName := r.URL.Query().Get("group")
		if groupName == "" {
			writeJSON(w, http.StatusBadRequest, ginErrorResponse(
				"missing required group parameter; use ?group=<groupName>"))
			return
		}

		// Derive username from the ?key=xxx auth used by the /mcp stream endpoint.
		username := r.URL.Query().Get("key")
		if username != "" {
			if user := services.Store.GetUserByKey(username); user != nil {
				username = user.Username
			}
		}
		// If no key provided, pick the first user so group filtering still
		// works. The /mcp endpoint is unauthenticated; ?key= scopes per-user.
		if username == "" {
			for _, u := range services.Store.GetAllUsers() {
				username = u.Username
				break
			}
			if username == "" {
				writeJSON(w, http.StatusBadRequest, ginErrorResponse("no users configured"))
				return
			}
		}

		group := services.Store.GetGroupByName(username, groupName)
		if group == nil {
			writeJSON(w, http.StatusBadRequest, ginErrorResponse(
				fmt.Sprintf("group %q not found", groupName)))
			return
		}

		allowed := make(map[string]bool)
		for _, t := range group.AllowedTools {
			allowed[t] = true
		}
		unrestricted := len(allowed) == 0

		// Pre-validate tools/call before executing.
		var requestBody []byte
		if r.Method == http.MethodPost && r.Body != nil {
			var err error
			requestBody, err = io.ReadAll(r.Body)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, ginErrorResponse("failed to read request body"))
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(requestBody))
		}
		if len(requestBody) > 0 {
			if method, ok := jsonRPCMethod(requestBody); ok && method == "tools/call" {
				toolName := jsonRPCCallToolName(requestBody)
				if !unrestricted && !allowed[toolName] {
					writeJSON(w, http.StatusForbidden, ginErrorResponse(
						fmt.Sprintf("tool %q is not allowed in group %q", toolName, groupName)))
					return
				}
			}
		}

		// GET (listen) and SSE POST — stream through but rewrite tools/list
		// events in-place using a filtering writer.
		filteredW := &sseFilterWriter{
			ResponseWriter: w,
			allowed:        allowed,
			groupName:      groupName,
		}
		if fl, ok := w.(http.Flusher); ok {
			filteredW.flusher = fl
		}
		next.ServeHTTP(filteredW, r)
		// Flush any buffered incomplete data (e.g. non-SSE single write).
		filteredW.flushRemainder()
	})
}

// sseFilterWriter wraps an http.ResponseWriter and intercepts SSE data lines.
// Each SSE "event" is a chunk of bytes ending with "\n\n" that starts with
// "data: <json>". When that JSON is a JSON-RPC tools/list response and the
// group has a whitelist, the tools array is filtered in-place. Everything else
// (notifications, progress, non-tools/list responses, connection headers, etc.)
// passes through unchanged.
type sseFilterWriter struct {
	http.ResponseWriter
	allowed  map[string]bool
	groupName string
	flusher  http.Flusher

	// state machine across Write calls
	phase   phase // what we're currently buffering
	buf     bytes.Buffer
	flushed bool
	status  int
	wrote   bool
}

type phase int

const (
	phaseIdle = iota
	phaseData
	phaseHeader
)

func (f *sseFilterWriter) Write(b []byte) (int, error) {
	if !f.wrote {
		f.wrote = true
	}

	// Stream SSE lines; detect complete events (end with \n\n) so we can
	// rewrite individual JSON-RPC messages.
	n, err := f.bufferAndFilter(b)
	if err != nil {
		return n, err
	}

	// Drain any left-over (incomplete) data to the client.
	if f.buf.Len() > 0 {
		// Don't flush incomplete events; the next Write will complete them.
		return n, nil
	}
	return n, nil
}

// bufferAndFilter accumulates incoming bytes and flushes complete SSE events
// (delimited by "\n\n"). For a "data: <json>" event that is a JSON-RPC
// tools/list response with a whitelist, it rewrites the tools array.
func (f *sseFilterWriter) bufferAndFilter(b []byte) (int, error) {
	f.buf.Write(b)

	if f.phase == phaseIdle {
		// Flush complete events delimited by \n\n.
		for {
			idx := bytes.Index(f.buf.Bytes(), []byte("\n\n"))
			if idx == -1 {
				break
			}
			event := f.buf.Next(idx + 2)
			if rewritten, ok := f.rewriteEvent(event); ok {
				_, err := f.ResponseWriter.Write(rewritten)
				if err != nil {
					return int(idx), err
				}
				if f.flushed {
					f.flusher.Flush()
				}
			} else {
				_, err := f.ResponseWriter.Write(event)
				if err != nil {
					return int(idx), err
				}
			}
		}
	}

	return len(b), nil
}

// flushRemainder is called after the inner handler returns, to drain any
// buffered data that didn't form a complete SSE event (e.g. a non-SSE single
// chunked write from tests or a truncated stream).
func (f *sseFilterWriter) flushRemainder() {
	if f.buf.Len() > 0 {
		f.ResponseWriter.Write(f.buf.Bytes())
		f.buf.Reset()
	}
}

func (f *sseFilterWriter) rewriteEvent(event []byte) ([]byte, bool) {
	// An SSE "data: " line: strip prefix to get JSON payload.
	data := event[:len(event)-2] // drop trailing \n\n
	var (
		prefix  string
		payload []byte
	)
	if bytes.HasPrefix(data, []byte("data: ")) {
		prefix = "data: "
		payload = data[len("data: "):]
		// Strip trailing newline from data line.
		if len(payload) > 0 && payload[len(payload)-1] == '\n' {
			payload = payload[:len(payload)-1]
		}
	} else if !bytes.HasPrefix(data, []byte("data:")) {
		// Bare JSON chunk (no SSE wrapping) — common for non-SSE requests / tests.
		// Try to filter it; pass through if not a tools/list response.
		return f.rewriteBareJSON(data)
	}

	// Detect SSE pseudo-events (not JSON).
	if !bytes.HasPrefix(bytes.TrimSpace(payload), []byte("{")) {
		return event, false
	}

	filtered, ok := filterJSONRPCResponse(payload, f.allowed, f.groupName)
	if !ok {
		return event, false
	}
	return append([]byte(prefix), filtered...), true
}

// rewriteBareJSON handles a chunk that is a raw JSON payload (no SSE data:
// wrapper). When it's a JSON-RPC tools/list response subject to a whitelist,
// return the filtered JSON; otherwise return nil (pass-through marker).
func (f *sseFilterWriter) rewriteBareJSON(data []byte) ([]byte, bool) {
	trim := bytes.TrimSpace(data)
	if len(trim) == 0 || !bytes.HasPrefix(trim, []byte("{")) {
		return nil, false // pass-through
	}
	filtered, ok := filterJSONRPCResponse(trim, f.allowed, f.groupName)
	if !ok {
		return nil, false // pass-through
	}
	return filtered, true
}

// flushComplete flushes any buffered incomplete event (e.g. on connection close).
func (f *sseFilterWriter) flushComplete() {
	if f.buf.Len() > 0 {
		f.ResponseWriter.Write(f.buf.Bytes())
		f.buf.Reset()
	}
	if fl, ok := f.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}

// WriteHeader is a no-op: we capture it but rely on the inner handler to
// send the original SSE headers (text/event-stream, Connection: keep-alive, etc.).
// The upstream WriteHeader has already run before we intercept Write.
func (f *sseFilterWriter) WriteHeader(status int) {
	if !f.wrote {
		f.status = status
		f.ResponseWriter.WriteHeader(status)
	}
}

// flush signals that the next write should be flushed to the client.
func (f *sseFilterWriter) flushNow() {
	f.flushed = true
	f.flusher.Flush()
}

// jsonRPCMethod extracts the method field from a (single or batch) JSON-RPC payload.
func jsonRPCMethod(body []byte) (string, bool) {
	var envelope struct {
		Method string `json:"method"`
	}
	if err := json.Unmarshal(body, &envelope); err == nil && envelope.Method != "" {
		return envelope.Method, true
	}
	var batch []json.RawMessage
	if err := json.Unmarshal(body, &batch); err == nil && len(batch) > 0 {
		for _, item := range batch {
			var inner struct {
				Method string `json:"method"`
			}
			if err := json.Unmarshal(item, &inner); err == nil && inner.Method != "" {
				return inner.Method, true
			}
		}
	}
	return "", false
}

// jsonRPCCallToolName extracts the "name" parameter from a tools/call request.
func jsonRPCCallToolName(body []byte) string {
	var envelope struct {
		Params struct {
			Name string `json:"name"`
		} `json:"params"`
	}
	if err := json.Unmarshal(body, &envelope); err == nil {
		return envelope.Params.Name
	}
	var batch []json.RawMessage
	if err := json.Unmarshal(body, &batch); err == nil {
		for _, item := range batch {
			var inner struct {
				Params struct {
					Name string `json:"name"`
				} `json:"params"`
			}
			if err := json.Unmarshal(item, &inner); err == nil && inner.Params.Name != "" {
				return inner.Params.Name
			}
		}
	}
	return ""
}

// filterJSONRPCResponse processes a captured JSON-RPC response. Returns
// (filtered bytes, true) when the payload was rewritten; (nil, false)
// when the response should pass through unchanged.
func filterJSONRPCResponse(body []byte, allowed map[string]bool, groupName string) ([]byte, bool) {
	var envelope struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      interface{}     `json:"id"`
		Result  json.RawMessage `json:"result"`
		Error   json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, false
	}
	if envelope.JSONRPC != "2.0" {
		return nil, false
	}
	if envelope.Result == nil && envelope.Error == nil {
		return nil, false
	}

	var resultMap map[string]interface{}
	if envelope.Result != nil {
		if err := json.Unmarshal(envelope.Result, &resultMap); err != nil {
			return nil, false
		}
	}

	toolsArr, ok := resultMap["tools"]
	if !ok {
		return nil, false
	}
	arr, ok := toolsArr.([]interface{})
	if !ok {
		return nil, false
	}
	if len(allowed) == 0 {
		return nil, false // unrestricted: pass through
	}

	filtered := make([]interface{}, 0, len(arr))
	for _, t := range arr {
		tool, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		name, nameOk := tool["name"].(string)
		if nameOk && allowed[name] {
			filtered = append(filtered, tool)
		}
	}

	if len(filtered) == len(arr) {
		return nil, false // nothing removed
	}

	resultMap["tools"] = filtered
	newResult, err := json.Marshal(resultMap)
	if err != nil {
		return nil, false
	}

	newBody, err := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      envelope.ID,
		"result":  json.RawMessage(newResult),
	})
	if err != nil {
		return nil, false
	}
	return newBody, true
}

// ginErrorResponse builds the JSON response shape used by the REST API.
func ginErrorResponse(message string) map[string]interface{} {
	return map[string]interface{}{
		"success": false,
		"message": message,
	}
}

// writeJSON writes a JSON error response with the given HTTP status.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
