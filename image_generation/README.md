# Image Generation Module

Implements [../IMAGE_GENERATION_SETUP.md](../IMAGE_GENERATION_SETUP.md), phase 1 only
(see "Status" below): `Prompt → LLM planner → validated JSON → ComfyUI → image`.

## Status (2026-08-30)

**Working, tested live end-to-end:**
- `mode="image"` and `mode="pixel_art"` — text prompt → ComfyUI (FLUX.2-klein-4B) →
  PNG. Verified with the doc's own test prompts (JRPG potion icon, 32×48 knight).
- LLM planner (`planners/image_planner.py`) using Ollama's native structured-output
  (`format=<json schema>`), not just prompting for JSON.
- Pixel-art post-processing that actually downscales to a real pixel grid
  (`postprocess/pixel_art.py`) instead of trusting the model's "pixel art style".
- Background removal via corner flood-fill (`postprocess/transparency.py`).

**Not implemented yet** (real gaps, not stubbed as if they worked):
- `mode="sprite"` / `mode="tileset"` — raise `NotImplementedError`. Character
  consistency (IP-Adapter/ControlNet/pose), animation frame generation, spritesheet
  assembly, and vision-based validation are all still on the doc's roadmap.
- `img2img`, `inpaint`, `reference_generate` on `ComfyUIBackend` — same, explicit
  `NotImplementedError`.

## Setup

Requires a running ComfyUI (separate installation, separate venv — this module is
just an HTTP client and does not need torch):

```bash
# one-time, see git history for the exact commands used:
#   ~/Dev/ComfyUI  (python3.11 venv, torch with MPS support)
#   models placed in ComfyUI/models/{diffusion_models,text_encoders,vae,loras}/
cd ~/Dev/ComfyUI && source venv/bin/activate && python main.py --listen 127.0.0.1 --port 8188
```

Required model files (bf16, **not** fp8/fp4 — see below):

| File | Goes in | Source |
|---|---|---|
| `flux-2-klein-4b.safetensors` (7.75GB) | `models/diffusion_models/` | `Comfy-Org/vae-text-encorder-for-flux-klein-4b` |
| `qwen_3_4b.safetensors` (8.04GB) | `models/text_encoders/` | same repo |
| `flux2-vae.safetensors` (336MB) | `models/vae/` | same repo |
| `pixelart_flux2klein_PXART4.safetensors` (370MB) | `models/loras/` | `adirik/pixel-art-lora-flux.2-klein-4B` |

⚠️ **fp8/fp4 quantized weights do not work on Apple's MPS backend** —
`RuntimeError: Undefined type Float8_e4m3fn` (PyTorch's fp8 dequant kernels are
CUDA-only). Use the full-precision files above. They fit easily in 64GB unified
memory; generation is still fast (~7-9s per 512×512 image at 4 steps, once the
model is resident in memory).

Then, this module's own (lightweight) venv:

```bash
cd image_generation
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Ollama must be running locally for the LLM planner (`ollama serve`), with
`qwen3:32b` pulled — PROJECT.md's own live tests found `qwen3:8b` unreliable for
structured multi-field JSON (schema violations, non-determinism); `qwen3:32b`
was consistently reliable on comparable tasks. Override with `--planner-model` /
`planner_model=` if you have a bigger or cloud-hosted model available.

## Usage

```bash
source venv/bin/activate
python cli.py "a watercolor castle"
python cli.py "SNES style potion icon" --mode pixel_art
python cli.py "a black mage" --mode pixel_art --transparent
```

```python
from image_generation import api as image_generator
result = image_generator.generate(prompt="32x48 pixel-art black mage walking")
```

## Next (per IMAGE_GENERATION_SETUP.md's phased plan)

1. Sprite: canonical character reference + pose-controlled frame generation
2. Character/tile consistency (IP-Adapter or ControlNet - not chosen yet)
3. Spritesheet assembly + metadata export (Python-side, deterministic)
4. Vision-based frame validation
