# Local Image Generation Module — Installation and Integration Spec

## Goal

Add a fully local image-generation module to this project.

The system must support normal image generation, but it must also work very well for game-development tasks, especially:

- pixel art
- game characters
- sprites
- spritesheets
- tilesets
- icons
- game backgrounds
- UI assets

The final user experience should be simple: the user enters a natural-language prompt, and the system decides which image-generation workflow to run.

Examples:

- "A cyberpunk city at night"
- "A realistic red sports car in the rain"
- "16-bit Japanese RPG forest tileset"
- "32x48 pixel-art knight, 4 directions, idle/walk/attack"
- "SNES-style inventory icons"
- "Top-down RPG village tileset"

Everything must run locally on the machine.

---

## Architecture

Use this architecture:

User Prompt
    ↓
Local LLM
    ↓
Image Request Planner
    ↓
Structured JSON Request
    ↓
Workflow Router
    ↓
Image Generation Backend
    ↓
Post Processing
    ↓
Final Images / Sprites / Metadata

The LLM acts as the controller.

The LLM should NOT be responsible for generating the pixels itself unless a local multimodal/image model is explicitly selected as the backend.

The actual image generation should be handled by dedicated local image models.

Prefer ComfyUI as the main image-generation backend because it provides flexible workflows and an API that can be controlled programmatically.

The rest of the application should communicate with ComfyUI through Python.

---

# Main Requirements

The module must support at least:

- text-to-image
- image-to-image
- image reference conditioning
- inpainting
- reproducible seeds
- custom resolutions
- style presets
- transparent background when possible
- batch generation
- pixel-art generation
- sprite generation
- spritesheet generation
- tileset generation
- icon generation

The architecture must be modular enough that image models can be changed later without rewriting the application.

---

# LLM Role

Use a local LLM such as Qwen through Ollama or another local inference backend.

The LLM receives the user's natural-language request.

It must convert that request into structured generation parameters.

Example input:

"Create a 32x48 Japanese RPG knight from 1992 with four directions, walk, idle and sword attack animations."

Possible structured output:

```json
{
  "mode": "sprite",
  "prompt": "armored knight with red cape",
  "style": "1992 Japanese 16-bit RPG",
  "sprite_width": 32,
  "sprite_height": 48,
  "directions": [
    "down",
    "left",
    "right",
    "up"
  ],
  "animations": {
    "idle": 2,
    "walk": 4,
    "attack": 6
  },
  "transparent": true,
  "palette_size": 24
}
```

The structured schema should be validated before being passed to the image pipeline.

Prefer Pydantic or an equivalent schema-validation system.

The LLM should choose sensible defaults when information is missing.

---

# Generation Modes

Implement at least these four high-level modes:

## image

General-purpose image generation.

Examples:

- concept art
- realistic images
- illustrations
- environments
- characters
- paintings

Use the best available local general-purpose image model.

## pixel_art

Generate individual pixel-art images.

Examples:

- RPG characters
- objects
- icons
- buildings
- monsters
- weapons

The pipeline should preserve deliberate pixel structure.

Avoid simply generating a normal image and applying a cheap pixelation filter.

Pixel-art workflows may use:

- specialized checkpoints
- pixel-art LoRAs
- low-resolution generation
- controlled downscaling
- nearest-neighbor scaling
- palette reduction

## sprite

Generate animated game characters.

Examples:

- idle
- walk
- run
- attack
- hit
- death
- cast
- jump

The system must prioritize consistency between frames.

The same character should preserve:

- proportions
- face
- clothing
- equipment
- colors
- silhouette
- pixel-art style

Do NOT ask the image model to generate an entire spritesheet as one image unless it is only being used for experimentation.

Prefer generating frames separately and assembling them afterward.

## tileset

Generate game tiles.

Examples:

- grass
- stone
- water
- roads
- dungeon floors
- walls
- trees
- cliffs

Tiles should have consistent resolution and style.

When possible, support seamless or tileable generation.

---

# Image Generation Backend

Install and configure ComfyUI.

The application should use the ComfyUI API programmatically.

Do not require the user to manually operate the ComfyUI interface for normal usage.

ComfyUI should be considered the rendering engine.

The application's Python layer should be able to:

- submit workflows
- replace prompts
- change seeds
- change resolution
- change models
- change LoRAs
- change ControlNet parameters
- provide reference images
- receive generated images
- inspect generation status

---

# Workflow Strategy

Do NOT let the LLM invent an entirely new ComfyUI graph for every request.

Instead, create stable parameterized workflows.

For example:

workflows/
    image.json
    pixel_art.json
    sprite_reference.json
    sprite_frame.json
    tileset.json
    inpaint.json

The LLM chooses the workflow and provides its parameters.

Python modifies the required workflow inputs before sending it to ComfyUI.

This is much more reliable than letting the LLM dynamically build arbitrary node graphs.

---

# Model Strategy

Do not hard-code the system around one image model.

Create a backend/model abstraction.

Example:

ImageBackend
    generate()
    img2img()
    inpaint()
    reference_generate()

Implement a ComfyUI backend first.

The model configuration should live separately.

Example:

```yaml
models:
  general:
    checkpoint: ...
  pixel_art:
    checkpoint: ...
    lora: ...
  sprite:
    checkpoint: ...
    lora: ...
```

Models should be replaceable later.

---

# Pixel Art Requirements

Pixel-art quality is particularly important.

The pipeline should avoid the common AI problem where an image merely resembles pixel art while containing inconsistent pixel sizes and blurred details.

Pixel-art output should use:

- consistent pixel density
- nearest-neighbor scaling
- controlled output resolution
- limited palette where appropriate
- no anti-aliasing where inappropriate
- clean silhouettes
- strong readability at native resolution

Useful target sprite sizes include:

- 16x16
- 24x24
- 32x32
- 32x48
- 48x48
- 64x64

The pipeline may generate at a larger internal resolution if necessary, but the final sprite should be converted carefully to the requested native pixel resolution.

---

# Character Consistency

For sprite generation, character consistency is more important than raw image quality.

Create one canonical character reference first.

Example:

character_reference.png

Then use that reference for subsequent animation frames.

Use whichever local techniques produce the best consistency.

Possible tools include:

- IP-Adapter
- reference conditioning
- ControlNet
- OpenPose
- depth
- segmentation
- pose images
- LoRAs
- fixed seeds
- latent reuse

Do not assume every technique is required.

Implement the simplest reliable combination first.

---

# Sprite Animation Pipeline

A sprite-generation request should roughly follow this pipeline:

User Prompt
    ↓
LLM parses request
    ↓
Generate canonical character reference
    ↓
Create animation plan
    ↓
Generate target poses
    ↓
Generate each frame
    ↓
Consistency validation
    ↓
Regenerate failed frames if needed
    ↓
Pixel-art cleanup
    ↓
Alignment
    ↓
Palette normalization
    ↓
Spritesheet assembly
    ↓
Metadata export

---

# Pose Control

Animation frames should not rely exclusively on text prompts such as:

"knight walking frame 2"

because this produces poor consistency.

Instead, provide explicit pose control wherever possible.

Possible approaches include:

- pose skeleton templates
- OpenPose
- manually defined pose references
- generated pose maps
- animation templates

Maintain reusable animation pose templates.

Example directory:

poses/
    humanoid/
        idle/
        walk/
        run/
        attack_sword/
        cast/
        hurt/
        death/

Each animation should contain deterministic frame poses.

---

# Sprite Alignment

All generated sprite frames must be aligned consistently.

Feet should remain anchored to approximately the same ground position.

Characters should not randomly move several pixels between animation frames unless that movement belongs to the animation.

Implement automatic bounding-box analysis.

Allow configuration such as:

```json
{
  "anchor": "bottom_center"
}
```

Use this anchor when assembling animation frames.

---

# Transparency

Game sprites should ideally use transparent backgrounds.

If the image model does not generate reliable alpha transparency, automatically remove the background during post-processing.

The final PNG must contain a real alpha channel.

Avoid fake checkerboard backgrounds.

---

# Palette

Optionally support palette limits.

Examples:

```json
{
  "palette_size": 16
}
```

or:

```json
{
  "palette_size": 32
}
```

For retro styles, palette normalization should help keep frames visually consistent.

Do not force a small palette for modern pixel art unless requested.

---

# Spritesheet Assembly

Create spritesheets programmatically.

Do not rely on the diffusion model to correctly place frames into a grid.

Python should perform the final assembly.

Example layout:

idle_down_0
idle_down_1

walk_down_0
walk_down_1
walk_down_2
walk_down_3

walk_left_0
walk_left_1
walk_left_2
walk_left_3

etc.

The exact atlas layout should be deterministic.

---

# Metadata

Generate metadata along with the spritesheet.

Example:

```json
{
  "image": "knight.png",
  "frame_width": 32,
  "frame_height": 48,
  "animations": {
    "walk_down": {
      "frames": [0, 1, 2, 3],
      "fps": 8
    },
    "walk_left": {
      "frames": [4, 5, 6, 7],
      "fps": 8
    }
  }
}
```

Keep the metadata format simple initially.

Design it so exporters for engines such as Godot, Unity or custom engines can be added later.

---

# Vision-Based Validation

If a local vision-language model is available, optionally use it to validate generated frames.

The validator can check for things such as:

- missing sword
- wrong clothing color
- changed helmet
- malformed limbs
- different character proportions
- incorrect facing direction
- major style mismatch

The validation stage should return structured results.

Example:

```json
{
  "valid": false,
  "reason": "The sword disappeared in this frame.",
  "retry": true
}
```

If validation fails, regenerate only the bad frame.

Do NOT regenerate an entire spritesheet unnecessarily.

---

# File Structure

Prefer a structure similar to:

```text
image_generation/
    api/
    backends/
        comfyui.py
    models/
    workflows/
        image.json
        pixel_art.json
        sprite_reference.json
        sprite_frame.json
        tileset.json
    planners/
        image_planner.py
    postprocess/
        transparency.py
        pixel_art.py
        palette.py
        alignment.py
        spritesheet.py
    validation/
        vision_validator.py
    schemas/
        requests.py
        results.py
```

Keep the image module isolated from the rest of the application.

---

# Python API

Expose a simple API.

Example:

```python
result = image_generator.generate(
    prompt="32x48 pixel-art black mage walking",
)
```

The LLM/planner determines the details.

Also allow explicit control:

```python
result = image_generator.generate(
    prompt="black mage",
    mode="sprite",
    style="16-bit JRPG",
    width=32,
    height=48,
)
```

---

# CLI

Create a simple CLI for testing.

Example:

```bash
imagegen "cyberpunk city at night"
```

Pixel art:

```bash
imagegen "SNES style potion icon" --mode pixel_art
```

Sprite:

```bash
imagegen "1992 JRPG black mage" \
    --mode sprite \
    --size 32x48 \
    --animations idle,walk,attack \
    --directions 4
```

---

# Output

Normal image generation:

```text
outputs/
    image_001.png
```

Sprite generation:

```text
outputs/
    black_mage/
        reference.png
        frames/
            idle_down_00.png
            idle_down_01.png
            walk_down_00.png
            ...
        spritesheet.png
        spritesheet.json
```

---

# Installation Requirements

The installation process should automatically detect:

- operating system
- NVIDIA GPU availability
- CUDA version
- VRAM
- available RAM
- Python version
- disk space

Choose appropriate model sizes based on the hardware.

Do not blindly install extremely large models if the machine cannot run them efficiently.

Use GPU acceleration whenever available.

---

# Local-Only Requirement

The final system should not require cloud APIs.

Avoid dependencies on:

- OpenAI image generation APIs
- Midjourney
- Replicate
- Stability cloud APIs
- proprietary hosted generation services

Downloading open models during installation is acceptable.

After installation, generation should work locally.

---

# Model Downloading

During installation:

1. identify suitable current open/local models;
2. download them from trusted sources such as Hugging Face or official repositories;
3. place them in the correct ComfyUI directories;
4. download required VAEs, LoRAs, ControlNet models and adapters;
5. verify that ComfyUI can load them;
6. run test generations.

Do not assume model names in this document are still the best options.

Research currently available models and choose the strongest practical local models compatible with the user's hardware.

---

# ComfyUI Setup

Install ComfyUI in a dedicated directory or environment.

Install only custom nodes that are actually needed.

Avoid turning the ComfyUI installation into an uncontrolled collection of third-party nodes.

Prefer native ComfyUI functionality when available.

Record every custom node dependency in a dependency file.

The installation must be reproducible.

---

# Testing

After installation, automatically perform smoke tests.

Test 1:

"A beautiful mountain landscape at sunset"

Expected result:

A normal generated image.

Test 2:

"16-bit JRPG potion icon"

Expected result:

A readable pixel-art icon.

Test 3:

"32x48 pixel-art knight facing down"

Expected result:

A clean character sprite.

Test 4:

"32x48 JRPG knight, four-direction walking animation"

Expected result:

Multiple consistent frames and an assembled spritesheet.

Verify that:

- ComfyUI responds through its API
- models load successfully
- generated files exist
- PNG files are valid
- sprites have correct dimensions
- alpha channels work where requested
- metadata matches generated frames

---

# Error Handling

The program should detect common failures and provide useful errors.

Examples:

- ComfyUI unavailable
- model missing
- CUDA out of memory
- invalid workflow
- invalid LLM JSON
- output image missing
- unsupported resolution

When possible, automatically recover.

For example, if VRAM is insufficient:

- reduce batch size
- enable model offloading
- use lower precision
- select a smaller compatible model

Do not silently reduce the final requested sprite dimensions.

---

# Logging

Create readable logs.

Include:

- selected mode
- selected model
- selected workflow
- seed
- resolution
- LoRAs
- generation duration
- retries
- validation failures

Do not fill normal logs with huge ComfyUI JSON payloads.

Allow verbose/debug logging separately.

---

# Important Design Principle

Do not overengineer the first implementation.

First create a reliable end-to-end pipeline:

Prompt
→ LLM
→ JSON
→ ComfyUI
→ Image

Then add:

Pixel Art

Then:

Sprite consistency

Then:

Animations

Then:

Spritesheets

Then:

Vision validation

The architecture should support all of these from the beginning, but implementation should proceed incrementally.

---

# Final Objective

The final application should feel like one unified local image generator.

The user should not need to know:

- which diffusion model is running
- which LoRA is selected
- which ControlNet is being used
- which ComfyUI workflow is active

The user should simply describe what they want.

Examples:

"Generate a watercolor castle."

"Generate a 16-bit RPG sword."

"Generate a 32x48 SNES-style warrior."

"Generate a complete four-direction walk animation for that warrior."

The LLM should understand the intent, select the correct local workflow, configure the generation system, execute it, validate the result, and return the appropriate images and metadata.

Prioritize:

1. local execution
2. good image quality
3. strong pixel-art support
4. character consistency
5. modularity
6. reproducibility
7. simple user experience

Before installing models, inspect the machine's GPU/VRAM and research the best currently available local models for this hardware.

Do not blindly use FLUX or Stable Diffusion simply because they are well known. Choose models based on actual current quality, hardware compatibility, licensing and suitability for both general image generation and game/pixel-art workflows.
