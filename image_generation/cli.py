#!/usr/bin/env python3
"""CLI for testing the image generation module.

    imagegen "cyberpunk city at night"
    imagegen "SNES style potion icon" --mode pixel_art
    imagegen "black mage" --mode pixel_art --width 512 --transparent
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make `from image_generation import ...` work no matter how this file is
# invoked (`python image_generation/cli.py`, `python cli.py` from inside the
# directory, etc.) - not just via `python -m image_generation.cli` from the
# repo root. Tasks' `generate:` commands (see the task-graph schema) call
# this file by relative path directly, so this has to be self-sufficient.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from image_generation import api


def main() -> int:
    parser = argparse.ArgumentParser(prog="imagegen")
    parser.add_argument("prompt")
    parser.add_argument("--mode", choices=["image", "pixel_art", "sprite", "tileset"], default=None)
    parser.add_argument("--width", type=int, default=None)
    parser.add_argument("--height", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--transparent", action="store_true")
    parser.add_argument("--palette-size", type=int, default=None, dest="palette_size")
    parser.add_argument("--server-url", default="http://127.0.0.1:8188")
    parser.add_argument("--planner-model", default="qwen3:32b")
    parser.add_argument("--task-file", default=None, help="tasks.md to update with the output path (see taskfile.py)")
    parser.add_argument("--task-id", default=None, help="task number (e.g. 1.1) within --task-file to update")
    args = parser.parse_args()

    kwargs = {}
    if args.width is not None:
        kwargs["width"] = args.width
    if args.height is not None:
        kwargs["height"] = args.height
    if args.seed is not None:
        kwargs["seed"] = args.seed
    if args.transparent:
        kwargs["transparent"] = True
    if args.palette_size is not None:
        kwargs["palette_size"] = args.palette_size

    try:
        result = api.generate(
            args.prompt,
            mode=args.mode,
            server_url=args.server_url,
            planner_model=args.planner_model,
            **kwargs,
        )
    except NotImplementedError as e:
        print(f"Not implemented: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"Generation failed: {e}", file=sys.stderr)
        return 1

    print(f"mode={result.request.mode} seed={result.seed_used} duration={result.duration_seconds:.1f}s")
    print(result.output_path)

    if args.task_file and args.task_id:
        from pathlib import Path

        from image_generation.taskfile import update_task_line

        # `files:` entries are project-root-relative (see
        # openspec/schemas/task-graph/schema.yaml) - image_generation's own
        # output_path is absolute, so convert before writing it in.
        project_root = Path(__file__).resolve().parent.parent
        rel_path = Path(result.output_path).resolve().relative_to(project_root)

        found = update_task_line(args.task_file, args.task_id, str(rel_path), new_status="in_review")
        if found:
            print(f"updated task {args.task_id} in {args.task_file}: files += {rel_path}, status -> in_review")
        else:
            print(f"WARNING: task {args.task_id} not found in {args.task_file} - files field not updated", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
