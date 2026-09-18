package sessions

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"agent-enhance-kit/internal/persistence"
)

// Store 提供会话管理能力。
type Store struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	persist  *persistence.Store
}

// NewStore 创建内存会话存储。
func NewStore() *Store {
	return &Store{sessions: make(map[string]*Session)}
}

// NewStoreWithPersistence 创建带持久化的会话存储。
func NewStoreWithPersistence(p *persistence.Store) *Store {
	s := NewStore()
	s.persist = p
	return s
}

func randomSessionID() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return time.Now().Format("20060102150405")
	}
	return hex.EncodeToString(b[:])
}

// CreateSession 创建或返回已有会话。
func (s *Store) CreateSession(sessionID string) *Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sessionID == "" {
		sessionID = randomSessionID()
	}
	if existing, ok := s.sessions[sessionID]; ok {
		return existing
	}
	sess := &Session{ID: sessionID, CreatedAt: time.Now(), Queries: make([]QueryRecord, 0)}
	s.sessions[sessionID] = sess
	if s.persist != nil {
		s.persist.Put("sessions", s.sessions)
	}
	return sess
}

// GetSession 获取会话。
func (s *Store) GetSession(sessionID string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[sessionID]
	return sess, ok
}

// AddQuery 记录一次查询。
func (s *Store) AddQuery(sessionID, query, mode string, resultsCount int) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return nil, errors.New("session not found")
	}
	record := QueryRecord{
		Query:        query,
		Mode:         mode,
		Timestamp:    time.Now(),
		ResultsCount: resultsCount,
		ExtractedURLs: make([]string, 0),
	}
	sess.Queries = append(sess.Queries, record)
	if s.persist != nil {
		s.persist.Put("sessions", s.sessions)
	}
	return sess, nil
}

// AddExtractedURL 记录某次查询提取的 URL。
func (s *Store) AddExtractedURL(sessionID string, queryIndex int, url string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return errors.New("session not found")
	}
	if queryIndex < 0 || queryIndex >= len(sess.Queries) {
		return errors.New("query index out of range")
	}
	sess.Queries[queryIndex].ExtractedURLs = append(sess.Queries[queryIndex].ExtractedURLs, url)
	if s.persist != nil {
		s.persist.Put("sessions", s.sessions)
	}
	return nil
}

// ListSessions 列出所有会话。
func (s *Store) ListSessions() []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		result = append(result, sess)
	}
	return result
}
