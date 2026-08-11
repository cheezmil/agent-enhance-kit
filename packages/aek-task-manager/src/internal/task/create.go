package task

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func HandleCreate(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	name, _ := args["name"].(string)
	if name == "" {
		return errResult("name is required")
	}
	desc, _ := args["description"].(string)

	phases := parsePhases(args["phases"])

	firstMethodology := "none"
	if len(phases) > 0 && len(phases[0].Steps) > 0 && phases[0].Steps[0].Methodology != nil {
		firstMethodology = phases[0].Steps[0].Methodology.Type
	}

	state := &TaskState{
		TaskID:         taskID,
		Name:           name,
		Description:    desc,
		Status:         "active",
		CreatedAt:      utcnow(),
		UpdatedAt:      utcnow(),
		CurrentPhaseID: firstPhaseID(phases),
		CurrentStepID:  firstStepID(phases),
		Phases:         phases,
		PendingGates:   []string{},
		Decisions:      []Decision{},
		Relationships:  []Relationship{},
		SchemaVersion:  SchemaVersion,
		MethodologyState: MethodologyState{
			CurrentMethodology: firstMethodology,
			SubtaskProgress:    SubtaskProgress{},
		},
		Rules: defaultRuleRefs(),
	}

	taskRoot := TaskRoot(projectsRoot, taskID)
	if err := os.MkdirAll(taskRoot, 0755); err != nil {
		return errResult("mkdir: " + err.Error())
	}

	gitignore := ".aek_task_state.json\n.aek_artifacts/\n.aek_executions/\n.aek_worktrees/\n.aek_metrics.jsonl\n__pycache__/\n*.pyc\n"
	if err := os.WriteFile(filepath.Join(taskRoot, ".gitignore"), []byte(gitignore), 0644); err != nil {
		return errResult("gitignore: " + err.Error())
	}

	exec.Command("git", "init", taskRoot).Run()
	exec.Command("git", "-C", taskRoot, "add", ".gitignore").Run()
	exec.Command("git", "-C", taskRoot, "commit", "-m", "Initial commit").Run()

	if err := SaveState(projectsRoot, taskID, state); err != nil {
		return errResult("save state: " + err.Error())
	}

	return map[string]interface{}{
		"ok":            true,
		"aek_task_id":   taskID,
		"name":          name,
		"status":        "active",
		"current_phase": state.CurrentPhaseID,
		"current_step":  state.CurrentStepID,
		"message":       fmt.Sprintf("Task '%s' created with %d phase(s).", name, len(phases)),
	}
}

func HandleStatus(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	verbose, _ := args["verbose"].(bool)

	state, err := LoadState(projectsRoot, taskID)
	if err != nil {
		return errResult("task not found: " + taskID)
	}

	result := map[string]interface{}{
		"ok":                 true,
		"aek_task_id":        taskID,
		"name":               state.Name,
		"description":        state.Description,
		"status":             state.Status,
		"current_phase":      GetCurrentPhase(state),
		"current_step":       GetCurrentStep(state),
		"pending_gates":      state.PendingGates,
		"relationships":      state.Relationships,
		"artifact_summaries": state.ArtifactSummaries,
	}

	if verbose {
		result["phases"] = state.Phases
		result["decisions"] = state.Decisions
		result["git_log"] = GitLog(projectsRoot, taskID, 20)
	}

	return result
}

func HandleList(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	statusFilter, _ := args["status_filter"].(string)
	if statusFilter == "" {
		statusFilter = "all"
	}

	tasks := []map[string]interface{}{}
	entries, err := os.ReadDir(projectsRoot)
	if err != nil {
		return map[string]interface{}{"ok": true, "tasks": tasks}
	}

	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		state, err := LoadState(projectsRoot, e.Name())
		if err != nil {
			continue
		}
		if statusFilter != "all" && state.Status != statusFilter {
			continue
		}
		tasks = append(tasks, map[string]interface{}{
			"aek_task_id":   state.TaskID,
			"name":          state.Name,
			"status":        state.Status,
			"current_phase": GetCurrentPhase(state),
			"current_step":  GetCurrentStep(state),
			"updated_at":    state.UpdatedAt,
		})
	}

	return map[string]interface{}{"ok": true, "tasks": tasks}
}

// ── Helpers ────────────────────────────────────────────────────────────────

func errResult(msg string) map[string]interface{} {
	return map[string]interface{}{"ok": false, "error": msg}
}

func parsePhases(raw interface{}) []Phase {
	if raw == nil {
		return []Phase{}
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return []Phase{}
	}
	var phases []Phase
	if err := json.Unmarshal(data, &phases); err != nil {
		return []Phase{}
	}
	return phases
}

func firstPhaseID(phases []Phase) string {
	if len(phases) > 0 {
		return phases[0].ID
	}
	return ""
}

func firstStepID(phases []Phase) string {
	if len(phases) > 0 && len(phases[0].Steps) > 0 {
		return phases[0].Steps[0].ID
	}
	return ""
}

func defaultRuleRefs() []RuleRef {
	ids := []string{"rule-1", "rule-2", "rule-3", "rule-4", "rule-5", "rule-6",
		"rule-7", "rule-8", "rule-9", "rule-10", "rule-11", "rule-12"}
	refs := make([]RuleRef, len(ids))
	for i, id := range ids {
		refs[i] = RuleRef{ID: id}
	}
	return refs
}

func GitLog(projectsRoot, taskID string, maxCount int) []map[string]string {
	taskRoot := TaskRoot(projectsRoot, taskID)
	if !HasGitRepo(projectsRoot, taskID) {
		return nil
	}
	cmd := exec.Command("git", "-C", taskRoot, "log", fmt.Sprintf("--max-count=%d", maxCount), "--oneline")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var log []map[string]string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		entry := map[string]string{"hash": parts[0]}
		if len(parts) > 1 {
			entry["message"] = parts[1]
		}
		log = append(log, entry)
	}
	return log
}