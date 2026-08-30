"""Top-level Python API: image_generator.generate(...).

    from image_generation import api as image_generator
    result = image_generator.generate(prompt="32x48 pixel-art black mage walking")
    result = image_generator.generate(prompt="black mage", mode="pixel_art", width=512)
"""

from __future__ import annotations

import time
from pathlib import Path

import yaml

from image_generation.backends.comfyui import ComfyUIBackend
from image_generation.planners.image_planner import plan
from image_generation.postprocess.pixel_art import to_pixel_art
from image_generation.postprocess.transparency import remove_background
from image_generation.schemas.requests import GenerationResult, ImageRequest

_CONFIG_PATH = Path(__file__).parent / "config" / "models.yaml"
_OUTPUT_DIR = Path(__file__).parent / "outputs"


def _load_model_config() -> dict:
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)


def generate(
    prompt: str,
    mode: str | None = None,
    server_url: str = "http://127.0.0.1:8188",
    planner_model: str = "qwen3:32b",
    **overrides,
) -> GenerationResult:
    models = _load_model_config()

    if mode is None:
        # No explicit mode: let the LLM planner infer the whole request from
        # the natural-language prompt (doc's default `imagegen "prompt"` case).
        request = plan(prompt, model=planner_model)
    else:
        # Explicit control (doc's "also allow explicit control" case): build
        # the request directly, no LLM call needed.
        request = ImageRequest(mode=mode, prompt=prompt, **overrides)

    if request.mode not in ("image", "pixel_art"):
        raise NotImplementedError(
            f"mode '{request.mode}' is not implemented yet - only 'image' and 'pixel_art' are wired "
            f"to the backend so far (see README.md 'Status'). Character/tile consistency, pose control "
            f"and spritesheet assembly are real unsolved problems, not stubbed."
        )

    cfg = models[request.mode]
    width = request.width or cfg["width"]
    height = request.height or cfg["height"]

    backend = ComfyUIBackend(server_url=server_url)
    image, seed_used, duration = backend.generate(
        prompt=(cfg.get("trigger", "") + request.prompt) if request.mode == "pixel_art" else request.prompt,
        unet=cfg["unet"],
        clip=cfg["clip"],
        vae=cfg["vae"],
        clip_type=cfg["clip_type"],
        width=width,
        height=height,
        steps=cfg["steps"],
        cfg=cfg["cfg"],
        seed=request.seed,
        lora=cfg.get("lora"),
        lora_strength=cfg.get("lora_strength", 1.0),
    )

    if request.mode == "pixel_art":
        native = (cfg["native_size"], cfg["native_size"])
        image = to_pixel_art(image, native, palette_size=request.palette_size)

    if request.transparent:
        image = remove_background(image)

    _OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = _OUTPUT_DIR / f"{request.mode}_{seed_used}.png"
    image.save(out_path)

    return GenerationResult(
        request=request,
        output_path=str(out_path),
        seed_used=seed_used,
        duration_seconds=duration,
        model=cfg["unet"],
    )
