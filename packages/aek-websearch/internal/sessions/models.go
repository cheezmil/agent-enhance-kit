package sessions

import "time"

// QueryRecord 记录一次查询。
type QueryRecord struct {
	Query         string    `json:"query"`
	Mode          string    `json:"mode"`
	Timestamp     time.Time `json:"timestamp"`
	ResultsCount  int       `json:"results_count"`
	ExtractedURLs []string  `json:"extracted_urls"`
}

// Session 表示一个搜索会话。
type Session struct {
	ID        string       `json:"id"`
	CreatedAt time.Time    `json:"created_at"`
	Queries   []QueryRecord `json:"queries"`
}

// ExtractedURLs 返回会话中所有提取过的 URL。
func (s *Session) ExtractedURLs() []string {
	urls := make([]string, 0)
	for _, q := range s.Queries {
		urls = append(urls, q.ExtractedURLs...)
	}
	return urls
}
