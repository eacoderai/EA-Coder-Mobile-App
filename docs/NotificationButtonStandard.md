Notification Button Positioning Standard

Purpose
- Enforce a single, pixel‑perfect notification button across screens, matching the Home screen’s header bell.

Reference Element (HomeScreen)
- Button classes: `relative p-2 hover:bg-white/10 rounded-full transition-colors`
- Icon size: `w-6 h-6`
- Badge classes: `absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center`

Exact Metrics
- Padding: `p-2` (8px)
- Badge offset: `-top-1` and `-right-1` (-4px each)
- Badge size: `w-5 h-5` (20px x 20px)
- Icon size: `w-6 h-6` (24px x 24px)
- Shape: `rounded-full`
- Interaction: `hover:bg-white/10`, `transition-colors`

Reusable Component
- Located at: `src/components/ui/NotificationBell.tsx`
- Usage:
  - `import { NotificationBell } from "../components/ui/NotificationBell";`
  - `<NotificationBell accessToken={accessToken} onNavigate={onNavigate} />`
- Do not override or replace the base classes listed above. If additional styling is required, append classes that do not change padding, position, or badge offsets.

Behavior & Responsiveness
- The button uses relative positioning; the badge is absolutely positioned within the button. This ensures consistent alignment inside any header layout.
- Works in both light/dark modes. The visual feedback is consistent due to the `hover:bg-white/10` overlay.
- Orientation changes do not affect position; the button and badge remain aligned relative to their container.

Navigation & Unread Count
- The component triggers `onNavigate('notifications')` when clicked.
- It fetches the unread count when an `accessToken` is provided and renders the badge with the exact position and size.

Adoption Guidance
- Replace any ad‑hoc notification buttons with the `NotificationBell` component to guarantee alignment and behavior.
- Avoid duplicating unread count logic in parent screens; the component handles it internally.

Testing Notes
- Validate on: Home, Analyze, Chat, Convert, Profile, and the Notifications screen header context where applicable.
- Confirm: padding, badge offsets, icon size, hover effect, and click navigation behavior are consistent.