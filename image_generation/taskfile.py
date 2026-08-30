"""Mechanically update one task's `files`/`status` field in a tasks.md.

Why this exists: PROJECT.md documents repeated, real failures of small
local models at precise structured edits (missing schema fields, wrong
JSON, forgotten updates). Rather than trust an executing agent to
correctly hand-edit a task's metadata line after calling this module, the
CLI does it itself - deterministic regex substitution, not another LLM
call. The agent's only job is to run the command written into the task's
`generate:` field verbatim.
"""

from __future__ import annotations

import re
from pathlib import Path

TASK_LINE = re.compile(r"^(- \[[ xX]\]\s+(\S+)\s+.*)$")


def update_task_line(tasks_md_path: str | Path, task_id: str, new_file: str, new_status: str | None = None) -> bool:
    """Append `new_file` to the given task's `files:` field (dedup), and
    optionally set its `status:` field. Returns True if the task line was
    found and updated, False otherwise (caller should treat that as a
    warning, not a hard failure - the image was still generated)."""
    path = Path(tasks_md_path)
    lines = path.read_text().split("\n")
    updated = False

    for i, line in enumerate(lines):
        m = TASK_LINE.match(line)
        if not m or m.group(2) != task_id:
            continue

        segments = line.split("|")
        for j, seg in enumerate(segments):
            key, _, val = seg.partition(":")
            key = key.strip()
            if key == "files":
                existing = [f.strip() for f in val.split(",") if f.strip() and f.strip().lower() != "none"]
                if new_file not in existing:
                    existing.append(new_file)
                segments[j] = f" files: {','.join(existing)} "
            elif key == "status" and new_status:
                segments[j] = f" status: {new_status} "
        lines[i] = "|".join(segments)
        updated = True
        break

    if updated:
        path.write_text("\n".join(lines))
    return updated
