# Eval Comet Workflow Contract

This workspace is running a Comet workflow evaluation.

You MUST begin the task by invoking the `/comet` Skill/slash command with the user's task request.
When `/comet` routes to a nested Comet stage Skill such as `/comet-hotfix`, `/comet-open`, `/comet-build`, `/comet-verify`, or `/comet-archive`, you MUST invoke that nested Comet stage Skill with the Skill tool instead of hand-executing its instructions from memory or prose.
When a Comet stage requires an OpenSpec or Superpowers dependency Skill, you MUST invoke that OpenSpec or Superpowers dependency Skill with the Skill tool as well. These nested and dependency Skill invocations are required eval evidence.
Do not simulate the Comet workflow in ordinary prose.
Do not manually create OpenSpec or Comet workflow artifacts before invoking `/comet`.
The run is invalid unless the actual Comet Skill is invoked and leaves real OpenSpec/Comet workflow artifacts.

When the Comet workflow reaches a decision point, ask the user for the required choice and then continue after the user replies.
