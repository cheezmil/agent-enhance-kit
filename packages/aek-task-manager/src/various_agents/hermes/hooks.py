"""Hook callbacks for AEK Task Manager — registered via ctx.register_hook()."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from ._utils import call_binary

logger = logging.getLogger(__name__)


def _get_active_task_id() -> str:
    """Return the active task ID for the current project, or empty."""
    result = call_binary("active-task")
    if result.get("ok") and result.get("aek_task_id"):
        return result["aek_task_id"]
    return ""


def _on_pre_llm_call(
    session_id: str,
    user_message: str,
    conversation_history: List[Any],
    is_first_turn: bool,
    model: str,
    platform: str,
    sender_id: str,
    **kwargs,
) -> Dict[str, Any]:
    """pre_llm_call hook — inject task context before each LLM call."""
    task_id = _get_active_task_id()
    if not task_id:
        return {}

    result = call_binary("status", {"aek_task_id": task_id})
    if not result.get("ok"):
        return {}

    lines = [
        "# AEK Task Manager -- Active Task",
        f"Task: `{task_id}`  Status: **{result.get('status', 'unknown')}**",
        f"Phase: {result.get('current_phase', '')}  Step: {result.get('current_step', '')}",
    ]
    pending = result.get("pending_gates") or []
    if pending:
        lines.append(f"Awaiting approval: {', '.join(pending)}")
    lines.append("")
    lines.append("Use `aek_task_status`, `aek_task_pause`, `aek_task_advance`, or `aek_task_approve` to manage this task.")

    return {"context": "\n".join(lines)}


def _on_session_start(
    session_id: str,
    model: str,
    platform: str,
    **kwargs,
) -> None:
    """on_session_start hook — no-op for subprocess mode."""
    logger.debug("AEK Task Manager on_session_start: session_id=%s", session_id)


def _on_pre_tool_call(tool_name: str, args: dict, **kwargs) -> dict | None:
    """pre_tool_call hook — block aek_task_advance when verification hasn't passed."""
    if tool_name != "aek_task_advance":
        return None
    task_id = _get_active_task_id()
    if not task_id:
        return None
    result = call_binary("status", {"aek_task_id": task_id})
    if not result.get("ok"):
        return None
    # Check last verification
    state = call_binary("state", {"aek_task_id": task_id})
    last_v = (state.get("methodology_state") or {}).get("last_verification")
    if not last_v or not last_v.get("passed", False):
        return {"action": "block", "message": "Current step requires verification that hasn't passed. Run aek_task_verify first."}
    return None


def _on_pre_verify(session_id: str, platform: str, model: str, coding: bool, attempt: int, final_response: str, changed_paths: list, **kwargs) -> dict | None:
    """pre_verify hook — keep the agent going when code was edited but verification hasn't passed."""
    if not coding:
        return None
    task_id = _get_active_task_id()
    if not task_id:
        return None
    state = call_binary("state", {"aek_task_id": task_id})
    last_v = (state.get("methodology_state") or {}).get("last_verification")
    if last_v and last_v.get("passed", False):
        return None
    return {"action": "continue", "message": "Edited code for a step that must pass verification. Run aek_task_verify before finishing."}