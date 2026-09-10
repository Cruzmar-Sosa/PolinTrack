---
# 🧭 3. NAVIGATION INTELLIGENCE ENGINE

👉 AQUÍ VIVE LA “INTELIGENCIA”

```md
---

name: navigation-intelligence-engine
description: "Handles route logic, ETA calculations, navigation flow, and user progress tracking in map-based systems."
risk: high
source: custom
version: "1.0"
tags: [navigation, routes, eta, logic, maps]

---

# /navigation-intelligence-engine — Smart Navigation System

Handle route logic and navigation behavior.

---

## 🎯 Goal

- calculate routes
- estimate time
- track progress
- detect deviations

---

## 🧠 When to Use

- route suggestions
- navigation systems
- ETA calculations

---

## 🧩 Step 1: Route Model

```prisma
model Route {
  id        String
  name      String
  polyline  Json
  distance  Float
  duration  Int
}

🧭 Step 2: Route Selection Flow
user selects route
load polyline
render on map
⏱️ Step 3: ETA Calculation

Basic:

ETA = distance / avgSpeed

Advanced:

use Google Directions API
📍 Step 4: Progress Tracking
compare current GPS vs route
calculate % progress
🚨 Step 5: Deviation Detection
user off-route → alert
suggest correction
⚡ Step 6: UX Features
progress bar
next POI
distance remaining
🚨 Common Errors
recalculating too often
not handling GPS drift
no fallback routes
🏁 Output
intelligent navigation system
```
