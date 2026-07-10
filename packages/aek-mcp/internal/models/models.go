package models

import "time"

type User struct {
	Username  string    `json:"username"`
	Password  string    `json:"-"`
	Role      string    `json:"role"`
	Key       string    `json:"key,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=6"`
}

type AuthResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	Message string `json:"message,omitempty"`
	User    *User  `json:"user,omitempty"`
}

type ServerConfig struct {
	Name               string                 `json:"name"`
	Type               string                 `json:"type"`
	Command            string                 `json:"command,omitempty"`
	URL                string                 `json:"url,omitempty"`
	Args               []string               `json:"args,omitempty"`
	Env                map[string]string      `json:"env,omitempty"`
	Enabled            bool                   `json:"enabled"`
	Status             string                 `json:"status,omitempty"`
	AuthorizationToken string                 `json:"authorizationToken,omitempty"`
	Tools              []ToolConfig           `json:"tools,omitempty"`
	Prompts            []PromptConfig         `json:"prompts,omitempty"`
	Resources          []ResourceConfig       `json:"resources,omitempty"`
	Config             map[string]interface{} `json:"config,omitempty"`
}

type ToolConfig struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Enabled     bool   `json:"enabled"`
}

type PromptConfig struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Enabled     bool   `json:"enabled"`
}

type ResourceConfig struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Enabled     bool   `json:"enabled"`
}

type Group struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Servers     []string `json:"servers"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type MarketServer struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Version     string   `json:"version,omitempty"`
	Author      string   `json:"author,omitempty"`
	Homepage    string   `json:"homepage,omitempty"`
	Repository  string   `json:"repository,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Category    string   `json:"category,omitempty"`
	Tools       []ToolConfig `json:"tools,omitempty"`
}

type CloudServer struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	URL         string   `json:"url,omitempty"`
	Author      string   `json:"author,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Category    string   `json:"category,omitempty"`
}

type Activity struct {
	ID        string    `json:"id"`
	Server    string    `json:"server"`
	Tool      string    `json:"tool"`
	Status    string    `json:"status"`
	Group     string    `json:"group,omitempty"`
	Username  string    `json:"username,omitempty"`
	KeyID     string    `json:"keyId,omitempty"`
	KeyName   string    `json:"keyName,omitempty"`
	Request   string    `json:"request,omitempty"`
	Response  string    `json:"response,omitempty"`
	Error     string    `json:"error,omitempty"`
	Duration  int64     `json:"duration,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type ActivityStats struct {
	TotalCalls   int64 `json:"totalCalls"`
	SuccessCalls int64 `json:"successCalls"`
	FailedCalls  int64 `json:"failedCalls"`
	AvgDuration  float64 `json:"avgDuration"`
}

type LogEntry struct {
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`
	Source    string `json:"source"`
	Message   string `json:"message"`
}

type RuntimeConfig struct {
	BasePath string `json:"basePath"`
	Version  string `json:"version"`
	Name     string `json:"name"`
}

type SystemConfig struct {
	Routing       map[string]interface{} `json:"routing,omitempty"`
	Install       map[string]interface{} `json:"install,omitempty"`
	SmartRouting  map[string]interface{} `json:"smartRouting,omitempty"`
	NameSeparator string                 `json:"nameSeparator,omitempty"`
	Auth          map[string]interface{} `json:"auth,omitempty"`
}

type ApiResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type PaginatedResponse struct {
	Success    bool        `json:"success"`
	Data       interface{} `json:"data,omitempty"`
	Pagination *Pagination `json:"pagination,omitempty"`
}

type Pagination struct {
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

type ToolCallRequest struct {
	ToolName  string                 `json:"toolName"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

type PromptCallRequest struct {
	PromptName string                 `json:"promptName"`
	Arguments  map[string]interface{} `json:"arguments,omitempty"`
	Name       string                 `json:"name,omitempty"`
}

type BearerKey struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Key            string    `json:"key,omitempty"`
	Token          string    `json:"token,omitempty"`
	Scope          string    `json:"scope,omitempty"`
	Kind           string    `json:"kind,omitempty"`
	Owner          string    `json:"owner,omitempty"`
	AccessType     string    `json:"accessType,omitempty"`
	AllowedGroups  []string  `json:"allowedGroups,omitempty"`
	AllowedServers []string  `json:"allowedServers,omitempty"`
	Enabled        bool      `json:"enabled"`
	CreatedAt      time.Time `json:"createdAt"`
}

type OAuthClient struct {
	ClientID     string   `json:"clientId"`
	ClientSecret string   `json:"clientSecret,omitempty"`
	Name         string   `json:"name"`
	RedirectURIs []string `json:"redirectUris"`
	Enabled      bool     `json:"enabled"`
	CreatedAt    time.Time `json:"createdAt"`
}

type TemplateExport struct {
	Name      string         `json:"name"`
	Servers   []ServerConfig `json:"servers,omitempty"`
	Groups    []Group        `json:"groups,omitempty"`
	CreatedAt time.Time      `json:"createdAt"`
}
