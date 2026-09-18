package egress

// Selector 代表一个简单的 egress 选择器。
type Selector struct{}

// PreferResidential 目前仅返回固定值，后续接入拓扑感知。
func (s Selector) PreferResidential(domain string, taskType string) bool {
	return false
}
