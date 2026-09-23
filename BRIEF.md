# Ryōan-ji 1951 — build brief for Claude Code

Supersedes the earlier "Full Project Brief". Where they disagree, this file wins. The earlier brief is wrong about the floor steps, the "rear wall" opening, the L-shaped veranda, the vanishing point (397, 878) and the early-morning low sun.

Owner: Rapolas. This file lives in the repo root; the build is in `src/`. Original reference implementation: `start/ryoanji-greybox-rev4.html` (single-file Three.js r147, calibrated and verified against the photo). Port it, don't redesign it.

---

## 0. Rules

1. **Measured beats estimated.** Every piece of geometry is either measured from the photo (numbers below) or an estimate. Never move a measured value to make something look better. If a measured value seems wrong, stop and say so.
2. **Keep the distinction visible.** The final scene keeps a toggle, "Show measured vs estimated", that tints estimated geometry.
3. **Keep the POV check alive.** The through-the-camera view plus the photo overlay is the regression test. After any geometry change, compare POV against `dev-reference/bischof-ryoanji-1951.jpg` (the 1140 × 1142 scan; local only, never in the public repo). `?dev` has a region check that prints POV luminance next to the photo's (section 6).
4. Ask before inventing anything the photo or this brief doesn't cover.

---

## 1. What we're making

An online, explorable 3D reconstruction of Werner Bischof, *A priest rests in the temple of Ryōan-ji, Kyoto, Japan*, 1951 (Magnum Photos).

- Orbit, pan and zoom around a measured reconstruction of the photographed room and veranda, plus estimated surroundings out to 10–20 m.
- One button snaps to Bischof's exact camera.
- Firewatch-style atmosphere, tailored to this scene: depth-banded palette, custom fog, god rays, sparse natural sound.
- Hoverable objects: Bischof, his Rolleiflex, the priest, the bowl.

Deployment: a normal online static build (Vite + `three` from npm is fine). No backend.

---

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Where Bischof stands | On the ground below the veranda, standing, waist-level finder. The ground height is an estimate. |
| Sun | Measured: about 40° elevation. The "early morning" label is dropped. The dawn palette stays as stylization only. |
| Season | Summer to about 30 October 1951, from the measured 40° sun at Kyoto's latitude and Bischof's arrival in Japan in summer 1951. No cherry blossom. |
| Priest | Hover label "ommmmm". No click panel. |
| Bowl | Treated as a matcha bowl (a stylization; the photo doesn't identify it). Thirteen rotating hover labels, below. |
| Bischof and camera | Larger hover card with researched text (section 8). Click opens the inspect panel with the same text. |
| Panel images | Renders of the scene's own 3D models. No third-party photos. |
| Build | Normal online static build. |
| Audio | Nature-heavy mix. Pixabay music as a quiet layer. Sound button, off by default. |

---

## 3. Coordinates and camera (exact)

Units are metres. Three.js scene coordinates:

- **x**: along the facade. 0 = the end wall; increasing x runs toward the room's right and toward Bischof.
- **y**: up. 0 = floor level (veranda, sill and tatami are level within about 2 cm).
- **z**: 0 = facade line. **+z runs out toward the garden, −z runs into the building.**

(rev4 builds geometry in "depth" coordinates inside a group with `scale.z = -1`. When porting, convert once to the convention above and drop the mirrored group. Depth d into the building becomes z = −d.)

**Bischof's camera, measured**

| Parameter | Value |
|---|---|
| Lens position | (6.12, 0.68, 3.05) |
| View direction | (−0.7638, 0.0643, −0.6423), normalised |
| Up | (0, 1, 0), no roll |
| Vertical FOV | 39.31° |
| Aspect in POV | 1:1 (square frame, letterbox the rest) |
| Derived | 40.0° off the facade line, 3.7° pitch up, 1.70 m outside the veranda edge, 0.68 m above floor level, 7.8 m to the priest |

**Sun**: direction toward the sun (−0.829, 0.839, −0.559), normalised. That's 40° elevation, coming from beyond the end wall (−x) and slightly behind the building (−z).

**How the measurements were made (for the presentation, not for code).**
- Two vanishing points were extracted from 39+ and 13+ line segments. Facade direction VP: (−777, 674). Room-depth direction VP: (≈2475, 674). Horizon at y = 674 in the 1140 × 1142 source.
- Focal length ≈ 1600 px, which matches the Rolleiflex's 75 mm lens on a near-full 6×6 negative.
- Floor points were projected through the calibrated camera. Scale anchor: door opening height (sill to kamoi) = 1.77 m.
- Independent checks: the side opening measures 1.95 m and the first facade bay 1.94 m (Kyōma 1 ken = 1.97 m). The predicted end-wall lintel lands 5–7 px from the photo's. The sun fitted from the veranda patch also reproduces the lit tatami in front of the priest.

---

## 4. Geometry: measured

| Element | Position (scene coords) | Notes |
|---|---|---|
| Veranda deck | x 0 → 8, z 0 → +1.35, top y = 0 | Depth 1.35 m. Planks run parallel to the facade, about 0.135 m. |
| Veranda edge beam (fascia) | at z = +1.35, y −0.16 → 0 | 0.16 m tall |
| Facade sill line | z = 0 | |
| Corner post | x −0.06 → 0.06, z 0 → 0.121 (veranda side of the facade line) | Section 0.121 m (4 sun). Re-fitted to the full-res photo: silhouette at photo x 155–187, corner slot open from photo x 187 to 261 |
| Facade post | centre x = 0.81, z = 0 | Section 0.121 m (4 sun). Re-fitted: silhouette at photo x 261–305 (was x = 0.82, 0.15 m) |
| Facade post | x = 1.94 | Position measured; the 0.121 m section is an estimate |
| Closed shoji leaf (behind the lantern) | x 0.90 → 1.87 | Shoji orientation (fact): the lattice faces the room, the paper faces outside |
| Facade opening | x 1.94 → 3.72 | |
| Near shoji leaf, left edge | x = 3.72 | Width 0.985 m (half ken), estimated |
| Kamoi (door head) | y = 1.77 (bottom), facade and end wall | Scale anchor |
| Facade upper beam | y 2.30 → 2.55 | |
| End wall | x = 0 | One continuous line: the veranda's end enclosure and the room's side wall |
| Veranda-end board enclosure | x = 0, z 0 → +1.35 | |
| Open slot at room corner | x = 0, z 0 → −0.37 | Source of the veranda sun patch |
| Narrow shoji leaf | x = 0, z −1.50 → −1.71 | |
| **Side opening** (behind the priest) | x = 0, z −1.71 → −3.66 | 1.95 m = 1 ken. Looks onto a small court. |
| Shoji leaf | x = 0, z −3.66 → −4.68 | |
| Hanging curtain | x ≈ 0.09, z −3.28 → −3.62, y 0 → 1.72 | Inside the opening, right side |
| Room floor (tatami) | x 0 → 5.91, z 0 → −4.68 visible | |
| Priest | body centre (0.43, 0, −2.28), top of back 0.44 m | Faces about 50° from +x toward +z, toward the open facade, back to the rear of the room (measured by calculation; replaces "head toward the end wall"). Seiza, folded fully forward, shaved head down between wide sleeves spread forward on the tatami; light kimono layer, no black outer robe. Check: head centre ≈ photo (635, 772), back peak ≈ (645, 727), crown of the head toward the camera. Because he faces the lens, depth along his axis is barely constrained by one view; the form is estimated inside the measured envelope |
| Cushion stack | centre (1.30, 0, −0.66), 0.50 × 0.25 × 0.50 | |
| Low table | front-left leg at (2.17, 0, −1.60), top at y = 0.28 | Size about 0.50 × 0.35, estimated |
| Bowl | group at (2.20, 0.28, −1.75), ±5 cm | Re-measured from the photo (was about (2.35, 0.32, −1.68), behind the near leaf's stile in POV) |
| Lantern | on its measured viewing ray; about (3.53, 0.98, +1.35) if it hangs at the veranda edge | Depth is an estimate; envelope 0.27 × 0.37 m (0.27 is the flared cap; the body is ~0.19 m, photo ~92 px). It hangs with one face square to the lens: the photo shows two panes side by side. Dark mass from photo y 424 (cap peak ≈ 1.165 m) to 612 (base 0.80 m); the ring sits just above |

---

## 5. Geometry: estimated (outside the frame)

Tint these in "Show measured vs estimated". Keep them plausible and plain.

| Element | Estimate |
|---|---|
| Ground | y = −0.55 (veranda floor 0.55 m above ground). Not measured; kept by decision (see the known discrepancy below). |
| Bischof | Standing on the ground, body about 0.22 m behind the lens, height about 1.72 m, Rolleiflex at waist |
| Room extent | 3 ken × 2.5 ken: x 0 → 5.91, z 0 → −4.925. Visible to at least 4.7 m each way. |
| Rest of facade | Post at x = 5.91; shoji leaves x 4.70 → 5.84 |
| End wall | z −0.37 → −1.50 (hidden behind the closed leaf), and z −4.68 → −4.925 |
| Back wall, ceiling | Back wall at z = −4.925; ceiling about y = 2.6 |
| Roof and eave | Eave slab about y 2.75–2.85, overhanging to about z = +2.4. It must cast shadows: it keeps the front veranda shaded, as in the photo. |
| Veranda beyond | Continues to x = 12 |
| Court beyond the end wall | See the court table below |
| Garden where Bischof stands | Open ground, low planting at the veranda edge (plants are visible under the fascia at bottom-left of the photo) |
| Top-left maple | Acer palmatum, layered horizontal sprays with gaps, 2–3.5 m from the lens, confined to photo x < 250 and y < 450, never over the end-wall board enclosure (photo x 0–150, y 400–850). Trunk and crown stand outside the frame |

**The court** (all estimated; tinted in the toggle). Placed by photo px plus a depth plane, back-projected through the calibrated camera.

| Element | Estimate | Range / check |
|---|---|---|
| Neighbouring building: gable face | Plane x = −5.7 | Calculated range −5.7 to −7.2; −5.7 assumes JIS 53A tiles with a 235 mm course |
| Its roof | Ridge along x, gable facing +x (toward us). Pitch 19°, eave 2.0 m above our floor. J-tile roof with a stepped verge row, one step per 0.235 m | The verge line passes through photo px (518, 530) and (615, 495): on x = −5.7 that line is 18.9°. Its 2.0 m point puts the near eave at z ≈ −6.14. Width (3.3 m eave to eave) and length (6 m) are further estimates |
| Its gable wall | White plaster, one dark timber post (photo x ≈ 657–672); to its right an opening into a dim interior with horizontal beams and shelving | |
| Court tree | Multi-stem broadleaf between the end wall and that building; top 1.5–1.9 m above our floor; trunk near photo x 585–600, crown top near photo y 540 | Built on x = −3.0, where photo y 540 is 1.69 m |
| Shrubs | Low shrubs at the left of the side opening | |
| Bamboo fence | x = −2.56 (seen through the corner slot). Vertical bamboo, top 0.81 m above our floor; horizontal rails at +0.45, +0.14 and −0.17 m | Runs z −3.3 → +2.5, so it shows in the slot but not in the side opening |
| Tree behind the fence | Hazy, backlit | |

Nothing in the court may read as a flat wall.

**Known discrepancy (ground).** The photo shows a sunlit ground patch under the veranda at about x 0.3 to 1.1. It needs ground <= -0.70; with ground at -0.55 it cannot form. Known discrepancy, ground kept at -0.55 by decision.

**The stage: a diorama cut at the edge of knowledge.**
- One ground slab, x −9 → 13, z −11 → +5.5, top at y = GROUND (−0.55). A 0.6 m cut edge shows a soil section: flat painted bands, darker downward.
- Everything outside the slab is void: one flat colour from the fog script. No ground, leaves or geometry beyond the edge (the neighbouring building is cut at x −9; drifting leaves and the maple are clipped to the slab).
- A thin line on the slab surface marks the measured floor extent, x 0 → 5.91, z −4.68 → +1.35: the footprint of known space.
- Ground inside the slab: bare earth, scattered small stones along the veranda base, no grass. Under the veranda: open underfloor, dark earth and stones, posts on foundation stones. Clumps of large heart-shaped, pointed, long-stalked leaves (photo bottom-left) at about (1.2–1.8, ground, 0.9–1.3). All estimated.
- Camera: orbit target clamped inside the slab; the camera stays at least 0.3 m above the slab and below y 6. Free view starts framed on the veranda.

Estimated geometry must cast shadows even though it renders ghosted in debug mode. rev4 had this bug at first: sun leaked through an invisible roof.

---

## 6. Light and look

**Physically, as measured.** The sun comes from behind and beside the building, so the facade and the front veranda are in shade. Direct sun reaches two places only:
1. A parallelogram on the veranda floor at the room corner, entering through the corner slot.
2. A patch on the tatami in front of the priest, entering through the side opening. The priest is backlit.

The god rays go here: a soft volumetric shaft through the side opening, onto the tatami. That's the photo's real light path, not decoration.

**Stylization (locked).** Firewatch dawn colour script as palette only:
- **Foreground** (veranda, lantern, near wall): warm amber where sunlit, deep cool slate in shade.
- **Midground** (room, priest, cushions, bowl): desaturated and cooler.
- **Background** (the court through the side opening): the most hue-shifted and hazy, close to silhouette.
- **Fog**: custom height and distance fog that tints toward the script's colour. Use `onBeforeCompile` or a ShaderMaterial, not the built-in `THREE.Fog`.

**Materials.** `MeshStandardMaterial`, `flatShading: false`, roughness 0.85–0.95, metalness 0. Clean chiseled forms, bold silhouettes. One shadow-casting DirectionalLight (the sun; its direction is measured, its intensity is style) plus a low Hemisphere fill. The fill is occluded inside the room (full at the facade line, 30 % about 1.5 m in), since a hemisphere light has no occlusion of its own; direct sun is untouched.

**Sky: stylization (labelled in the UI).** A painted gradient in the Firewatch manner with a few flat cloud bands. The sun stays on the measured SUN_DIR and no cloud covers its disc (the photo's shadows are hard: the sun was clear). The POV frame shows no open sky above the horizon: below about 10° the sky is the unchanged smooth gradient, so the POV does not change.

**Textures.** Code-generated painted textures (the Firewatch approach): a painted diffuse in two or three tone bands plus a faint normal map derived from the same canvas (Sobel on a height channel). Wood, tatami (weave plus dark cloth borders), shoji paper, plaster, J-tile, bark, and a maple-leaf alpha atlas. Flat shapes and abstract internal detail, no photographic noise. 512 px, cached, mipmapped.

**Zone grading.** Four atmospheric zones (veranda, room, court, garden), each with its own tint, exposure and fog tint. Free view: blended by camera position. POV: blended by region, via each fragment's world position. The cool slate shade and warm amber sun stay; shoji paper is exempt from the cool shift so it reads as paper.

**POV luminance targets** (greyscale mean in photo px; the photo's own value, ±15 %):

| Region | Photo px | Target |
|---|---|---|
| Veranda shade | (300, 1000) → (1100, 1100) | 74 |
| Veranda sun patch | (120, 860) → (220, 900) | 211 |
| Lit tatami | (560, 820) → (780, 850) | 206 |
| Court | (530, 480) → (640, 640) | about 108 |
| Corner slot | (190, 450) → (258, 820) | about 148 |
| Right screens | (930, 250) → (1120, 800) | about 102 |
| Priest | (600, 700) → (712, 818) | about 108 |
| Lantern | (345, 450) → (425, 560) | about 16 |

**Leaves and wind.** Sparse drifting Acer palmatum leaves, mostly green with a few yellowing, mostly outside and in the court. They replace the earlier petals: the season window (summer to about 30 October 1951) rules out blossom.

---

## 7. Interaction

- **Camera.** OrbitControls: drag to orbit, scroll to zoom (`zoomSpeed` 1.6), right-drag to pan. Target clamped inside the stage slab; camera at least 0.3 m above it and below y 6.
- **"View through Bischof's camera"** snaps to the exact camera in section 3. The first click toggles back. Keep the photo overlay with an opacity slider as a debug control (hidden or developer-only in the final).
- **Hover.** Slight emissive brightening plus a label, for four objects:

| Object | Hover | Click |
|---|---|---|
| Priest | `ommmmm` | none |
| Bowl | One of the thirteen labels below, random on each hover, never the same twice in a row | none |
| Bischof | Larger card (section 8) | Inspect panel |
| Rolleiflex | Larger card (section 8) | Inspect panel |

- **Bowl hover labels:**
  - matcha girlie since 1191
  - ceremonial grade, no notes
  - it's giving chawan core
  - whisked, not stirred
  - the foam? immaculate
  - no thoughts, just chasen
  - umami rizz
  - L-theanine era, zero crash
  - the priest's pre-workout
  - turn the bowl, don't be that guest
  - slurping the last sip is literally the etiquette
  - oat milk? in this temple??
  - grass, but make it expensive
- **Inspect panel** (Subnautica-style): a render of the object on the left, scrollable text on the right, close button, Esc closes. The render is of our own 3D model.

---

- **Evidence (research mode).** An "Evidence" button opens a stepper; each step moves the camera, shows its evidence in 3D (or on the photo plane) and one caption line with the numbers. Esc or × returns to the previous view. Slide palette: orange #ff5a1f facade direction, blue #2ea3ff room-depth direction, white vertical, red #ff2d55 horizon, violet #c653ff rejected or corrected.
  1. Line families: model edges parallel to x (orange), z (blue), vertical (white). Photo: 54 facade / 13 depth / 17 vertical segments.
  2. Vanishing points (POV, frame shrunk so both fit): model edges extended to (−777, 674) and (2475, 674), horizon y 674; f ≈ 1600 px, 75 mm Tessar on 6×6. Labelled "model edges extended; photo segments in slides 02–03". (The model's own VPs land at (−775, 674) and (2472, 674).)
  3. Lens height: a red plane at y 0.68 through the near leaf and the side opening.
  4. Scale: kamoi 1.77 m (anchor), side opening 1.95 m and first bay 1.94 m (independent checks), ken 1.97 m.
  5. Camera: frustum from the lens; rays to the priest (7.8 m) and to the veranda edge (1.70 m).
  6. Sun: SUN_DIR rays through the corner slot to the veranda patch and through the side opening to the lit tatami.
  7. Corrections: violet ghost of the rejected VP (397, 878) with 3 segments (drawn to show the idea; the real ones are in slide 06); violet ghost "rear wall"; the real side-wall opening highlighted.
  8. Priest: arrow from the body centre at 50° toward the facade.
  9. Court: verge line through photo px (518, 530) and (615, 495), tile steps of 0.235 m, and the gable-plane range x −5.7 to −7.2 as a band.

## 8. Copy (final)

**Bischof card / panel**

> **Werner Bischof, 1916–1954**
> Swiss photojournalist, the first new photographer to join Magnum's founders, in 1949.
> Sent to cover the Korean War in summer 1951, he passed through Japan, was captivated, and stayed almost a year.
> Photographer Kimura Ihei guided him through temples and shrines; Kimura later wrote that they became "like brothers".
> He died on 16 May 1954 when his car went into a ravine in the Peruvian Andes. His book *Japan* appeared just after his death and won the Prix Nadar in 1955.
> *In this frame: lens 0.68 m above the floor, 7.8 m from the priest.*

**Rolleiflex card / panel**

> **Rolleiflex Automat X (K4/50)**
> Twin-lens reflex, made October 1949 to May 1951, the first Automat with flash X-sync.
> Zeiss Tessar 75 mm f/3.5, 12 square 6×6 frames per roll of 120 film, shutter 1 s to 1/500, about 965 g, waist-level finder with a sports finder.
> You look down into the finder, and the image there is mirrored left to right.

---

## 9. Audio

- Sound button, **off by default** (browsers block audio until a click). One click toggles all audio on or off; fade over about 0.5 s.
- Files in `/audio/`. Serve through the dev server: Web Audio can't load from `file://`.

| Layer | File(s) | Behaviour |
|---|---|---|
| Bed | `bed-wind-leaves.mp3` | Constant loop, the loudest layer |
| Birds | `bird-01…06.mp3` | Random one-shots every 20–60 s, random pan and small pitch variation |
| Music | `music.mp3` (Pixabay) | Low, well under the bed. Can fade in and out over a few minutes rather than playing constantly. |
| Wood | `creak-01…04.mp3` | Random every 1–2 min |
| Bell | `bell.mp3` | Rare: once every several minutes, or on entering POV |

Nature leads, music supports. Sparse beats full.

---

## 10. Build order (each step ends with a check)

1. **Port rev4** to a Vite project with `three` from npm, in scene coordinates (section 3). Check: the POV plus overlay matches rev4 exactly.
2. **Complete the estimated geometry** (section 5), with the measured/estimated toggle. Check: POV unchanged, nothing estimated blocks the frame.
3. **Lighting and shadows.** Check: in POV, the front veranda is shaded, the corner patch is lit, the tatami in front of the priest is lit.
4. **Look.** Palette bands, custom fog, god ray through the side opening. Check: the POV still reads as the photo's composition.
5. **Interaction.** Hover, labels, cards, inspect panels, camera limits.
6. **Audio.** Layers and the button.
7. **Leaves and wind.**
8. **Polish.** Performance (shadow-map size, pixel ratio), mobile touch, loading screen.

---

## 11. Mistakes already made — don't repeat

- **Straight corridor, then an L-shaped wraparound.** Both wrong. It's one straight veranda, with the end wall in frame.
- **Vanishing point at (397, 878).** Wrong; only 2–3 lines supported it.
- **Two floor steps (6 cm and 5 cm).** Wrong; floors are level within about 2 cm.
- **"Rear wall" opening.** Wrong; the opening behind the priest is in the side (end) wall, perpendicular to the facade.
- **Invented objects.** A round stone/well was invented once; it had no basis.
- **Mirrored axes.** rev4's first render was mirrored. Always verify in POV against the photo.
- **Non-shadow-casting estimated geometry.** It let the sun through the roof.
- **Priest facing the end wall.** Wrong; he faces about 50° toward the open facade, crown toward the camera.
- **Cherry petals.** Wrong for the season; the sun and Bischof's travel dates put the photo between summer and about 30 October.
- **Lattice on the outside of the shoji.** Wrong; the kumiko faces the room and the paper faces out. From the veranda the lattice shows only as a faint shadow.
- **Lantern square to the facade.** It hangs free and faces the lens in the photo (two panes side by side); square to the facade it reads too wide.

---

## 12. Still open

- Music instrumentation is chosen by the file Rapolas supplies; nothing to decide in code.
- The site within Ryōan-ji is unconfirmed. Best candidate: the Kuri–Hōjō courtyard zone. This doesn't affect the build.
