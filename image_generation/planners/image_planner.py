"""Natural-language prompt -> validated ImageRequest, via a local LLM.

Uses Ollama's native structured-output support (`format=<json schema>`,
not free-text "please reply with JSON") - PROJECT.md in this repo already
documented that small local models fail schema validation when merely
*asked* to produce JSON (missing required fields, invalid types). Passing
the schema to Ollama constrains generation at decode time, not just via
prompting, which is considerably more reliable.

Model choice: PROJECT.md's own live tests found qwen3:8b unreliable for
structured multi-field output (schema violations, non-determinism) while
qwen3:32b succeeded consistently on comparable tasks. Default here follows
that finding; override via `model=` if you have a cloud/opencode-hosted
model available (also more reliable per PROJECT.md).
"""

from __future__ import annotations

import json

import requests

from image_generation.schemas.requests import ImageRequest

SYSTEM_PROMPT = """You turn a user's natural-language image request into a structured JSON object.

Modes:
- "image": general-purpose pictures (concept art, realistic scenes, illustrations, environments).
- "pixel_art": a single pixel-art image (icon, object, character, building, monster, weapon).
- "sprite": an animated game character (not yet implemented downstream - still classify honestly).
- "tileset": game tiles (not yet implemented downstream - still classify honestly).

Pick "pixel_art" whenever the request mentions pixel art, 8-bit/16-bit/SNES/JRPG-style, sprites as a
static image, or game icons. Pick "sprite" only when the request explicitly asks for an animation
(walk/idle/attack frames, multiple directions). Fill width/height/palette_size/transparent only if the
request implies a specific value; otherwise leave them null and the caller will apply mode defaults.
"""


def plan(
    nl_prompt: str,
    model: str = "qwen3:32b",
    ollama_url: str = "http://localhost:11434",
    num_ctx: int = 8192,
    retries: int = 1,
) -> ImageRequest:
    schema = ImageRequest.model_json_schema()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": nl_prompt},
        ],
        "format": schema,
        "options": {"num_ctx": num_ctx},
        "stream": False,
    }

    last_error: Exception | None = None
    for _ in range(retries + 1):
        resp = requests.post(f"{ollama_url}/api/chat", json=payload, timeout=180)
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        try:
            data = json.loads(content)
            data.setdefault("prompt", nl_prompt)
            return ImageRequest.model_validate(data)
        except Exception as e:  # noqa: BLE001 - deliberately broad, we retry then surface it
            last_error = e
            continue

    raise RuntimeError(
        f"planner model '{model}' failed to produce a valid ImageRequest after {retries + 1} attempt(s): {last_error}"
    )
