package providers

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// KeyState tracks cooldown state for a single API key.
type KeyState struct {
	Key         string
	Failures    int
	CooldownEnd time.Time
	Disabled    bool
}

// KeyPool manages multiple API keys with failover and exponential backoff cooldown.
type KeyPool struct {
	mu       sync.Mutex
	keys     []*KeyState
	current  int
	provider string
}

// NewKeyPool creates a key pool from a file. Each line is one key (// comments ignored).
func NewKeyPool(provider string) *KeyPool {
	pool := &KeyPool{provider: provider}
	pool.load()
	return pool
}

func (p *KeyPool) load() {
	dir := filepath.Join(userHome(), ".aek", "web-search")
	path := filepath.Join(dir, p.provider+".txt")

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		p.keys = append(p.keys, &KeyState{Key: line})
	}
}

func userHome() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	if runtime.GOOS == "windows" {
		return os.Getenv("USERPROFILE")
	}
	return "/"
}

// Next returns the next available key. Returns error if all keys are exhausted.
func (p *KeyPool) Next() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.keys) == 0 {
		return "", fmt.Errorf("no API keys found for %s", p.provider)
	}

	now := time.Now()

	// Try all keys starting from current position
	for i := 0; i < len(p.keys); i++ {
		idx := (p.current + i) % len(p.keys)
		ks := p.keys[idx]

		if ks.Disabled {
			continue
		}

		if now.Before(ks.CooldownEnd) {
			continue
		}

		p.current = (idx + 1) % len(p.keys)
		return ks.Key, nil
	}

	// All keys are cooling down or disabled, find earliest cooldown
	var earliest time.Time
	for _, ks := range p.keys {
		if !ks.Disabled && !ks.CooldownEnd.IsZero() && (earliest.IsZero() || ks.CooldownEnd.Before(earliest)) {
			earliest = ks.CooldownEnd
		}
	}

	if !earliest.IsZero() {
		wait := time.Until(earliest)
		if wait > 0 && wait < 5*time.Minute {
			// Wait a bit and retry
			time.Sleep(wait)
			return p.Next()
		}
	}

	return "", fmt.Errorf("all %s API keys exhausted (cooldown or disabled)", p.provider)
}

// ReportSuccess marks a key as working (resets failure count).
func (p *KeyPool) ReportSuccess(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, ks := range p.keys {
		if ks.Key == key {
			ks.Failures = 0
			ks.CooldownEnd = time.Time{}
			return
		}
	}
}

// ReportFailure marks a key as failed and applies exponential backoff cooldown.
// Cooldown: 1min → 5min → 25min → 1hr (max)
func (p *KeyPool) ReportFailure(key string, permanent bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, ks := range p.keys {
		if ks.Key == key {
			if permanent {
				ks.Disabled = true
				return
			}

			ks.Failures++
			cooldown := calculateCooldown(ks.Failures)
			ks.CooldownEnd = time.Now().Add(cooldown)
			return
		}
	}
}

// calculateCooldown returns exponential backoff: 1min, 5min, 25min, 1hr max
func calculateCooldown(failures int) time.Duration {
	base := time.Minute
	multiplier := 1
	for i := 1; i < failures; i++ {
		multiplier *= 5
	}
	cooldown := time.Duration(multiplier) * base
	if cooldown > time.Hour {
		cooldown = time.Hour
	}
	return cooldown
}

// Status returns the status of all keys.
func (p *KeyPool) Status() []map[string]interface{} {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	var status []map[string]interface{}
	for i, ks := range p.keys {
		s := map[string]interface{}{
			"index":    i,
			"key":      maskKey(ks.Key),
			"failures": ks.Failures,
			"disabled": ks.Disabled,
		}
		if !ks.CooldownEnd.IsZero() {
			if now.Before(ks.CooldownEnd) {
				s["cooldown_remaining"] = time.Until(ks.CooldownEnd).String()
			} else {
				s["cooldown_remaining"] = "ready"
			}
		}
		status = append(status, s)
	}
	return status
}

// Count returns the number of keys in the pool.
func (p *KeyPool) Count() int {
	return len(p.keys)
}

func maskKey(key string) string {
	if len(key) <= 8 {
		return "***"
	}
	return key[:4] + "..." + key[len(key)-4:]
}
