package sampler

import (
	"log/slog"
	"os"
	"strconv"
)

// Sampler implements tail-based sampling (B1).
// Spans whose duration is below ThresholdMs are dropped before entering the buffer.
type Sampler struct {
	ThresholdMs float64
}

func New() *Sampler {
	threshold := 5.0
	if v := os.Getenv("SAMPLE_THRESHOLD_MS"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil && n >= 0 {
			threshold = n
		}
	}
	slog.Info("sampler configured", "threshold_ms", threshold)
	return &Sampler{ThresholdMs: threshold}
}

// ShouldKeep returns true if the span should be buffered.
// Spans shorter than ThresholdMs are considered noise and dropped.
func (s *Sampler) ShouldKeep(durationMs float64) bool {
	return durationMs >= s.ThresholdMs
}
