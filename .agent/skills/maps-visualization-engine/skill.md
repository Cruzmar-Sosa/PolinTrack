---
# 🗺️ 2. MAPS VISUALIZATION ENGINE

👉 AQUÍ SOLO PINTAS — NO METES LÓGICA COMPLEJA

```md
---

name: maps-visualization-engine
description: "Renders maps, markers, routes, and UI elements using Google Maps or Mapbox in a scalable frontend architecture."
risk: medium
source: custom
version: "1.0"
tags: [maps, ui, google-maps, mapbox, visualization]

---

# /maps-visualization-engine — Map Rendering System

Render maps, markers, and routes in the frontend.

---

## 🎯 Goal

- display map
- show user position
- draw routes
- render markers

---

## 🧠 When to Use

- showing routes
- displaying bikes
- visualizing GPS

---

## 🧱 Step 1: Map Provider

Use:

- Google Maps API

---

## 🧩 Step 2: Base Component

```tsx
<GoogleMap center={center} zoom={14}>
  <Marker position={userLocation} />
</GoogleMap>

🧭 Step 3: Route Rendering

Use polyline:

<Polyline path={routePath} />
📍 Step 4: Markers
user
bikes
POIs
⚡ Step 5: UI Enhancements
custom icons
smooth transitions
zoom controls
🚨 Common Errors
re-rendering map too often
not memoizing markers
no loading fallback
🏁 Output
fully functional map UI
```
