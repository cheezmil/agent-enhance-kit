package task

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ── Core types ─────────────────────────────────────────────────────────────

type TaskState struct {
	TaskID           string           `json:"aek_task_id"`
	Name             string           `json:"name"`
	Description      string           `json:"description"`
	Status           string           `json:"status"`
	CreatedAt        string           `json:"created_at"`
	UpdatedAt        string           `json:"updated_at"`
	CurrentPhaseID   string           `json:"current_phase_id"`
	CurrentStepID    string           `json:"current_step_id"`
	Phases           []Phase          `json:"phases"`
	PendingGates     []string         `json:"pending_gates"`
	Decisions        []Decision       `json:"decisions"`
	Relationships    []Relationship   `json:"relationships"`
	ArtifactSummaries []string        `json:"artifact_summaries"`
	SchemaVersion    int              `json:"schema_version"`
	MethodologyState MethodologyState `json:"methodology_state"`
	Rules            []RuleRef        `json:"rules"`
}

type Phase struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Steps []Step `json:"steps"`
}

type Step struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Description  string        `json:"description,omitempty"`
	Gate         *Gate         `json:"gate,omitempty"`
	Methodology  *Methodology  `json:"methodology,omitempty"`
	Verification *Verification `json:"verification,omitempty"`
}

type Gate struct {
	ID      string   `json:"id"`
	Question string  `json:"question"`
	Choices []string `json:"choices,omitempty"`
}

type Methodology struct {
	Type   string          `json:"type"`
	Config *MethodologyConfig `json:"config,omitempty"`
}

type MethodologyConfig struct {
	CoverageThreshold int  `json:"coverage_threshold,omitempty"`
	TestFirst         bool `json:"test_first,omitempty"`
	MinOptions        int  `json:"min_options,omitempty"`
}

type Verification struct {
	Commands []string `json:"commands"`
	MustPass bool     `json:"must_pass,omitempty"`
	Cwd      string   `json:"cwd,omitempty"`
}

type Decision struct {
	GateID     string `json:"gate_id"`
	Decision   string `json:"decision"`
	Comment    string `json:"comment,omitempty"`
	ApprovedAt string `json:"approved_at"`
}

type Relationship struct {
	TaskID       string `json:"aek_task_id"`
	Relationship string `json:"relationship"`
}

type MethodologyState struct {
	CurrentMethodology string         `json:"current_methodology"`
	TDDPhase           *string        `json:"tdd_phase,omitempty"`
	PlanFile           *string        `json:"plan_file,omitempty"`
	SubtaskProgress    SubtaskProgress `json:"subtask_progress"`
	LastVerification   *VerificationResult `json:"last_verification,omitempty"`
}

type SubtaskProgress struct {
	Total      int `json:"total"`
	Completed  int `json:"completed"`
	InProgress int `json:"in_progress"`
	Failed     int `json:"failed,omitempty"`
}

type VerificationResult struct {
	Passed    bool   `json:"passed"`
	Timestamp string `json:"timestamp"`
	Results   []CommandResult `json:"results"`
}

type CommandResult struct {
	Command  string `json:"command"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type RuleRef struct {
	ID string `json:"id"`
}

// ── Projects root ──────────────────────────────────────────────────────────

const SchemaVersion = 2

func ProjectsRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}
	return filepath.Join(cwd, ".aek", "aek-task-manager"), nil
}

// ── State file operations ──────────────────────────────────────────────────

func StatePath(projectsRoot, taskID string) string {
	return filepath.Join(projectsRoot, taskID, ".aek_task_state.json")
}

func TaskRoot(projectsRoot, taskID string) string {
	return filepath.Join(projectsRoot, taskID)
}

func LoadState(projectsRoot, taskID string) (*TaskState, error) {
	path := StatePath(projectsRoot, taskID)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s TaskState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &s, nil
}

func SaveState(projectsRoot, taskID string, s *TaskState) error {
	s.SchemaVersion = SchemaVersion
	s.UpdatedAt = utcnow()
	path := StatePath(projectsRoot, taskID)
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// ── Helpers ────────────────────────────────────────────────────────────────

func utcnow() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func HasGitRepo(projectsRoot, taskID string) bool {
	gitDir := filepath.Join(TaskRoot(projectsRoot, taskID), ".git")
	info, err := os.Stat(gitDir)
	return err == nil && info.IsDir()
}

func GetCurrentPhase(s *TaskState) string {
	for _, p := range s.Phases {
		if p.ID == s.CurrentPhaseID {
			return p.Name
		}
	}
	return s.CurrentPhaseID
}

func GetCurrentStep(s *TaskState) string {
	for _, p := range s.Phases {
		if p.ID == s.CurrentPhaseID {
			for _, st := range p.Steps {
				if st.ID == s.CurrentStepID {
					return st.Name
				}
			}
		}
	}
	return s.CurrentStepID
}

func GetCurrentStepObject(s *TaskState) *Step {
	for _, p := range s.Phases {
		if p.ID == s.CurrentPhaseID {
			for _, st := range p.Steps {
				if st.ID == s.CurrentStepID {
					return &st
				}
			}
		}
	}
	return nil
}

func FindPhaseIndex(s *TaskState) int {
	for i, p := range s.Phases {
		if p.ID == s.CurrentPhaseID {
			return i
		}
	}
	return -1
}

func FindStepIndex(s *TaskState, phaseIdx int) int {
	if phaseIdx < 0 || phaseIdx >= len(s.Phases) {
		return -1
	}
	for i, st := range s.Phases[phaseIdx].Steps {
		if st.ID == s.CurrentStepID {
			return i
		}
	}
	return -1
}