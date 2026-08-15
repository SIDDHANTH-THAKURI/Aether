/* ------------------------------------------------------------------
   Project registry.

   To add a project: drop its .html in this folder, then append one
   entry below. The gallery, filters and counters all read from here.

   status: "live"  → clickable card
           "soon"  → dimmed, not clickable
------------------------------------------------------------------- */
export const projects = [
  {
    id: "phoenix",
    title: "Phoenix",
    subtitle: "Snap · Cup · Throw",
    glyph: "🔥",
    accent: "#ff8a2b",
    href: "phoenix.html",
    status: "live",
    needs: "Camera · WebGL2",
    description:
      "Snap your fingers to strike a spark, open your palm to catch it, then flick your " +
      "hand to hurl the fireball. Both hands run independently. GPU particle system with " +
      "bloom, heat haze and shockwave lensing, plus fully synthesised sound.",
    tags: ["Hand tracking", "WebGL2", "Particles", "WebAudio"],
  },
  {
    id: "kamehameha",
    title: "Kamehameha",
    subtitle: "Charge · Release",
    glyph: "🌀",
    accent: "#4fa8ff",
    href: "kame.html",
    status: "live",
    needs: "Camera",
    description:
      "Cup both palms together to charge an energy orb, then thrust to fire. Charge time " +
      "sets the beam's size and length, and the release direction is read from how your " +
      "hands were travelling at the moment you let go.",
    tags: ["Hand tracking", "Canvas", "Gesture chain"],
  },
  {
    id: "particle-field",
    title: "Particle Field",
    subtitle: "Ambient · Looping",
    glyph: "✷",
    accent: "#6fd8ff",
    href: "show.html",
    status: "live",
    needs: "WebGL",
    description:
      "160,000 GPU particles morphing between five forms — sphere, torus knot, galaxy, " +
      "wave field and helix. No input needed; built to be left running on a projector.",
    tags: ["Three.js", "Shaders", "Ambient"],
  },
  {
    id: "next",
    title: "Next project",
    subtitle: "In the workshop",
    glyph: "◇",
    accent: "#8d8f9c",
    href: "",
    status: "soon",
    needs: "—",
    description:
      "Slot reserved. Add an entry to projects.js and it appears here automatically.",
    tags: ["Soon"],
  },
];
