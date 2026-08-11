package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/cheezmil/agent-enhance-kit/packages/aek-task-manager/src/internal/task"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println(`{"ok":false,"error":"usage: aek-task-manager <command> [json-args]"}`)
		os.Exit(1)
	}

	command := os.Args[1]
	var args map[string]interface{}
	if len(os.Args) > 2 {
		if err := json.Unmarshal([]byte(os.Args[2]), &args); err != nil {
			fmt.Fprintf(os.Stderr, `{"ok":false,"error":"invalid json: %s"}`, err)
			os.Exit(1)
		}
	}
	if args == nil {
		args = map[string]interface{}{}
	}

	projectsRoot, err := task.ProjectsRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"ok":false,"error":"%s"}`, err)
		os.Exit(1)
	}

	// Ensure projects root exists
	os.MkdirAll(projectsRoot, 0755)

	var result map[string]interface{}

	switch command {
	case "create":
		result = task.HandleCreate(projectsRoot, args)
	case "status":
		result = task.HandleStatus(projectsRoot, args)
	case "list":
		result = task.HandleList(projectsRoot, args)
	case "advance":
		result = task.HandleAdvance(projectsRoot, args)
	case "pause":
		result = task.HandlePause(projectsRoot, args)
	case "resume":
		result = task.HandleResume(projectsRoot, args)
	case "approve":
		result = task.HandleApprove(projectsRoot, args)
	case "commit":
		result = task.HandleCommit(projectsRoot, args)
	case "branch":
		result = task.HandleBranch(projectsRoot, args)
	case "git-log":
		result = task.HandleGitLog(projectsRoot, args)
	case "verify":
		result = notImplemented("verify")
	case "plan":
		result = notImplemented("plan")
	case "plan-update":
		result = notImplemented("plan-update")
	case "dispatch":
		result = notImplemented("dispatch")
	case "review":
		result = notImplemented("review")
	case "brainstorm":
		result = notImplemented("brainstorm")
	case "debug":
		result = notImplemented("debug")
	case "metrics":
		result = notImplemented("metrics")
	case "relate":
		result = notImplemented("relate")
	case "rules":
		result = notImplemented("rules")
	case "active-task":
		// Return empty active task (not tracked in subprocess mode)
		result = map[string]interface{}{"ok": true}
	case "state":
		// Return raw state for hooks
		taskID, _ := args["aek_task_id"].(string)
		if taskID == "" {
			result = errResult("aek_task_id is required")
		} else {
			state, err := task.LoadState(projectsRoot, taskID)
			if err != nil {
				result = errResult("task not found: " + taskID)
			} else {
				result = map[string]interface{}{
					"ok":              true,
					"methodology_state": state.MethodologyState,
				}
			}
		}
	default:
		result = notImplemented(fmt.Sprintf("unknown command: %s", command))
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	// Exit with code 1 on failure
	if !okResult(result) {
		os.Exit(1)
	}
}

func okResult(r map[string]interface{}) bool {
	ok, _ := r["ok"].(bool)
	return ok
}

func notImplemented(name string) map[string]interface{} {
	return map[string]interface{}{
		"ok":    false,
		"error": fmt.Sprintf("command '%s' not yet implemented in Go binary", name),
	}
}

func errResult(msg string) map[string]interface{} {
	return map[string]interface{}{"ok": false, "error": msg}
}