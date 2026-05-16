"""Registered tools exposed to the LLM via Gradbot.

Each submodule defines a `TOOL: gradbot.ToolDef` and a `run(...)` coroutine.
Import them from `app.guide` to build the tool list and dispatch table.
"""
