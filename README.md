# Ryōan-ji, 1951

An explorable 3D reconstruction of Werner Bischof, *A priest rests in the temple of Ryōan-ji, Kyoto, Japan*, 1951 (Magnum Photos). Built from the project brief; ported from the rev4 greybox (`ryoanji-greybox-rev4.html`, kept locally, not in git because it embeds the photo).

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, relative paths, upload anywhere
```

Add `?dev` to the URL for the POV check: photo overlay with an opacity slider, an "atmosphere off" switch, and **Region check**, which prints POV greyscale means next to the photo's for the regions in the brief (veranda shade, sun patch, lit tatami, court, corner slot; target ±15 %). The overlay and the check need the 1140 × 1142 scan at `dev-reference/bischof-ryoanji-1951.jpg`, which is not in the repo (copyright: Magnum Photos). Without it the slider hides itself.

## Where things are

| File | What |
|---|---|
| `src/config.js` | Measured constants: lens, view direction, FOV, sun, kamoi. Do not tune these. |
| `src/geometry.js` | Architecture and surroundings. Every mesh is registered measured or estimated (`box(..., est)`). |
| `src/props.js` | Cushion, table, bowl, lantern, Bischof, Rolleiflex, field-of-view frustum. |
| `src/priest.js` | The priest: seiza, folded forward, facing 50° toward the facade; one soft kimono mass (marching cubes). |
| `src/court.js` | The court (all estimated): neighbouring J-tile gable at x = −5.7, court tree, shrubs, bamboo fence, hazy tree in the slot. |
| `src/foliage.js` | Top-left maple: layered sprays placed in Bischof's frame, confined to photo x < 250, y < 450. |
| `src/textures.js` | Code-generated painted textures (tone bands + Sobel normal maps) and the leaf alpha atlas. |
| `src/devcheck.js` | `?dev` region check against the photo. |
| `src/lighting.js` | Sun (one shadow caster) + hemisphere fill; god-ray shaft through the side opening. |
| `src/atmosphere.js` | Custom depth-banded height/distance fog (onBeforeCompile), dawn sky, per-zone grading (veranda, room, court, garden). |
| `src/interaction.js` | Hover labels and cards, inspect panel, copy from brief §7–8. |
| `src/audio.js` | Soundscape, off by default. |
| `src/leaves.js` | Drifting maple leaves (no blossom: the photo is summer to about 30 October 1951). |
| `dev-reference/` | Bischof photo for the overlay (local only, gitignored). |

## Audio

Audio is not in the repo (`audio/` is gitignored). Files go in `public/audio/` with these names; missing ones are skipped (`audio/manifest.json` is generated from the folder), so a fresh clone runs silently.

| Layer | File | Source |
|---|---|---|
| Bed | `bed-wind-leaves.mp3` | BBC Sound Effects, mountain ambience |
| Music | `music.mp3` | Pixabay, Alex Morgan, *Zen Garden Stillness* |
| Birds | `bird-01.mp3` … `bird-06.mp3` | not yet |
| Wood | `creak-01.mp3` … `creak-04.mp3` | not yet |
| Bell | `bell.mp3` | not yet |

## Checks

After any geometry change: `?dev`, "View through Bischof's camera", overlay at 0 and ~0.5, compare against the photo, then **Region check**.
