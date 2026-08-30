#!/usr/bin/env python3
"""CLI for testing the image generation module.

    imagegen "cyberpunk city at night"
    imagegen "SNES style potion icon" --mode pixel_art
    imagegen "black mage" --mode pixel_art --width 512 --transparent
"""

from __future__ import annotations

import argparse
import sys

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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
