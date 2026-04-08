---
name: API Backward Compatibility
description: Flag changes to public API types or endpoints that could break existing clients.
---

# API Backward Compatibility

## Context

Ollama exposes a REST API consumed by thousands of tools and integrations (Continue.dev, Open WebUI, LangChain, LlamaIndex, etc.). It also provides OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`) and an Anthropic-compatible endpoint (`/v1/messages`). The [CONTRIBUTING.md](../../CONTRIBUTING.md) explicitly states:

> Changes that break backwards compatibility in Ollama's API (including the OpenAI-compatible API) **may not be accepted**.

Any modification to request/response types, endpoint paths, or default behavior must be reviewed for backward compatibility.

## What to Check

### 1. api/types.go Changes

This file defines the public API contract. Flag any change that:
- **Removes** a field from a request or response struct
- **Renames** a field or changes its JSON tag
- **Changes** a field's type (e.g., `string` to `int`, `*bool` to `bool`)
- **Changes default behavior** when a field is omitted

**GOOD — additive change:**
```go
type GenerateRequest struct {
    Model    string `json:"model"`
    Prompt   string `json:"prompt"`
    Stream   *bool  `json:"stream,omitempty"`
    Think    *bool  `json:"think,omitempty"`    // NEW — optional, omitempty, backward compatible
}
```

**BAD — breaking change:**
```go
type GenerateRequest struct {
    Model    string `json:"model"`
    Prompt   string `json:"prompt"`
    Stream   bool   `json:"stream"`  // CHANGED from *bool to bool — changes default from nil to false
}
```

### 2. Endpoint Path Changes

Flag any modification to route registrations in `server/routes.go`:
- Removing an existing route
- Changing HTTP method (POST to PUT, etc.)
- Changing the URL path (`/api/tags` to `/api/models`)
- Removing middleware from an existing route

**GOOD:**
```go
// Adding a new route — no impact on existing clients
r.GET("/api/status", s.StatusHandler)
```

**BAD:**
```go
// Removing or renaming an existing route — breaks all clients
// r.GET("/api/tags", s.ListHandler)  // REMOVED
r.GET("/api/models", s.ListHandler)   // clients still call /api/tags
```

### 3. OpenAI/Anthropic Compatibility Layer

Changes to `middleware/openai.go`, `middleware/anthropic.go`, or `openai/` package must maintain compatibility with the official OpenAI/Anthropic API specs. Clients using these endpoints expect exact field names and response formats.

Flag changes that:
- Alter response JSON structure
- Remove fields from streamed chunks
- Change the `model` field format in responses
- Modify error response format

### 4. Default Behavior Changes

Changes that alter how the server behaves when optional fields are omitted are breaking changes, even if the struct doesn't change. Examples:
- Changing the default temperature
- Changing what happens when `stream` is not provided
- Changing the default system prompt

## Key Files to Check

- [api/types.go](../../api/types.go) — core API types
- [server/routes.go](../../server/routes.go) — route registration and handlers
- [middleware/openai.go](../../middleware/openai.go) — OpenAI compatibility
- [middleware/anthropic.go](../../middleware/anthropic.go) — Anthropic compatibility
- [openai/](../../openai/) — OpenAI type mappings

## Exclusions

- Internal types not serialized to JSON (unexported fields, internal structs)
- Adding new optional fields with `omitempty` — these are backward compatible
- New endpoints that don't modify existing ones
- Changes to `/api/version` response (version bumps are expected)
