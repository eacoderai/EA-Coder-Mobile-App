# EA Coder Mobile App — Release 0.2.0

## Summary
- Introduces first-login plan selection with enforced route protection.
- Adds server endpoints to explicitly select plans and refine premium upgrades.
- Updates Subscription UI and SubmitStrategy gating for a clearer upgrade path.

## Changes
- Server
  - New: `POST /subscription/select` to activate `basic` or `premium`.
  - Change: `POST /subscription/upgrade` sets `expiryDate` for premium and posts welcome notification.
- App
  - New: `plan` state in `App.tsx`; blocks restricted screens when no plan.
  - UI: `SubscriptionScreen` shows "No active plan selected" state and CTA to select Basic.
  - Validation: `SubmitStrategyScreen` redirects if no plan; enforces free-tier limits.

## Testing
- Unit tests (Vitest): 18/18 passing across auth/analyze/profile flows.
- Device snapshots (Playwright): 14/14 across phones and tablets.
- Manual preview: Verified first-login gating and Basic activation CTA.

## Upgrade Notes
- If existing users rely on automatic Basic defaults, ensure backend is updated and migrated to `select` endpoint on first login.
- Confirm environment variables and Supabase function URLs are correct for staging/production.

## Versioning
- Web: `package.json` bumped to `0.2.0`.
- Android: `versionCode=2`, `versionName=1.1`.
- iOS: `MARKETING_VERSION=1.1`, `CURRENT_PROJECT_VERSION=2`.

## Known Issues
- Local testing of Supabase functions requires Supabase CLI; recommend validating on staging.
- iOS simulator run may require Xcode configuration and a selected simulator device.