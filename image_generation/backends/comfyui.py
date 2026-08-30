"""ComfyUI HTTP API client.

Talks to a running `python main.py --listen 127.0.0.1 --port 8188` ComfyUI
process (see ../README.md for setup). This is a thin HTTP client - it does
not import torch or any ComfyUI internals, so it can live in a lightweight
venv separate from ComfyUI's own (heavy) one.
"""

from __future__ import annotations

import io
import time
import uuid

import requests
from PIL import Image

from image_generation.workflows.graphs import flux2_klein_text_to_image


class ComfyUIError(RuntimeError):
    pass


class ComfyUIBackend:
    def __init__(self, server_url: str = "http://127.0.0.1:8188", timeout: float = 300.0):
        self.server_url = server_url.rstrip("/")
        self.timeout = timeout

    def _submit(self, graph: dict) -> str:
        payload = {"prompt": graph, "client_id": str(uuid.uuid4())}
        resp = requests.post(f"{self.server_url}/prompt", json=payload, timeout=30)
        if resp.status_code != 200:
            raise ComfyUIError(f"POST /prompt failed ({resp.status_code}): {resp.text[:500]}")
        data = resp.json()
        if "error" in data:
            raise ComfyUIError(f"ComfyUI rejected the workflow: {data['error']}")
        return data["prompt_id"]

    def _wait(self, prompt_id: str) -> list[dict]:
        start = time.time()
        while time.time() - start < self.timeout:
            resp = requests.get(f"{self.server_url}/history/{prompt_id}", timeout=30)
            resp.raise_for_status()
            hist = resp.json()
            if prompt_id in hist:
                entry = hist[prompt_id]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise ComfyUIError(f"generation failed: {status}")
                for out in entry.get("outputs", {}).values():
                    if "images" in out:
                        return out["images"]
                if status.get("completed"):
                    raise ComfyUIError(f"prompt completed with no image output: {entry}")
            time.sleep(1.5)
        raise ComfyUIError(f"timed out after {self.timeout}s waiting for prompt {prompt_id}")

    def _fetch(self, image_ref: dict) -> Image.Image:
        resp = requests.get(
            f"{self.server_url}/view",
            params={"filename": image_ref["filename"], "subfolder": image_ref.get("subfolder", ""), "type": image_ref.get("type", "output")},
            timeout=60,
        )
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    def generate(
        self,
        prompt: str,
        unet: str,
        clip: str,
        vae: str,
        clip_type: str = "flux2",
        width: int = 1024,
        height: int = 1024,
        steps: int = 4,
        cfg: float = 1,
        seed: int | None = None,
        lora: str | None = None,
        lora_strength: float = 1.0,
    ) -> tuple[Image.Image, int, float]:
        """Text-to-image. Returns (image, seed_used, duration_seconds)."""
        graph, seed_used = flux2_klein_text_to_image(
            prompt=prompt, unet=unet, clip=clip, vae=vae, clip_type=clip_type,
            width=width, height=height, steps=steps, cfg=cfg, seed=seed,
            lora=lora, lora_strength=lora_strength,
        )
        t0 = time.time()
        prompt_id = self._submit(graph)
        images = self._wait(prompt_id)
        duration = time.time() - t0
        return self._fetch(images[0]), seed_used, duration

    def img2img(self, *args, **kwargs):
        raise NotImplementedError("img2img not implemented yet (phase 2, see README.md)")

    def inpaint(self, *args, **kwargs):
        raise NotImplementedError("inpaint not implemented yet (phase 2, see README.md)")

    def reference_generate(self, *args, **kwargs):
        raise NotImplementedError("reference-conditioned generation not implemented yet (phase 2, see README.md)")
