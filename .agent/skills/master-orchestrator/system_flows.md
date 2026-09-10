# System Flows

## 1. Authentication & Hydration Flow

1. **User lands on App**.
2. **Middleware** checks for Session.
3. If session present:
   - Fetch `/auth/me`.
   - Fetch `/permissions/my`.
   - Hydrate Zustand Stores.
   - Render Sidebar based on `PAGE` permissions.
4. If session missing:
   - Redirect to `/auth/login`.

## 2. Bike Reservation Flow (Transactional)

1. **Frontend**: User selects Bike and clicks "Reserve".
2. **Backend**:
   - `ReservationService` starts a Prisma Transaction.
   - Check `Bike` status (must be `AVAILABLE`).
   - Create `Reservation` (status: `CONFIRMED`).
   - Update `Bike` (status: `IN_USE` or reserved logic).
   - Create `Payment` record (status: `PENDING`).
3. **Frontend**: Show confirmation and redirect to "My Rides".

## 3. Real-time Tracking Flow

1. **Bike API/IoT**: Sends GPS coordinates to `backend/tracking`.
2. **Backend**:
   - Update `BikeLocation` table.
   - Broadcast coordinate via WebSockets to joined clients.
3. **Frontend**: `useTracking` hook receives update -> Updates Marker position on `MapsComponent`.

## 4. Permission Enforcement Flow

1. **Frontend**: `CanAccess` component checks Zustand `PermStore`.
2. **Backend**: `PermissionsGuard` intercepts request:
   - Extract user role and requested module/action.
   - Match against `Permission` table in DB.
   - Reject with 403 if unauthorized.
