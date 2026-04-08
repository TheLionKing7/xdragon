---
name: Go Error Handling Consistency
description: Ensure errors are properly wrapped, never silently discarded, and checked with errors.Is/As.
---

# Go Error Handling Consistency

## Context

The Ollama codebase follows Go best practices for error handling throughout `server/routes.go`, `api/client.go`, and other core packages. Errors are consistently wrapped with `fmt.Errorf("context: %w", err)` and checked with `errors.Is()` / `errors.As()`. New code must maintain this standard — silent error swallowing or bare `err != nil` returns without context make debugging production issues extremely difficult.

## What to Check

### 1. Error Wrapping with Context

All returned errors must include context about what operation failed, using `%w` to preserve the error chain.

**GOOD:**
```go
if err := c.ShouldBindJSON(&req); err != nil {
    return fmt.Errorf("parsing request body: %w", err)
}

return nil, fmt.Errorf("model %w", errRequired)
```

**BAD:**
```go
if err := c.ShouldBindJSON(&req); err != nil {
    return err  // no context — impossible to trace in logs
}

return nil, fmt.Errorf("failed: %s", err)  // %s loses the error chain, use %w
```

### 2. Never Silently Discard Errors

Every error from a function call must be either returned, logged, or explicitly handled. Using `_` for errors is only acceptable for operations that are truly best-effort (e.g., closing a response body after the data has been read).

**GOOD:**
```go
resp, err := client.Do(req)
if err != nil {
    return fmt.Errorf("sending request: %w", err)
}
defer resp.Body.Close()  // Close errors are best-effort — acceptable to ignore
```

**BAD:**
```go
resp, _ := client.Do(req)  // silently discards network errors
data, _ := io.ReadAll(resp.Body)  // silently discards read errors
```

### 3. Use errors.Is / errors.As for Comparison

Never compare errors with `==`. Always use `errors.Is()` for sentinel errors and `errors.As()` for type assertions. This is already the pattern in `server/routes.go`.

**GOOD:**
```go
if errors.Is(err, io.EOF) {
    // handle end of stream
}
if errors.As(err, &statusErr) {
    c.JSON(statusErr.StatusCode, gin.H{"error": statusErr.Error()})
}
```

**BAD:**
```go
if err == io.EOF {  // breaks if err is wrapped
    // handle end of stream
}
if serr, ok := err.(*StatusError); ok {  // doesn't unwrap
    c.JSON(serr.StatusCode, gin.H{"error": serr.Error()})
}
```

### 4. Panic Usage

Panics should never be used for expected error conditions. They are acceptable only for programmer errors (unreachable code, invalid invariants) during init. The `middleware/resilience.go` PanicRecovery middleware exists as a safety net but code should not rely on it.

## Key Files to Check

- `server/routes.go` — main API handlers
- `api/client.go` — API client methods
- `convert/*.go` — model converters
- `middleware/*.go` — middleware handlers
- `cmd/*.go` — CLI commands
- Any new `.go` files in the PR

## Exclusions

- Test files (`*_test.go`) may use simpler error handling for readability
- `defer f.Close()` where the close error is not actionable
- Third-party generated code (e.g., `sentencepiece/` protobuf code)
