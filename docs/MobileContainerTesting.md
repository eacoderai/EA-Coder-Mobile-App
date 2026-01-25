# Mobile Container Testing & QA

This document outlines the device matrix, testing protocol, and QA checklist used to validate the responsive, safe-area-aware MobileContainer across phones and tablets.

## Device Matrix
- iPhone: 11/12/13/14/15 Pro (5.8"–6.1"), Pro Max (6.5"–6.7")
- Android: Common phones 5"–6.7" (e.g., Pixel 4/5/6, Galaxy S9/S10/S20)
- iPad: mini 7.9", 10.2"/10.9", Pro 11"/12.9"
- Tablets: 768×1024, 800×1280, 834×1194, 1024×1366, 1280×800

All devices tested in portrait and landscape orientations.

## Viewport & Safe Area Guidelines
- `viewport-fit=cover` meta tag enabled
- Use `svh`/`dvh` units to avoid iOS 100vh issues
- Respect safe areas via `env(safe-area-inset-*)`
- Bottom content padding: `bottom nav height + safe-area-bottom`

## Testing Protocol
1. Start dev server (`npm run dev`) and open app.
2. Verify the following on each device/viewport:
   - Container height equals viewport height (no overflow)
   - Content not hidden behind bottom nav
   - Safe-area padding applied at top/bottom in notch devices
   - No unintended margins/padding affecting layout integrity
3. Toggle visual debug markers (enabled in dev) and verify outlines align to device edges.
4. Interact with bottom nav buttons; ensure accessible touch targets (≥44×44pt).
5. Record screenshots for visual regression.

## Automated Visual Regression (Playwright)
- Run: `npm run test:devices` to cycle through target viewports and capture snapshots.
- Update baselines: `npm run test:devices:update`.
- Each test asserts container sizing and saves per-device snapshots.

## QA Checklist
- [ ] No overflow at edges (portrait/landscape)
- [ ] Safe areas respected (top/bottom/left/right)
- [ ] Bottom nav reachable and does not cover content
- [ ] Touch targets ≥ 44×44pt
- [ ] Performance consistent (no jank on scroll)
- [ ] Screenshots match baselines (visual regression stable)

## Notes
- In headless tests, safe-area env values are 0; container logic still ensures correct spacing via `--bottom-nav-height`.
- On real devices, the gesture bar height is captured via `env(safe-area-inset-bottom)`.