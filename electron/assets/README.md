# Desktop icon artwork

`clover-mark.png` is the canonical 1024px RGBA foreground, redrawn and recolored using the built-in imagegen tool. Color export uses the original foreground alpha unchanged and normalizes the generated leaf fills to the palette below, keeping the exact silhouette, gaps, and antialiasing without incidental texture or a generated backdrop.

| Part | Color reference | Fill |
| --- | --- | --- |
| Upper-left leaf | DeepSeek blue | `#4D6BFE` |
| Upper-right leaf | OpenAI black | `#111111` |
| Lower-left leaf | Claude terracotta orange | `#D97757` |
| Lower-right leaf | Gemini-inspired violet | `#8B5CF6` |
| Curved stem | Black | `#111111` |

`app-icon-background.svg` preserves the white circle centered at (512, 512), radius 480. `npm run build:icons` combines these two sources for the desktop icons and converts the foreground to a pure-black silhouette with the same alpha for the macOS template tray icon. The ICO, ICNS, iconset PNGs, `app-icon-1024.png`, `app-icon-trimmed.png`, and `tray-iconTemplate@2x.png` are generated outputs.

## Color edit prompt

```text
Use case: precise-object-edit.
Asset type: existing Clov API desktop icon, exact recoloring only.
Input image 1 is the edit target. Keep its exact four smooth heart-shaped leaves, all contours and gaps, exact positions, short curved stem, white circular disk and transparent exterior. Do not redesign, reshape, move, scale, rotate, add or remove anything.
Change only the fill colors of the four existing leaves:
- Upper-left leaf: DeepSeek-inspired vivid blue, flat solid #4D6BFE.
- Upper-right leaf: OpenAI black, flat solid #111111.
- Lower-left leaf: Claude terracotta orange, flat solid #D97757.
- Lower-right leaf: Gemini-inspired violet, flat solid #8B5CF6.
Keep the entire curved stem solid #111111 black; it is a separate fifth shape, not part of the purple leaf.
Keep the circular disk pure white #FFFFFF with its exact size and position. Outside the circle must be real alpha transparency. No checkerboard pixels, shadows, highlights, texture or gradients. Crisp smoothly anti-aliased edges. This is flat application icon artwork, not an illustration or mockup. No text, letters, logos, added objects, borders or watermark. Deliver one square final PNG at 1024 x 1024.
```

## Redraw prompt

```text
Use case: precise-object-edit.
Asset type: production desktop app icon for Clov API, square 1024 x 1024 PNG with real alpha transparency.
Input image 1 is the edit target. Replace only the ugly pixelated black clover foreground with a completely redrawn, professionally designed four-leaf clover symbol. Keep the existing pure white circular background, its size and placement, and the transparent area outside the circle unchanged: circle centered at (512,512), radius 480 on the 1024 canvas. The outside is truly transparent, never black or a checkerboard pattern.
Design direction: minimal, confident, friendly modern software icon. Flat near-black #111111 silhouette on pure white. Exactly FOUR clearly readable, softly heart-shaped leaves arranged diagonally around one compact center, smooth deliberate curves and broad rounded lobes. Clean open notches between leaves so all four stay distinct at 16, 24 and 32 pixels. A single short gently curved stem integrated naturally into the lower part of the clover; rounded end, no long dangling tail. Optical balance and generous white breathing room. Foreground roughly 62-66 percent of canvas width, centered as a whole including stem. Carefully balanced proportions, simple memorable silhouette, polished logo-quality geometry.
Constraints: radically improve the foreground shape; do not preserve the stepped pixel art. Keep the white circle and exterior transparency. No text, no letters, no border, no gradient, no shadow, no glow, no 3D, no texture, no leaf veins, no tiny details, no watermark, no presentation mockup, no extra symbols. Deliver one finished icon only.
```

## Export refinement prompt

```text
Use case: background-extraction. Input image 1 is the edit target and must retain its EXACT existing new smooth four-heart-leaf clover shape, proportions, position, short curved stem and white circular disk.
Change only the export/background treatment: the gray checkerboard OUTSIDE the white circle must be removed and replaced by REAL TRANSPARENCY in the alpha channel. Do NOT draw a transparency checkerboard. Do NOT use a gray or black opaque exterior. Keep the interior circular disk pure solid #FFFFFF, keep the clover solid flat #111111 and smooth anti-aliased edges. Remove all incidental surface texture, retain identical shape. Production app icon asset, no text, no gradients, no shadows, no mockup, no additional elements.
Output a square PNG with genuine transparent corners and a real alpha channel. The white circle stays visible and opaque.
```
