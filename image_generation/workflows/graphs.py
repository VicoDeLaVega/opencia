"""Parameterized ComfyUI API-format graphs.

The LLM never builds these - it only fills the ImageRequest schema.
Python assembles a fixed, tested node graph and substitutes the request's
values into it. This graph is the API-format equivalent of the official
"Text to Image (Flux.2 Klein 4B Distilled)" ComfyUI template
(comfyui_workflow_templates_json/templates/image_flux2_klein_text_to_image.json),
verified live on 2026-08-30 against a real ComfyUI server.
"""

from __future__ import annotations

import uuid


def flux2_klein_text_to_image(
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
) -> dict:
    if seed is None:
        seed = uuid.uuid4().int & 0xFFFFFFFFFFFF

    graph = {
        "70": {"class_type": "UNETLoader", "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "71": {"class_type": "CLIPLoader", "inputs": {"clip_name": clip, "type": clip_type, "device": "default"}},
        "72": {"class_type": "VAELoader", "inputs": {"vae_name": vae}},
        "74": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["71", 0], "text": prompt}},
        "76": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["74", 0]}},
        "61": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "62": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": width, "height": height}},
        "73": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "66": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "64": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["73", 0],
                "guider": ["63", 0],
                "sampler": ["61", 0],
                "sigmas": ["62", 0],
                "latent_image": ["66", 0],
            },
        },
        "65": {"class_type": "VAEDecode", "inputs": {"samples": ["64", 0], "vae": ["72", 0]}},
        "100": {"class_type": "SaveImage", "inputs": {"images": ["65", 0], "filename_prefix": "imagegen"}},
    }

    model_source = ["70", 0]
    if lora:
        graph["80"] = {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {"model": ["70", 0], "lora_name": lora, "strength_model": lora_strength},
        }
        model_source = ["80", 0]

    graph["63"] = {
        "class_type": "CFGGuider",
        "inputs": {"model": model_source, "positive": ["74", 0], "negative": ["76", 0], "cfg": cfg},
    }
    return graph, seed
