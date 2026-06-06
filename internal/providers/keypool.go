package providers

import (
	"agent-enhance-kit/internal/config"
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
// When round_robin is enabled in settings, keys are cycled in order (0→1→2→0→...).
// Failover and cooldown always apply regardless of round_robin setting.
type KeyPool struct {
	mu       sync.Mutex
	keys     []*KeyState
	disabled map[string]bool
	current  int
	provider string
}

// NewKeyPool creates a key pool from a file. Each line is one key (// comments ignored).
func NewKeyPool(provider string) *KeyPool {
	pool := &KeyPool{
		provider: provider,
		disabled: make(map[string]bool),
	}
	pool.loadDisabled()
	pool.load()
	return pool
}

// isRoundRobin checks if round_robin is enabled for this provider in settings.
func (p *KeyPool) isRoundRobin() bool {
	cfg := config.Load()
	if prov, ok := cfg.Providers[p.provider]; ok {
		return prov.RoundRobin
	}
	return false
}

func (p *KeyPool) keysDir() string {
	return filepath.Join(userHome(), ".aek", "web-search")
}

func (p *KeyPool) keyPath() string {
	return filepath.Join(p.keysDir(), p.provider+".txt")
}

func (p *KeyPool) disabledPath() string {
	return filepath.Join(p.keysDir(), p.provider+".disabled.txt")
}

func (p *KeyPool) load() {
	f, err := os.Open(p.keyPath())
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
		ks := &KeyState{Key: line, Disabled: p.disabled[line]}
		p.keys = append(p.keys, ks)
	}
}

func (p *KeyPool) loadDisabled() {
	f, err := os.Open(p.disabledPath())
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
		p.disabled[line] = true
	}
}

func (p *KeyPool) saveDisabled() error {
	os.MkdirAll(p.keysDir(), 0o755)
	f, err := os.Create(p.disabledPath())
	if err != nil {
		return err
	}
	defer f.Close()

	for key := range p.disabled {
		fmt.Fprintln(f, key)
	}
	return nil
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
//
// Key selection logic:
// - round_robin=false (default): always start from key[0], use first available. Failover to next on failure.
// - round_robin=true: advance pointer after each call, cycle through all keys (0→1→2→0→...).
//   Still skip disabled/cooldown keys and failover to next available.
//
// In both modes, failover and cooldown are always active:
// - Disabled keys are skipped.
// - Keys in cooldown period are skipped.
// - If all keys are cooling down and earliest cooldown is <5min, wait and retry.
func (p *KeyPool) Next() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.keys) == 0 {
		return "", fmt.Errorf("no API keys found for %s", p.provider)
	}

	now := time.Now()

	if p.isRoundRobin() {
		// Round-robin: advance pointer after each successful pick
		for i := 0; i < len(p.keys); i++ {
			idx := (p.current + i) % len(p.keys)
			ks := p.keys[idx]
			if ks.Disabled || now.Before(ks.CooldownEnd) {
				continue
			}
			p.current = (idx + 1) % len(p.keys)
			return ks.Key, nil
		}
	} else {
		// Default: always start from 0, use first available
		for i := 0; i < len(p.keys); i++ {
			ks := p.keys[i]
			if ks.Disabled || now.Before(ks.CooldownEnd) {
				continue
			}
			return ks.Key, nil
		}
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
				p.disabled[key] = true
				p.saveDisabled()
				return
			}

			ks.Failures++
			cooldown := calculateCooldown(ks.Failures)
			ks.CooldownEnd = time.Now().Add(cooldown)
			return
		}
	}
}

// DisableKey permanently disables a key and persists to disk.
func (p *KeyPool) DisableKey(key string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, ks := range p.keys {
		if ks.Key == key {
			ks.Disabled = true
			p.disabled[key] = true
			return p.saveDisabled()
		}
	}
	return fmt.Errorf("key not found")
}

// EnableKey re-enables a disabled key and removes from disk.
func (p *KeyPool) EnableKey(key string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, ks := range p.keys {
		if ks.Key == key {
			ks.Disabled = false
			ks.Failures = 0
			ks.CooldownEnd = time.Time{}
			delete(p.disabled, key)
			return p.saveDisabled()
		}
	}
	return fmt.Errorf("key not found")
}

// DisableKeyByIdx permanently disables a key by index and persists to disk.
func (p *KeyPool) DisableKeyByIdx(idx int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if idx < 0 || idx >= len(p.keys) {
		return fmt.Errorf("index %d out of range (0-%d)", idx, len(p.keys)-1)
	}

	ks := p.keys[idx]
	ks.Disabled = true
	p.disabled[ks.Key] = true
	return p.saveDisabled()
}

// EnableKeyByIdx re-enables a disabled key by index and persists to disk.
func (p *KeyPool) EnableKeyByIdx(idx int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if idx < 0 || idx >= len(p.keys) {
		return fmt.Errorf("index %d out of range (0-%d)", idx, len(p.keys)-1)
	}

	ks := p.keys[idx]
	ks.Disabled = false
	ks.Failures = 0
	ks.CooldownEnd = time.Time{}
	delete(p.disabled, ks.Key)
	return p.saveDisabled()
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
