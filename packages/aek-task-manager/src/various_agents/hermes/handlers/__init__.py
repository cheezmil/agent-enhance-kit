"""Thin tool handlers — all delegate to the Go binary via subprocess."""
from __future__ import annotations

from typing import Any, Dict

from .._utils import call_binary, _validate_task_id

# Command map: tool name -> Go binary subcommand
TOOL_COMMAND_MAP = {
    "aek_task_create": "create",
    "aek_task_status": "status",
    "aek_task_list": "list",
    "aek_task_advance": "advance",
    "aek_task_pause": "pause",
    "aek_task_resume": "resume",
    "aek_task_approve": "approve",
    "aek_task_commit": "commit",
    "aek_task_branch": "branch",
    "aek_task_git_log": "git-log",
    "aek_task_verify": "verify",
    "aek_task_plan": "plan",
    "aek_task_plan_update": "plan-update",
    "aek_task_dispatch": "dispatch",
    "aek_task_review": "review",
    "aek_task_brainstorm": "brainstorm",
    "aek_task_debug": "debug",
    "aek_task_metrics": "metrics",
    "aek_task_relate": "relate",
    "aek_task_rules": "rules",
}


def _handle_tool(tool_name: str, args: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
    command = TOOL_COMMAND_MAP.get(tool_name)
    if not command:
        return {"ok": False, "error": f"No handler for {tool_name}"}
    return call_binary(command, args)


def _handle_aek_task_create(args: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
    task_id = args.get("aek_task_id", "")
    err = _validate_task_id(task_id)
    if err:
        return {"ok": False, "error": err}
    return call_binary("create", args)


# Build handler registry — all tools forward to Go binary
_tool_handlers = {}
for tool_name in TOOL_COMMAND_MAP:
    if tool_name == "aek_task_create":
        _tool_handlers[tool_name] = _handle_aek_task_create
    else:
        _tool_handlers[tool_name] = lambda args, _n=tool_name, **kw: _handle_tool(_n, args, **kw)

__all__ = ["_tool_handlers"]