---
name: aek-task-manager
description: Use when managing long-running tasks with approval gates — create, advance, pause, resume, approve, verify, plan, dispatch.
license: MIT
metadata:
  hermes:
    tags: [aek, task, task-manager, approval, git]
---

# aek-task-manager

## Overview

Long-running task management with per-task Git repos, human-in-the-loop approval gates, and cross-session recovery. Core logic is a Go binary (`aek-task-manager`) callable from any agent (Hermes, OpenCode, Claude Code, etc.). Data lives in `<cwd>/.aek/aek-task-manager/<task_id>/`.

## When to Use

- Need to break a large job into phases/steps with approval gates
- Need a task that survives across sessions (resume later)
- Need per-task Git history and artifact tracking
- Need to run methodology workflows (TDD, brainstorm, plan, review, debug)

## Tools

All tools are registered in the agent as `aek_task_*`:

| Tool | Purpose |
|------|---------|
| `aek_task_create` | Create a task with phases/steps |
| `aek_task_status` | Show current task state |
| `aek_task_list` | List tasks in current project |
| `aek_task_advance` | Move to next step/phase |
| `aek_task_pause` | Pause a task |
| `aek_task_resume` | Resume a paused task |
| `aek_task_approve` | Record approval decision for a gate |
| `aek_task_commit` | Commit current working state |
| `aek_task_branch` | Create branch for next step |
| `aek_task_git_log` | Show task repo git log |
| `aek_task_verify` | Run verification commands |
| `aek_task_plan` | Generate subtask plan |
| `aek_task_plan_update` | Update subtask status |
| `aek_task_dispatch` | Dispatch a subtask |
| `aek_task_review` | Review current step/phase |
| `aek_task_brainstorm` | Brainstorm design options |
| `aek_task_debug` | Structured debugging |
| `aek_task_metrics` | Show task metrics |
| `aek_task_relate` | Link related tasks |
| `aek_task_rules` | Manage development rules |

## Usage

### Create a task

```json
{"aek_task_id": "my-task", "name": "My Task", "phases": [{"id": "p1", "name": "Phase 1", "steps": [{"id": "s1", "name": "Step 1"}]}]}
```

### Data path

Tasks are stored per-project: `<cwd>/.aek/aek-task-manager/<task_id>/`. Each task is its own Git repo. The state file is `.aek_task_state.json`.

## Verification

- `aek_task_status` returns the current phase/step
- `aek_task_list` shows all tasks in the project
- Task Git repo exists at `~/.aek/aek-task-manager/<task_id>/.git`