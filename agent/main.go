package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"observability-agent/buffer"
	"observability-agent/flusher"
	agentprom "observability-agent/prometheus"
	"observability-agent/receiver"
	"observability-agent/sampler"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	slog.Info("starting observability agent")

	// --- Config ---
	grpcPort := getEnv("OTLP_GRPC_PORT", "4317")
	promPort := getEnv("PROMETHEUS_PORT", "2112")
	databaseURL := mustGetEnv("DATABASE_URL")
	flushInterval := parseDuration("FLUSH_INTERVAL_SECONDS", 60)

	// --- Prometheus metrics (B3) ---
	metrics := agentprom.New()

	// --- Prometheus HTTP server (B3) ---
	go func() {
		mux := http.NewServeMux()
		mux.Handle("/metrics", promhttp.Handler())
		slog.Info("Prometheus metrics endpoint listening", "port", promPort)
		if err := http.ListenAndServe(":"+promPort, mux); err != nil {
			slog.Error("Prometheus server stopped", "error", err)
		}
	}()

	// --- Database ---
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("failed to create db pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	slog.Info("database connected")

	// --- Sampler (B1) ---
	smp := sampler.New()

	// --- Buffer ---
	buf := buffer.New()

	// --- Flusher ---
	fl := flusher.New(pool, buf, flushInterval, metrics)
	go fl.Start(ctx)

	// --- Receiver ---
	rec := receiver.New(grpcPort, buf, smp, metrics)
	go func() {
		if err := rec.Start(); err != nil {
			slog.Error("receiver stopped", "error", err)
			stop()
		}
	}()

	slog.Info("agent ready",
		"otlp_grpc_port", grpcPort,
		"prometheus_port", promPort,
		"flush_interval", flushInterval,
		"sample_threshold_ms", smp.ThresholdMs,
	)

	// --- Wait for shutdown signal ---
	<-ctx.Done()
	slog.Info("shutdown signal received — draining buffer")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	fl.Flush(shutdownCtx)

	rec.Stop()
	slog.Info("agent stopped cleanly")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required environment variable not set", "key", key)
		os.Exit(1)
	}
	return v
}

func parseDuration(envKey string, defaultSeconds int) time.Duration {
	if v := os.Getenv(envKey); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return time.Duration(defaultSeconds) * time.Second
}
