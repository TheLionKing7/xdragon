// Package middleware — resilience.go provides self-healing middleware for the
// xdragon fortress: panic recovery, request timeouts, and request-level logging.
package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
)

// PanicRecovery catches panics in downstream handlers, logs the stack trace,
// and returns a 500 instead of crashing the server. This makes the system
// self-healing — a single bad request can never take down the service.
func PanicRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				slog.Error("panic recovered",
					"error", fmt.Sprintf("%v", r),
					"method", c.Request.Method,
					"path", c.Request.URL.Path,
					"stack", stack,
				)
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error": "internal server error — recovered from panic",
				})
			}
		}()
		c.Next()
	}
}

// RequestTimeout wraps each request in a context with a deadline so no single
// request can hang the server indefinitely. Long-running generate/chat
// requests should use their own streaming timeouts; this is a safety net.
func RequestTimeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()

		// If the context timed out mid-handler, inform the client.
		if ctx.Err() == context.DeadlineExceeded {
			slog.Warn("request timeout exceeded",
				"method", c.Request.Method,
				"path", c.Request.URL.Path,
				"timeout", timeout,
			)
			if !c.Writer.Written() {
				c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{
					"error": fmt.Sprintf("request exceeded %v timeout", timeout),
				})
			}
		}
	}
}

// RequestLogger logs every request with method, path, status, and latency.
// Uses structured logging (slog) so it integrates cleanly with the existing
// Ollama logging pipeline.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)

		slog.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"latency", latency.String(),
			"client", c.ClientIP(),
		)
	}
}
