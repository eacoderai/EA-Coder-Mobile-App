# QA Verification — Release 0.2.0

## Scope
Validate first-login plan gating, subscription selection, premium upgrade, and route protection across web/iOS/Android.

## Results
- Unit tests (Vitest)
  - 18/18 passing across 6 files: auth flow, analyze flow, profile navigation, limit toasts.
- Device snapshots (Playwright)
  - 14/14 passing across iPhone/Pixel/Galaxy/iPad/tablet viewports; container height matches viewport.
- Manual web preview
  - No active plan: restricted routes (`submit`, `code`, `chat`, `convert`, `analyze`, `notifications`) redirect to Subscription with toast.
  - Basic activation CTA: "Select Basic Plan" triggers `/subscription/select` and updates plan state.
  - Premium upgrade: upgrades set expiry and display welcome notification card.

## iOS/Android
- iOS sync: Project version bumped, ready for simulator build.
- Android sync: `versionCode` and `versionName` updated; build.gradle validated.

## Regression Checks
- Navigation via `onNavigate` still routes correctly for allowed screens.
- Usage counters and strategy count endpoints unaffected by plan gating.

## Issues/Notes
- Supabase functions are not executed in local web preview; verify endpoints on staging before production.
- Ensure environment configuration for `getFunctionUrl` aligns with staging and production.

## Recommendations
- Perform staging smoke tests: login (no plan), select Basic, upgrade to Premium, submit a strategy, analyze flow.
- Monitor error logs and analytics during rollout; prepare hotfix branch.