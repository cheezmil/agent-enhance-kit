package auth

import (
	"net"
	"os"
	"strings"
)

// Config 保存最小认证配置。
type Config struct {
	CallerAPIKey string
	AdminAPIKey  string
}

// Load reads auth config from environment variables.
func Load() Config {
	caller := strings.TrimSpace(os.Getenv("AEK_API_KEY"))
	admin := strings.TrimSpace(os.Getenv("AEK_ADMIN_API_KEY"))
	if admin == "" {
		admin = caller
	}
	return Config{CallerAPIKey: caller, AdminAPIKey: admin}
}

// IsLocalClient 判断是否为本地访问。
func IsLocalClient(host string) bool {
	if host == "" {
		return false
	}
	if host == "localhost" || host == "testclient" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// ExtractToken 从常见 header 中提取 token。
func ExtractToken(authHeader, apiKeyHeader, adminKeyHeader string) string {
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		if token := strings.TrimSpace(authHeader[7:]); token != "" {
			return token
		}
	}
	if token := strings.TrimSpace(apiKeyHeader); token != "" {
		return token
	}
	return strings.TrimSpace(adminKeyHeader)
}
