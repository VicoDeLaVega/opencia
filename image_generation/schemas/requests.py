"""Structured request schema the LLM planner must fill in.

Phase 1 (see ../README.md): `image` and `pixel_art` modes are fully wired
to the ComfyUI backend. `sprite` and `tileset` are accepted here (so the
planner/CLI can name them and fail with a clear message) but raise
NotImplementedError in the backend - character consistency, pose control,
and spritesheet assembly are real unsolved problems, not stubbed out.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["image", "pixel_art", "sprite", "tileset"]


class ImageRequest(BaseModel):
    mode: Mode = "image"
    prompt: str
    style: Optional[str] = None

    width: Optional[int] = None
    height: Optional[int] = None
    seed: Optional[int] = None
    batch_size: int = 1

    transparent: bool = False
    palette_size: Optional[int] = None

    # sprite-only fields - accepted, not yet acted on (see module docstring)
    sprite_width: Optional[int] = None
    sprite_height: Optional[int] = None
    directions: Optional[list[str]] = None
    animations: Optional[dict[str, int]] = None


class GenerationResult(BaseModel):
    request: ImageRequest
    output_path: str
    seed_used: int
    duration_seconds: float
    model: str
