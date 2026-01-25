# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-11-22

- First-login plan gating: new "no active plan" state preventing access to restricted flows until a plan is selected.
- Subscription selection endpoint: added `/subscription/select` to explicitly activate `basic` or `premium`.
- Premium upgrade behavior: `/subscription/upgrade` now sets `expiryDate` only for premium plans and posts welcome notification.
- App plan state: introduced `plan` state in `App.tsx` with route protection for `submit`, `code`, `chat`, `convert`, `analyze`, `notifications` when no active plan.
- Subscription UI: added basic plan activation CTA, status indicators, and error/loading handling.
- SubmitStrategy gating: redirects to subscription if no plan; enforces free-tier limits for basic.
- Build and preview verification: cross-device visual checks via Playwright and manual preview.

## [0.1.0] - 2025-11-21

- Initial release of EA Coder Mobile App.