package health

// Checker 提供最小健康检查。
type Checker struct{}

// Status 返回健康状态。
func (Checker) Status() string { return "ok" }
