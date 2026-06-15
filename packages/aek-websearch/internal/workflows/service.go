package workflows

// Service 是工作流入口的占位实现。
type Service struct{}

// NewService 创建工作流服务。
func NewService() *Service { return &Service{} }
