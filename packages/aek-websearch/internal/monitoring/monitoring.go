package monitoring

// Metrics 是最小监控占位。
type Metrics struct{}

// IncNoop 保持接口存在。
func (Metrics) IncNoop(_ string) {}
