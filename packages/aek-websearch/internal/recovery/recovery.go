package recovery

// Resolver 提供死链恢复占位逻辑。
type Resolver struct{}

// Resolve 返回一个最小可用结果。
func (Resolver) Resolve(url string) string { return url }
