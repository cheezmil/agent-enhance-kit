package ratelimit

import "sync"

// Limiter 是最小限流占位。
type Limiter struct {
	mu     sync.Mutex
	counts map[string]int
}

// New 创建限流器。
func New() *Limiter { return &Limiter{counts: make(map[string]int)} }

// Allow 总是允许，但会记录计数，后续可替换窗口逻辑。
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.counts[key]++
	return true
}

// Count 返回累计计数。
func (l *Limiter) Count(key string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.counts[key]
}
