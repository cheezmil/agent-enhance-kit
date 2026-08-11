"""AEK Task Manager — Hermes Agent plugin (thin subprocess wrapper around Go binary).

Per-task Git repos with human-in-the-loop approval gates and cross-session
recovery. All core logic lives in the Go binary (aek-task-manager).
This Python module is a thin forwarding layer.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

from . import _utils  # noqa: E402

from .schemas import ALL_TOOL_SCHEMAS  # noqa: F401, E402
from .handlers import _tool_handlers  # noqa: F401, E402
from .hooks import _on_pre_llm_call, _on_pre_tool_call, _on_pre_verify, _on_session_start  # noqa: F401, E402

# ── Slash command handler ───────────────────────────────────────────────────

_HELP_TEXT = """\
AekTaskManager — long-running task management

Usage: /aek-task-manager <command>

Commands:
  update    Check for updates and install the latest release
  version   Show current installed version
  help      Show this help message
"""


def _handle_aek_task_manager_command(raw_args: str) -> Optional[str]:
    argv = raw_args.strip().split()
    sub = argv[0] if argv else "help"

    if sub in ("help", "-h", "--help"):
        return _HELP_TEXT

    if sub == "version":
        return "AekTaskManager v2.2.1"

    if sub == "update":
        return "Update not supported in subprocess mode. Rebuild from source."

    return f"Unknown command: {sub}\n\n{_HELP_TEXT}"


def register(ctx) -> None:
    """Register AEK Task Manager as a Hermes user plugin."""
    logger.debug("AekTaskManagerPlugin registering")

    # ── Tools ────────────────────────────────────────────────────────────────
    for schema in ALL_TOOL_SCHEMAS:
        tool_name = schema["name"]
        handler = _tool_handlers.get(tool_name)
        if not handler:
            logger.warning("No handler registered for tool: %s", tool_name)
            continue
        ctx.register_tool(
            name=tool_name,
            toolset="aek-task-manager",
            schema=schema,
            handler=lambda args, _handler=handler, **kw: json.dumps(_handler(args, **kw), ensure_ascii=False),
            description=schema.get("description", ""),
        )
        logger.debug("Registered tool: %s", tool_name)

    # ── Hooks ───────────────────────────────────────────────────────────────
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("pre_verify", _on_pre_verify)
    ctx.register_hook("on_session_start", _on_session_start)

    # ── Slash command ──────────────────────────────────────────────────────
    ctx.register_command(
        "aek-task-manager",
        handler=_handle_aek_task_manager_command,
        description="AekTaskManager management: update, version, help",
        args_hint="[update|version|help]",
    )

    logger.info("AEK Task Manager plugin registered (tools=%d, hooks=4, command=/aek-task-manager)", len(_tool_handlers))