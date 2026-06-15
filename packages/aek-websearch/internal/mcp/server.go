package mcp

import "fmt"

// Server 是最小 MCP 占位实现。
type Server struct{}

// NewServer 创建 MCP Server。
func NewServer() *Server { return &Server{} }

// Serve 启动 MCP 服务。
func (s *Server) Serve() error {
	fmt.Println("aek mcp server ready")
	return nil
}
