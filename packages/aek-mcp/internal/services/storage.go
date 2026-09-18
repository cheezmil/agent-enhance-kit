package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/cheezmil/aek-mcp/internal/models"
	"golang.org/x/crypto/bcrypt"
)

type DataFile struct {
	Servers     map[string]*models.ServerConfig `json:"servers"`
	Groups      map[string]*models.Group        `json:"groups"`
	SystemCfg   *models.SystemConfig            `json:"systemConfig"`
	BearerKeys  map[string]*models.BearerKey    `json:"bearerKeys"`
	OAuthTokens []interface{}                   `json:"oauthTokens"`
	OAuthClient []interface{}                   `json:"oauthClients"`
}

type Storage struct {
	mu          sync.RWMutex
	users       map[string]*models.User
	servers     map[string]*models.ServerConfig
	groups      map[string]map[string]*models.Group // username -> {id -> *Group}
	activities  []*models.Activity
	logs        []*models.LogEntry
	bearerKeys  map[string]*models.BearerKey
	oauthClients map[string]*models.OAuthClient
	systemConfig *models.SystemConfig
	filePath    string
	logSubscribers []chan *models.LogEntry
}

var Store *Storage

func getDataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".aek", "mcp")
}

func getDataFilePath() string {
	return filepath.Join(getDataDir(), "db", "system", "data.json")
}

func getUserFilePath() string {
	return filepath.Join(getDataDir(), "settings", "system", "user.jsonc")
}

func InitStore() {
	filePath := getDataFilePath()

	Store = &Storage{
		users:        make(map[string]*models.User),
		servers:      make(map[string]*models.ServerConfig),
		groups:       make(map[string]map[string]*models.Group),
		activities:   make([]*models.Activity, 0),
		logs:         make([]*models.LogEntry, 0),
		bearerKeys:   make(map[string]*models.BearerKey),
		oauthClients: make(map[string]*models.OAuthClient),
		systemConfig: &models.SystemConfig{},
		filePath:     filePath,
	}

	Store.loadFromFile()
	Store.loadUsersFromFile()
	Store.initAllUserGroups()
}

func (s *Storage) loadFromFile() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var df DataFile
	if err := json.Unmarshal(data, &df); err != nil {
		fmt.Printf("[aek-mcp] Failed to parse data file: %v\n", err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if df.Servers != nil {
		s.servers = df.Servers
	}
	// Groups no longer live in data.json; loaded per-user by initAllUserGroups.
	if df.SystemCfg != nil {
		s.systemConfig = df.SystemCfg
	}
	if df.BearerKeys != nil {
		s.bearerKeys = df.BearerKeys
	}
}

func (s *Storage) saveToFile() {
	dir := filepath.Dir(s.filePath)
	os.MkdirAll(dir, 0755)

	df := DataFile{
		Servers:     s.servers,
		SystemCfg:   s.systemConfig,
		BearerKeys:  s.bearerKeys,
		OAuthTokens: []interface{}{},
		OAuthClient: []interface{}{},
	}
	data, err := json.MarshalIndent(df, "", "  ")
	if err != nil {
		fmt.Printf("[aek-mcp] Failed to marshal data: %v\n", err)
		return
	}
	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		fmt.Printf("[aek-mcp] Failed to write data file: %v\n", err)
	}
}

func (s *Storage) initDefaultAdmin() {
	s.users["admin"] = &models.User{
		Username: "admin",
		Password: "$2a$10$tjNREPjypfL62oMhL398AugKvLcOW42qR2o5oZGYAcs8hFX9UTRIi",
		Role:     "admin",
	}
}

// UserFileEntry represents a user entry in user.jsonc
type UserFileEntry struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Key      string `json:"key"`
}

// UserFileData is the structure of user.jsonc
type UserFileData struct {
	Users []UserFileEntry `json:"users"`
}

func generateKey() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (s *Storage) loadUsersFromFile() {
	path := getUserFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("[aek-mcp] No user.jsonc found at %s, using defaults\n", path)
		return
	}

	var userData UserFileData
	if err := json.Unmarshal(data, &userData); err != nil {
		fmt.Printf("[aek-mcp] Failed to parse user.jsonc: %v\n", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear existing users and load from file
	s.users = make(map[string]*models.User)
	needsSave := false
	for i, u := range userData.Users {
		// Auto-generate key if empty
		if u.Key == "" {
			userData.Users[i].Key = generateKey()
			u.Key = userData.Users[i].Key
			needsSave = true
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			fmt.Printf("[aek-mcp] Failed to hash password for user %s: %v\n", u.Username, err)
			continue
		}
		s.users[u.Username] = &models.User{
			Username:  u.Username,
			Password:  string(hashedPassword),
			Role:      u.Role,
			Key:       u.Key,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	}

	// Save back if keys were generated
	if needsSave {
		newData, _ := json.MarshalIndent(userData, "", "  ")
		os.WriteFile(path, newData, 0644)
	}

	fmt.Printf("[aek-mcp] Loaded %d users from user.jsonc\n", len(s.users))
}

// User operations
func (s *Storage) GetUser(username string) *models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.users[username]
}

func (s *Storage) GetUserByKey(key string) *models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Key == key {
			return u
		}
	}
	return nil
}

func (s *Storage) GetAllUsers() []*models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	users := make([]*models.User, 0, len(s.users))
	for _, u := range s.users {
		users = append(users, u)
	}
	return users
}

func (s *Storage) CreateUser(user *models.User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[user.Username] = user
}

func (s *Storage) UpdateUser(username string, user *models.User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[username] = user
}

func (s *Storage) DeleteUser(username string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.users, username)
}

// Server operations
func (s *Storage) GetServer(name string) *models.ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.servers[name]
}

func (s *Storage) GetAllServers() []*models.ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	servers := make([]*models.ServerConfig, 0, len(s.servers))
	for _, srv := range s.servers {
		servers = append(servers, srv)
	}
	return servers
}

func (s *Storage) GetServersPaginated(page, limit int) ([]*models.ServerConfig, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	servers := make([]*models.ServerConfig, 0, len(s.servers))
	for _, srv := range s.servers {
		servers = append(servers, srv)
	}
	total := len(servers)
	start := (page - 1) * limit
	if start >= total {
		return []*models.ServerConfig{}, total
	}
	end := start + limit
	if end > total {
		end = total
	}
	return servers[start:end], total
}

func (s *Storage) CreateServer(server *models.ServerConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.servers[server.Name] = server
	s.saveToFile()
}

func (s *Storage) UpdateServer(name string, server *models.ServerConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.servers[name] = server
	s.saveToFile()
}

func (s *Storage) DeleteServer(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.servers, name)
	s.saveToFile()
}

// GroupFile represents a single user's per-user groups file.
type GroupFile struct {
	Groups map[string]*models.Group `json:"groups"`
}

// Group operations (per-user, stored in ~/.aek/mcp/settings/user-custom-configuration/<username>/groups.jsonc)
func userCustomConfigRoot() string {
	h, _ := os.UserHomeDir()
	return filepath.Join(h, ".aek", "mcp", "settings", "user-custom-configuration")
}

func userCustomConfigDir(username string) string {
	return filepath.Join(userCustomConfigRoot(), username)
}

func userGroupsFilePath(username string) string {
	return filepath.Join(userCustomConfigDir(username), "groups.jsonc")
}

// loadUserGroups loads one user's groups from disk into memory.
// If the user has no file yet, initialises a default-only set.
func (s *Storage) loadUserGroups(username string) {
	if s.groups == nil {
		s.groups = make(map[string]map[string]*models.Group)
	}
	if _, ok := s.groups[username]; !ok {
		s.groups[username] = make(map[string]*models.Group)
	}
	uGroups := s.groups[username]

	data, err := os.ReadFile(userGroupsFilePath(username))
	if err == nil {
		var gf GroupFile
		if unmarshalErr := json.Unmarshal(data, &gf); unmarshalErr != nil {
			cleaned := StripJsoncComments(string(data))
			if unmarshalErr2 := json.Unmarshal([]byte(cleaned), &gf); unmarshalErr2 != nil {
				fmt.Printf("[aek-mcp] Failed to parse groups file for %s: %v\n", username, err)
			}
		}
		for id, g := range gf.Groups {
			if g.Servers == nil {
				g.Servers = []string{}
			}
			uGroups[id] = g
		}
	}
	// Ensure default group exists per user; populate a sensible default if first load.
	if s.groups[username] == nil {
		s.groups[username] = make(map[string]*models.Group)
	}
	if _, ok := s.groups[username]["default"]; !ok {
		s.groups[username]["default"] = &models.Group{
			ID:          "default",
			Name:        "default",
			Description: "Default group (all tools)",
			Servers:     []string{},
			AllowedTools: []string{},
		}
	}
}

func (s *Storage) saveUserGroups(username string) {
	if s.groups == nil || s.groups[username] == nil {
		return
	}
	dir := userCustomConfigDir(username)
	os.MkdirAll(dir, 0755)

	gf := GroupFile{Groups: s.groups[username]}
	data, err := json.MarshalIndent(gf, "", "  ")
	if err != nil {
		fmt.Printf("[aek-mcp] Failed to marshal groups for %s: %v\n", username, err)
		return
	}
	if err := os.WriteFile(userGroupsFilePath(username), data, 0644); err != nil {
		fmt.Printf("[aek-mcp] Failed to write groups for %s: %v\n", username, err)
	}
}

// initAllUserGroups loads groups for every known user on startup.
func (s *Storage) initAllUserGroups() {
	for _, u := range s.users {
		s.loadUserGroups(u.Username)
	}
	fmt.Printf("[aek-mcp] Loaded groups for %d user(s)\n", len(s.users))
}

func (s *Storage) GetGroup(username, id string) *models.Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.groups[username][id]
}

func (s *Storage) GetAllGroups(username string) []*models.Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	uGroups := s.groups[username]
	groups := make([]*models.Group, 0, len(uGroups))
	for _, g := range uGroups {
		if g.Servers == nil {
			g.Servers = []string{}
		}
		groups = append(groups, g)
	}
	return groups
}

func (s *Storage) GetGroupByName(username, name string) *models.Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, g := range s.groups[username] {
		if g.Name == name {
			return g
		}
	}
	return nil
}

func (s *Storage) CreateGroup(username string, group *models.Group) {
	if group.Servers == nil {
		group.Servers = []string{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.groups[username] == nil {
		s.groups[username] = make(map[string]*models.Group)
	}
	s.groups[username][group.ID] = group
	s.saveUserGroups(username)
}

func (s *Storage) UpdateGroup(username, id string, group *models.Group) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.groups[username][id] = group
	s.saveUserGroups(username)
}

// DeleteGroup returns nil on success, or a non-nil error message string if
// the group is protected from deletion (e.g. the built-in "default" group).
func (s *Storage) DeleteGroup(username, id string) *string {
	s.mu.Lock()
	defer s.mu.Unlock()
	g := s.groups[username][id]
	if g != nil && g.Name == "default" {
		msg := "default group cannot be deleted"
		return &msg
	}
	delete(s.groups[username], id)
	s.saveUserGroups(username)
	return nil
}

// Activity operations
func (s *Storage) AddActivity(activity *models.Activity) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.activities = append(s.activities, activity)
}

func (s *Storage) GetActivities(page, limit int) ([]*models.Activity, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	total := len(s.activities)
	start := (page - 1) * limit
	if start >= total {
		return []*models.Activity{}, total
	}
	end := start + limit
	if end > total {
		end = total
	}
	return s.activities[start:end], total
}

func (s *Storage) GetActivityByID(id string) *models.Activity {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, a := range s.activities {
		if a.ID == id {
			return a
		}
	}
	return nil
}

// Log operations
func (s *Storage) AddLog(entry *models.LogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = append(s.logs, entry)
	if len(s.logs) > 1000 {
		s.logs = s.logs[len(s.logs)-1000:]
	}
	for _, sub := range s.logSubscribers {
		select {
		case sub <- entry:
		default:
		}
	}
}

func (s *Storage) GetAllLogs() []*models.LogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*models.LogEntry, len(s.logs))
	copy(result, s.logs)
	return result
}

func (s *Storage) ClearLogs() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = make([]*models.LogEntry, 0)
}

func (s *Storage) SubscribeToLogs() chan *models.LogEntry {
	ch := make(chan *models.LogEntry, 64)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logSubscribers = append(s.logSubscribers, ch)
	return ch
}

func (s *Storage) UnsubscribeFromLogs(ch chan *models.LogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, sub := range s.logSubscribers {
		if sub == ch {
			s.logSubscribers = append(s.logSubscribers[:i], s.logSubscribers[i+1:]...)
			close(ch)
			break
		}
	}
}

// Bearer Key operations
func (s *Storage) GetBearerKey(id string) *models.BearerKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.bearerKeys[id]
}

func (s *Storage) GetAllBearerKeys() []*models.BearerKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	keys := make([]*models.BearerKey, 0, len(s.bearerKeys))
	for _, k := range s.bearerKeys {
		keys = append(keys, k)
	}
	return keys
}

func (s *Storage) CreateBearerKey(key *models.BearerKey) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bearerKeys[key.ID] = key
	s.saveToFile()
}

func (s *Storage) UpdateBearerKey(id string, key *models.BearerKey) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bearerKeys[id] = key
	s.saveToFile()
}

func (s *Storage) DeleteBearerKey(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.bearerKeys, id)
	s.saveToFile()
}

// System config operations
func (s *Storage) GetSystemConfig() *models.SystemConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.systemConfig
}

func (s *Storage) UpdateSystemConfig(config *models.SystemConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.systemConfig = config
	s.saveToFile()
}

func (s *Storage) AddLogEntry(entry *models.LogEntry) {
	entry.Timestamp = time.Now().UnixMilli()
	s.AddLog(entry)
}
