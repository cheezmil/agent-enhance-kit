package diagnostics

// Checker 提供诊断入口。
type Checker struct{}

// Run 返回一组简单诊断信息。
func (Checker) Run() map[string]string {
	return map[string]string{"status": "ok"}
}
