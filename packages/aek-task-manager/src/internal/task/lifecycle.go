package task

import (
	"fmt"
	"os/exec"
)

func HandleAdvance(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	commitMessage, _ := args["commit_message"].(string)

	state, err := LoadState(projectsRoot, taskID)
	if err != nil {
		return errResult("task not found: " + taskID)
	}

	// Check verification before advancing
	step := GetCurrentStepObject(state)
	if step != nil && step.Verification != nil && step.Verification.MustPass {
		lastV := state.MethodologyState.LastVerification
		if lastV == nil || !lastV.Passed {
			return map[string]interface{}{
				"ok":    false,
				"error": "Verification not passed. Run aek_task_verify before advancing.",
			}
		}
	}

	phaseIdx := FindPhaseIndex(state)
	if phaseIdx == -1 {
		state.Status = "completed"
		SaveState(projectsRoot, taskID, state)
		return map[string]interface{}{
			"ok": true, "status": "completed",
			"message": "All phases completed. Task finished!",
		}
	}

	stepIdx := FindStepIndex(state, phaseIdx)
	steps := state.Phases[phaseIdx].Steps

	currentPhaseID := state.CurrentPhaseID
	currentStepID := state.CurrentStepID

	nextPhaseID, nextStepID := currentPhaseID, currentStepID

	if stepIdx < len(steps)-1 {
		nextStepID = steps[stepIdx+1].ID
	} else if phaseIdx < len(state.Phases)-1 {
		nextPhaseID = state.Phases[phaseIdx+1].ID
		if len(state.Phases[phaseIdx+1].Steps) > 0 {
			nextStepID = state.Phases[phaseIdx+1].Steps[0].ID
		}
	} else {
		state.Status = "completed"
		SaveState(projectsRoot, taskID, state)
		return map[string]interface{}{
			"ok": true, "status": "completed",
			"message": "All phases completed. Task finished!",
		}
	}

	// Commit current work
	taskRoot := TaskRoot(projectsRoot, taskID)
	if HasGitRepo(projectsRoot, taskID) {
		msg := commitMessage
		if msg == "" {
			stepName := ""
			if stepIdx >= 0 && stepIdx < len(steps) {
				stepName = steps[stepIdx].Name
			}
			msg = fmt.Sprintf("WIP: [%s] %s", currentStepID, stepName)
		}
		exec.Command("git", "-C", taskRoot, "add", "-A").Run()
		exec.Command("git", "-C", taskRoot, "commit", "-m", msg).Run()
	}

	state.CurrentPhaseID = nextPhaseID
	state.CurrentStepID = nextStepID
	SaveState(projectsRoot, taskID, state)

	// Create branch for next step
	branchName := fmt.Sprintf("step/%s/%s", nextPhaseID, nextStepID)
	exec.Command("git", "-C", taskRoot, "checkout", "-b", branchName).Run()

	return map[string]interface{}{
		"ok":              true,
		"aek_task_id":     taskID,
		"previous_phase":  currentPhaseID,
		"previous_step":   currentStepID,
		"current_phase":   nextPhaseID,
		"current_step":    nextStepID,
		"message":         fmt.Sprintf("Advanced to %s/%s. New branch '%s' created.", nextPhaseID, nextStepID, branchName),
	}
}

func HandlePause(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}

	state, err := LoadState(projectsRoot, taskID)
	if err != nil {
		return errResult("task not found: " + taskID)
	}

	state.Status = "paused"
	SaveState(projectsRoot, taskID, state)

	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"status":      "paused",
		"message":     "Task paused.",
	}
}

func HandleResume(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}

	state, err := LoadState(projectsRoot, taskID)
	if err != nil {
		return errResult("task not found: " + taskID)
	}

	state.Status = "active"
	SaveState(projectsRoot, taskID, state)

	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"status":      "active",
		"message":     "Task resumed.",
	}
}

func HandleApprove(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	gateID, _ := args["gate_id"].(string)
	decision, _ := args["decision"].(string)
	comment, _ := args["comment"].(string)

	if gateID == "" {
		return errResult("gate_id is required")
	}

	state, err := LoadState(projectsRoot, taskID)
	if err != nil {
		return errResult("task not found: " + taskID)
	}

	// Remove gate from pending
	var pending []string
	for _, g := range state.PendingGates {
		if g != gateID {
			pending = append(pending, g)
		}
	}
	state.PendingGates = pending
	state.Decisions = append(state.Decisions, Decision{
		GateID:     gateID,
		Decision:   decision,
		Comment:    comment,
		ApprovedAt: utcnow(),
	})
	SaveState(projectsRoot, taskID, state)

	if decision == "Approve" {
		return HandleAdvance(projectsRoot, map[string]interface{}{
			"aek_task_id":   taskID,
			"commit_message": fmt.Sprintf("[Gate %s] Approved: %s", gateID, comment),
		})
	}

	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"gate_id":     gateID,
		"decision":    decision,
		"message":     fmt.Sprintf("Gate '%s' recorded as '%s'.", gateID, decision),
	}
}

// HandleCommit commits current working state
func HandleCommit(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	message, _ := args["message"].(string)
	if message == "" {
		return errResult("message is required")
	}

	taskRoot := TaskRoot(projectsRoot, taskID)
	if !HasGitRepo(projectsRoot, taskID) {
		return errResult("task is not a git repo")
	}

	exec.Command("git", "-C", taskRoot, "add", "-A").Run()
	cmd := exec.Command("git", "-C", taskRoot, "commit", "-m", message)
	out, _ := cmd.Output()

	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"message":     message,
		"commit_hash": string(out),
	}
}

// HandleBranch creates a new git branch
func HandleBranch(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	branchName, _ := args["branch_name"].(string)

	if branchName == "" {
		state, err := LoadState(projectsRoot, taskID)
		if err != nil {
			return errResult("task not found: " + taskID)
		}
		branchName = fmt.Sprintf("step/%s/%s", state.CurrentPhaseID, state.CurrentStepID)
	}

	taskRoot := TaskRoot(projectsRoot, taskID)
	cmd := exec.Command("git", "-C", taskRoot, "checkout", "-b", branchName)
	if err := cmd.Run(); err != nil {
		return errResult(fmt.Sprintf("failed to create branch '%s'", branchName))
	}

	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"branch_name": branchName,
		"message":     fmt.Sprintf("Branch '%s' created and checked out.", branchName),
	}
}

// HandleGitLog returns git log
func HandleGitLog(projectsRoot string, args map[string]interface{}) map[string]interface{} {
	taskID, _ := args["aek_task_id"].(string)
	if taskID == "" {
		return errResult("aek_task_id is required")
	}
	maxCount := 20
	if v, ok := args["max_count"].(int); ok {
		maxCount = v
	}

	log := GitLog(projectsRoot, taskID, maxCount)
	return map[string]interface{}{
		"ok":          true,
		"aek_task_id": taskID,
		"commits":     log,
	}
}