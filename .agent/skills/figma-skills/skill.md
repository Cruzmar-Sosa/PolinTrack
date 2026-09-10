# Figma Replication Skill

## Purpose

Replicate provided Figma designs, screenshots, exported frames, or UI references with maximum visual fidelity and minimum reinterpretation.

This skill exists to preserve premium UI/UX consistency across the Rent_App ecosystem.

---

# Core Rules

## 1. Pixel Fidelity First

When a design reference is provided:

- DO NOT redesign
- DO NOT simplify
- DO NOT reinterpret spacing
- DO NOT replace layout structures
- DO NOT invent alternative UI

The implementation must visually match the provided reference as closely as possible.

Priority:

1. Layout fidelity
2. Spacing fidelity
3. Typography fidelity
4. Image positioning fidelity
5. Responsive fidelity
6. Animation fidelity

---

# 2. Design Preservation Rules

Preserve exactly:

- typography hierarchy
- paddings
- margins
- border radius
- shadows
- gradients
- image placements
- overlays
- card proportions
- visual balance
- whitespace density

Avoid:

- generic SaaS redesigns
- Tailwind default-looking UI
- flat replacements
- simplistic spacing rewrites

---

# 3. Image Handling Rules

Images are CRITICAL UI elements.

Never:

- stretch images
- crop important content
- distort aspect ratio
- use object-fill blindly

Prefer:

- object-cover
- object-contain
- controlled overflow clipping
- responsive containers

If the reference image is artistic/hero-oriented:

- preserve composition priority
- preserve focal point
- avoid aggressive cropping on mobile

---

# 4. Responsive Behavior

The responsive adaptation must preserve:

- visual identity
- hierarchy
- emotional impact
- focal sections

Mobile adaptation should:

- stack intelligently
- preserve hero visibility
- avoid removing core visuals

Never:

- destroy the composition
- hide essential artwork unnecessarily
- collapse spacing aggressively

---

# 5. Existing Architecture Preservation

Always reuse existing project architecture before creating new systems.

Priorities:

- reuse existing components
- reuse utility functions
- reuse design tokens
- reuse image helpers
- reuse typography system

Avoid:

- duplicate logic
- duplicate UI systems
- inline URL builders
- duplicated animation systems

---

# 6. Premium UI Guidelines

This project targets:

- tourism
- premium mobility
- emotional UX
- immersive experience
- modern eco-tourism branding

UI should feel:

- cinematic
- premium
- immersive
- elegant
- alive
- tourism-oriented
- culturally rich

Avoid:

- corporate dashboard appearance
- sterile enterprise UI
- generic admin templates

---

# 7. Animation Philosophy

Animations must:

- feel subtle
- feel premium
- never distract
- improve immersion

Preferred:

- ambient floating
- gradient motion
- parallax softness
- glow transitions
- smooth hover states

Avoid:

- excessive bouncing
- arcade-like motion
- chaotic animations
- unnecessary motion spam

---

# 8. Frontend Safety Rules

Always validate:

- no hydration mismatch
- no layout shift (CLS)
- no undefined image src
- no broken next/image hosts
- no memory leaks
- no blob URL leaks
- no duplicated renders

Before completion:

- mobile verification
- tablet verification
- desktop verification

---

# 9. Fallback Rules

If real content exists:

- always prioritize real content

Fallbacks only apply when:

- image missing
- null imageKey
- invalid asset
- failed load

Never render placeholders if real assets are available.

---

# 10. Implementation Strategy

Before modifying code:

1. Identify the exact rendering component
2. Identify existing utilities/helpers
3. Reuse architecture
4. Apply minimal targeted refactor
5. Preserve existing responsive sizing
6. Validate visual parity

Avoid massive rewrites when a targeted fix is sufficient.

---

# 11. Token Efficiency Rules

Minimize unnecessary analysis.

Do NOT:

- scan unrelated files
- refactor unrelated modules
- redesign existing architecture
- create parallel systems

Focus ONLY on:

- affected components
- directly related utilities
- rendering pipeline involved

Use surgical modifications whenever possible.

---

# 12. UX Identity of Rent_App

Rent_App is NOT a generic admin system.

It represents:

- León, Nicaragua
- eco-tourism
- electric mobility
- colonial culture
- volcanos
- lakes
- adventure
- premium tourism experience

The UI should emotionally communicate:
"Explore León in a modern, immersive, eco-friendly way."
