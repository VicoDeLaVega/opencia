"""Background removal via flood fill from the image corners.

Our pixel_art workflow always requests a plain background (see
workflows/graphs.py prompts), so a flood fill from the four corners that
stops at a color-distance threshold is enough to cut a clean silhouette -
without touching near-background-colored pixels *inside* the subject
(e.g. white armor highlights), since those aren't corner-connected.

This is a deliberately simple heuristic for phase 1. It assumes a
roughly-uniform background color, which matches how the workflow prompts
generation. If a future workflow generates busier backgrounds, replace
this with a real matting model rather than extending the threshold.
"""

from __future__ import annotations

from collections import deque

from PIL import Image


def remove_background(image: Image.Image, tolerance: int = 24) -> Image.Image:
    img = image.convert("RGBA")
    w, h = img.size
    px = img.load()

    def close(a, b) -> bool:
        return all(abs(a[i] - b[i]) <= tolerance for i in range(3))

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if not close((r, g, b), px[0, 0][:3]):
            continue
        px[x, y] = (r, g, b, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    return img
