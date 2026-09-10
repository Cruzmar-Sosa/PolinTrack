---
name: tracking-realtime-engine
description: "Handles real-time GPS tracking from devices to backend and frontend using optimized streaming, batching, and persistence strategies."
risk: high
source: custom
version: "1.0"
tags: [tracking, gps, realtime, websocket, location, streaming]
---

# /tracking-realtime-engine — Real-Time GPS System

Build a **real-time location tracking system** from device → backend → frontend.

---

## 🎯 Goal

- track user/bike position in real-time
- persist location history
- stream updates efficiently
- avoid performance bottlenecks

---

## 🧠 When to Use

- GPS tracking
- live maps
- bike/user movement
- delivery/Uber-like features

---

## ⚙️ Core Principles

- NEVER send GPS every 1s (overkill)
- batch or throttle updates (3–5s)
- backend is source of truth
- frontend subscribes to updates

---

## 🧩 Step 1: Data Model

Use:

```prisma
model BikeLocation {
  id        String   @id @default(uuid())
  bikeId    String
  latitude  Float
  longitude Float
  speed     Float
  timestamp DateTime @default(now())

  @@index([bikeId, timestamp])
}
 ---

## 📡 Step 2: Device Tracking (Frontend / Mobile)

Use browser or mobile GPS:

navigator.geolocation.watchPosition((pos) => {
  sendToBackend({
    lat: pos.coords.latitude,
    lng: pos.coords.longitude
  });
});

🔄 Step 3: Backend Ingestion

NestJS endpoint:

@Post('track')
track(@Body() dto: TrackDto) {
  return this.trackingService.save(dto);
}
⚡ Step 4: Optimization
send every 3–5 seconds
ignore small movements (<5m)
batch inserts if needed
🔌 Step 5: Real-Time Delivery

Use:

WebSockets (recommended)
or polling (MVP)
🧠 Step 6: Frontend Sync
subscribe to updates
update marker position
🚨 Common Errors
sending too many requests
no throttling
no indexing in DB
not handling GPS errors
🏁 Output
real-time tracking system
scalable ingestion pipeline
```
