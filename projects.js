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
      "Cup both palms and a core forms, pulsing, dragging ambient energy in from the " +
      "room and lighting everything it touches. Thrust forward and it releases as a " +
      "sustained beam with a white-hot core, crackling tendrils and a shockwave.",
    tags: ["Hand tracking", "WebGL2", "Shaders", "WebAudio"],
  },
  {
    id: "sanctum",
    title: "Sanctum",
    subtitle: "Portals · Eye of Agamotto",
    glyph: "⟁",
    accent: "#ffb347",
    href: "strange.html",
    status: "live",
    needs: "Camera · WebGL2",
    description:
      "Two modes. Hold two fingers up and trace a circle to build a portal that " +
      "snaps open onto a real tunnel with a view beyond. Or wear the Eye of Agamotto: " +
      "circle both hands to fold its leaves open, point at an object, and tilt your " +
      "palm to scrub its timeline — the apple un-bites itself as you turn back.",
    tags: ["Hand tracking", "Body tracking", "Three.js", "Shaders", "WebAudio"],
  },
  {
    id: "mark-vii",
    title: "Mark VII",
    subtitle: "Suit up · Repulsors",
    glyph: "◎",
    accent: "#5fd0ff",
    href: "ironman.html",
    status: "live",
    needs: "Camera · WebGL2",
    description:
      "Stand back and put your arms out: armour flies in from off screen piece by " +
      "piece — boots, shins, thighs, chest, shoulders, arms, gauntlets, helmet — and " +
      "locks to your body, tracking as you move. The eyes light, a JARVIS HUD boots " +
      "up, and raising a palm spins the repulsor until you push it forward.",
    tags: ["Hand tracking", "Body tracking", "Three.js", "HUD", "WebAudio"],
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
