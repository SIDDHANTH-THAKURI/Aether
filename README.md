# Aether

Gesture-driven visual experiments that run entirely in the browser. Camera-tracked
hand gestures drive real-time WebGL effects — built to be projected.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page |
| `projects.html` | Gallery, generated from `projects.js` |
| `phoenix.html` | Snap → cup → throw fireballs (two-handed) |
| `kame.html` | Charge and release an energy beam |
| `strange.html` | Portals, and the Eye of Agamotto with scrubable time |
| `ironman.html` | Suit-up sequence, JARVIS HUD and repulsors |
| `show.html` | Ambient morphing particle field, no input needed |

### Shared modules

| Module | What it does |
| --- | --- |
| `handtrack.js` | Camera picking, One Euro filtering, hand/pose/face landmarks, 3D palm orientation, gesture gates, debug overlay |
| `site.js` | Landing + gallery shell: background shader, cursor embers, reveals |
| `strange/magic.js` | Procedural rune glyphs, magic circles, additive shaders |
| `strange/portal.js` | Portal rim, tunnel and the vista beyond |
| `strange/eye.js` | The Eye of Agamotto: housing, hinged leaves, Time Stone, chain |
| `strange/timeobjects.js` | Objects whose whole appearance is a function of t |
| `ironman/armor.js` | Procedural armour plates and the body-attachment manifest |

All 3D assets are **generated at runtime** from primitives and shaders. There
are no model or texture files to download.

## Running locally

The hand-tracked pages need `getUserMedia`, which browsers only allow on a secure
origin. `localhost` counts as secure; opening the files directly with `file://`
does **not** — the camera will be blocked.

```bash
# from this folder
python -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, etc.).

## Deploying

The site is plain static files with no build step.

**Netlify** — drag this folder onto the Netlify dashboard, or:

```bash
npx netlify-cli deploy --prod --dir .
```

`netlify.toml` already sets the publish directory and a `camera=(self)`
permissions policy.

**Vercel** — from this folder:

```bash
npx vercel --prod
```

Accept the defaults; there is no framework to detect and no build command.

Both hosts serve over HTTPS, which is what the camera needs in production.

## Adding a project

1. Drop the new `.html` file in this folder.
2. Append an entry to `projects.js`:

```js
{
  id: "my-thing",
  title: "My Thing",
  subtitle: "Short tagline",
  glyph: "◆",
  accent: "#7fdcff",
  href: "my-thing.html",
  status: "live",          // or "soon" for a dimmed placeholder
  needs: "Camera · WebGL2",
  description: "One or two sentences about what it does.",
  tags: ["Hand tracking", "WebGL2"],
}
```

The gallery card, the tag filters and the count on the landing page all pick it
up automatically.

## Requirements

- A Chromium browser is the safest bet; `phoenix.html` needs **WebGL2**.
- A webcam for `phoenix.html` and `kame.html`.
- Sound is synthesised in WebAudio and starts after the first click or keypress,
  because browsers block audio until the user interacts.

## Notes

- Video is processed locally and is never uploaded anywhere.
- MediaPipe's hand-tracking model and Three.js load from a CDN, so the first
  open of those pages needs an internet connection.
