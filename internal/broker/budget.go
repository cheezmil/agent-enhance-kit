package broker

import (
	"agent-enhance-kit/internal/persistence"
	"sync"
	"time"

	"agent-enhance-kit/internal/models"
)

// BudgetTracker 追踪 provider 的用量。
type BudgetTracker struct {
	mu      sync.RWMutex
	usage   map[models.ProviderName][]usageRecord
	budgets map[models.ProviderName]float64
	persist *persistence.Store
}

type usageRecord struct {
	ts   time.Time
	cost float64
}

// NewBudgetTracker 创建预算追踪器。
func NewBudgetTracker() *BudgetTracker {
	return &BudgetTracker{
		usage:   make(map[models.ProviderName][]usageRecord),
		budgets: make(map[models.ProviderName]float64),
	}
}

// NewBudgetTrackerWithPersistence 创建带持久化的预算追踪器。
func NewBudgetTrackerWithPersistence(p *persistence.Store) *BudgetTracker {
	b := NewBudgetTracker()
	b.persist = p
	return b
}

// SetBudget 设置 provider 预算。
func (b *BudgetTracker) SetBudget(provider models.ProviderName, budget float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.budgets[provider] = budget
	if b.persist != nil {
		b.persist.Put("budgets", b.budgets)
	}
}

// RecordUsage 记录一次使用。
func (b *BudgetTracker) RecordUsage(provider models.ProviderName, cost float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.usage[provider] = append(b.usage[provider], usageRecord{ts: time.Now(), cost: cost})
	if b.persist != nil {
		b.persist.Put("usage", b.usage)
	}
}

// GetBudget 返回预算值。
func (b *BudgetTracker) GetBudget(provider models.ProviderName) *float64 {
	b.mu.RLock()
	defer b.mu.RUnlock()
	budget, ok := b.budgets[provider]
	if !ok {
		return nil
	}
	return &budget
}
