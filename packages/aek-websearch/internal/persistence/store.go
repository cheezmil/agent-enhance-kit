package persistence

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Store 是一个简单的 JSON 落盘持久化层。
type Store struct {
	mu   sync.RWMutex
	path string
	data map[string]any
}

// NewStore 创建一个持久化层。
func NewStore(path string) *Store {
	return &Store{path: path, data: make(map[string]any)}
}

// Load 从磁盘加载。
func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.path == "" {
		return nil
	}
	bytes, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(bytes, &s.data)
}

// Save 写入磁盘。
func (s *Store) Save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, bytes, 0o644)
}

// Put 存储一个键。
func (s *Store) Put(key string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = value
}

// Get 读取一个键。
func (s *Store) Get(key string) (any, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	return v, ok
}

// Close 关闭持久化层并落盘。
func (s *Store) Close() error { return s.Save() }
