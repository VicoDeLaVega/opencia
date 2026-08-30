"""Turn a diffusion model's output into genuine low-resolution pixel art.

The doc this module implements is explicit about the failure mode to avoid:
an image that merely *resembles* pixel art (soft edges, no real pixel grid)
because it was generated at full resolution and never actually downsampled.
The fix is mechanical, not another prompt: downscale to the real native
resolution, optionally quantize the palette, and upscale with nearest-
neighbor only for display - never for the exported asset.
"""

from __future__ import annotations

from PIL import Image


def to_pixel_art(
    image: Image.Image,
    native_size: tuple[int, int],
    palette_size: int | None = None,
) -> Image.Image:
    """Downscale to the real pixel grid. Returns an image of exactly `native_size`."""
    small = image.resize(native_size, Image.LANCZOS)
    if palette_size:
        small = small.convert("RGB").quantize(colors=palette_size).convert("RGB")
    return small


def upscale_for_display(image: Image.Image, factor: int) -> Image.Image:
    """Nearest-neighbor upscale - for previewing/exporting at a larger size
    without ever blurring the pixel grid. Never use this for the canonical
    asset; only for display."""
    w, h = image.size
    return image.resize((w * factor, h * factor), Image.NEAREST)
