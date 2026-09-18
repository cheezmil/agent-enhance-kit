package quality

// Gate 表示内容质量门控。
type Gate struct{}

// Assess 返回一个最小可用的质量评估结果。
func (g Gate) Assess(text string) (bool, string) {
	if text == "" {
		return false, "empty"
	}
	return true, "ok"
}
