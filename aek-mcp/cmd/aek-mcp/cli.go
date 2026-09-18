package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
)

// runCLI handles non-server subcommands so `aek mcp install|list|remove` works
// without starting the HTTP gateway. Invoked before flag parsing in main().
func runCLI(args []string) bool {
	if len(args) == 0 {
		return false
	}
	switch args[0] {
	case "install", "uninstall", "remove", "list", "agents", "prefs":
	default:
		return false
	}

	config.Load()
	services.InitStore()

	switch args[0] {
	case "install":
		return cmdInstall(args[1:])
	case "remove", "uninstall":
		return cmdRemove(args[1:])
	case "list", "agents":
		return cmdList(args[1:])
	case "prefs":
		return cmdPrefs(args[1:])
	}
	return false
}

func cmdInstall(args []string) bool {
	agents, all := parseAgentFlags(args, false)
	group := parseGroupFlag(args)

	if len(agents) == 0 && !all {
		printCLIUsage()
		return true
	}

	if all {
		for _, t := range services.AgentTools {
			if !t.GUIOnly {
				agents = append(agents, t.ID)
			}
		}
	}

	key := currentUserKey()
	mcpURL := services.BuildMcpURL("", key, group)
	fmt.Printf("[aek mcp] Installing aek-mcp into %d agent tool(s)\n", len(agents))
	fmt.Printf("[aek mcp] MCP URL: %s\n", mcpURL)

	ok := true
	for _, id := range agents {
		tool := services.GetAgentTool(id)
		if tool == nil {
			fmt.Printf("[aek mcp] ✗ %s: unknown agent\n", id)
			ok = false
			continue
		}
		if tool.GUIOnly {
			fmt.Printf("[aek mcp] • %s: GUI only, skipped (configure manually)\n", tool.Name)
			continue
		}
		if err := services.BackupConfig(tool.ConfigPath); err != nil {
			fmt.Printf("[aek mcp] ✗ %s: backup failed: %v\n", tool.Name, err)
			ok = false
			continue
		}
		if err := services.InstallAgentToConfig(tool, mcpURL); err != nil {
			fmt.Printf("[aek mcp] ✗ %s: %v\n", tool.Name, err)
			ok = false
			continue
		}
		fmt.Printf("[aek mcp] ✓ %s -> %s\n", tool.Name, tool.ConfigPath)
	}
	if !ok {
		os.Exit(1)
	}
	return true
}

func cmdRemove(args []string) bool {
	agents, all := parseAgentFlags(args, false)
	if len(agents) == 0 && !all {
		printCLIUsage()
		return true
	}
	if all {
		for _, t := range services.AgentTools {
			if !t.GUIOnly {
				agents = append(agents, t.ID)
			}
		}
	}
	fmt.Printf("[aek mcp] Removing aek-mcp from %d agent tool(s)\n", len(agents))
	ok := true
	for _, id := range agents {
		tool := services.GetAgentTool(id)
		if tool == nil {
			fmt.Printf("[aek mcp] ✗ %s: unknown agent\n", id)
			ok = false
			continue
		}
		if tool.GUIOnly {
			continue
		}
		if err := services.RemoveAgentFromConfig(tool); err != nil {
			fmt.Printf("[aek mcp] ✗ %s: %v\n", tool.Name, err)
			ok = false
			continue
		}
		state := "not present"
		if has, _ := services.AgentHasEntry(tool); has {
			state = "removed"
		} else {
			state = "clean"
		}
		fmt.Printf("[aek mcp] ✓ %s (%s)\n", tool.Name, state)
	}
	if !ok {
		os.Exit(1)
	}
	return true
}

func cmdList(args []string) bool {
	_ = args
	fmt.Println("[aek mcp] Agent tools:")
	found := false
	for i := range services.AgentTools {
		t := services.AgentTools[i]
		if t.GUIOnly {
			fmt.Printf("  %-16s %-14s GUI only (manual)\n", t.ID, t.Name)
			continue
		}
		installed := false
		if _, err := os.Stat(t.ConfigPath); err == nil {
			installed, _ = services.AgentHasEntry(&t)
		}
		mark := "  "
		if installed {
			mark = "✓ "
		}
		fmt.Printf("%s%-16s %-14s %s\n", mark, t.ID, t.Name, t.ConfigPath)
		found = true
	}
	_ = found
	return true
}

func cmdPrefs(args []string) bool {
	if len(args) == 0 {
		fmt.Println("Usage: aek mcp prefs <username> [--get|--set a,b]")
		return true
	}
	username := args[0]
	if username == "--" {
		username = currentUsername()
	}
	get := len(args) < 3 || args[1] == "--get"
	var toSet []string
	if len(args) >= 3 {
		get = false
		toSet = strings.Split(strings.TrimPrefix(args[2], "--set="), ",")
	}
	if get {
		prefs := services.LoadTutorialPrefs(username)
		fmt.Printf("[aek mcp] %s selected agents: %s\n", username, strings.Join(prefs.SelectedAgents, ", "))
		return true
	}
	cleaned := toSet
	prefs := &models.TutorialPrefs{SelectedAgents: cleaned}
	if err := services.SaveTutorialPrefs(username, prefs); err != nil {
		fmt.Printf("[aek mcp] ✗ failed to save prefs: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[aek mcp] ✓ saved %s prefs: %s\n", username, strings.Join(cleaned, ", "))
	return true
}

func parseAgentFlags(args []string, defaultAll bool) ([]string, bool) {
	agents := []string{}
	all := defaultAll
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "-a" || a == "--agents":
			if i+1 < len(args) {
				agents = append(agents, splitCsv(args[i+1])...)
				i++
			}
		case strings.HasPrefix(a, "--agents="):
			agents = append(agents, splitCsv(strings.TrimPrefix(a, "--agents="))...)
		case a == "--all":
			all = true
		case a == "-g" || a == "--group":
			// skip -g (group) here; handled by parseGroupFlag
			if i+1 < len(args) {
				i++
			}
		}
	}
	return agents, all
}

func parseGroupFlag(args []string) string {
	for i := 0; i < len(args); i++ {
		if (args[i] == "-g" || args[i] == "--group") && i+1 < len(args) {
			return args[i+1]
		}
		if strings.HasPrefix(args[i], "--group=") {
			return strings.TrimPrefix(args[i], "--group=")
		}
	}
	return ""
}

func splitCsv(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func currentUserKey() string {
	users := services.Store.GetAllUsers()
	for _, u := range users {
		if u.Role == "admin" {
			return u.Key
		}
	}
	if len(users) > 0 {
		return users[0].Key
	}
	return ""
}

func currentUsername() string {
	users := services.Store.GetAllUsers()
	for _, u := range users {
		if u.Role == "admin" {
			return u.Username
		}
	}
	if len(users) > 0 {
		return users[0].Username
	}
	return ""
}

func printCLIUsage() {
	fmt.Println("Usage:")
	fmt.Println("  aek mcp install --all                       install aek-mcp into all agents")
	fmt.Println("  aek mcp install -a claude-code,cursor       install into specific agents")
	fmt.Println("  aek mcp install -a claude-code -g chat      install with a specific group")
	fmt.Println("  aek mcp remove -a claude-code               remove aek-mcp from an agent")
	fmt.Println("  aek mcp remove --all                        remove from all agents")
	fmt.Println("  aek mcp list                                list agents and install status")
	fmt.Println("  aek mcp prefs <username> --get              show saved agent selection")
	fmt.Println("  aek mcp prefs <username> --set claude-code  save agent selection")
	fmt.Println("")
	fmt.Println("Agents: antigravity, claude-code, claude-desktop, cline, codex, continue, cursor,")
	fmt.Println("        hermes, kilocode, kiro, openclaw, opencode, pi, qoder, qwencode, vscode,")
	fmt.Println("        windsurf, workbuddy (cherry-studio, chatbox are GUI-only)")
}

// Ensure handlers import stays for shared helpers (ListTutorialAgents is
// referenced by tests; keep package graph consistent).
var _ = handlers.ListTutorialAgents