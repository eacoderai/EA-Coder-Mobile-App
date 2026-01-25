# Theme Management

This app uses a centralized `ThemeProvider` to manage the UI theme (`light` or `dark`) consistently across all screens.

## How it works

- The provider initializes the theme from persistent storage (localStorage where available, cookie as a fallback, memory as a last resort). If no preference exists, it defaults to the system preference on first load.
- The theme is applied by setting the `dark` class and `data-theme` attribute on `document.documentElement`.
- The theme only changes when the user toggles via the UI control (e.g., the Dark Mode switch in Profile).

## Using in Components

```tsx
import { useTheme } from '../components/ThemeProvider';

function MyComponent() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle theme</button>
  );
}
```

## Accessibility

- The `Switch` control in Profile includes `role="switch"`, `aria-checked`, and `aria-label` for screen readers.
- All dark mode state changes occur predictably and do not auto-change based on system updates after initialization.

## Error Handling & Fallbacks

- Storage operations are wrapped in `try/catch`. If persistent storage is unavailable, preferences fall back to cookies or in-memory.
- When persistence is unavailable, the app logs a warning and still applies the theme for the session.

---

## Button Styling Specifications

The Button component is standardized across the app to provide consistent shape, sizing, and accessibility.

### Shape & Radius
- Default corner radius for all Buttons: `10px`.
- Icon Buttons are perfectly circular.
- Implementation:
  - Global CSS applies `border-radius: 10px` to `button[data-slot="button"]` with vendor prefixes.
  - Icon Buttons use `size-12 rounded-full` in the Button component (48px circle).
  - Generic circular buttons (`button.rounded-full`) also render as circles with minimum touch targets, excluding `data-slot="switch"`.

### Sizing & Touch Targets
- Minimum interactive size: `48px` for both width and height.
- Global CSS enforces `min-width`/`min-height` on buttons; Icon Buttons explicitly set equal width and height.
- Sizes:
  - `default`: height 36px (`h-9`), padding `px-4 py-2`, auto-adjusts for leading icons via `has-[>svg]`.
  - `sm`: height 32px (`h-8`), padding `px-3`.
  - `lg`: height 40px (`h-10`), padding `px-6`.
  - `icon`: 48px circle (`size-12 rounded-full`).

### Text Wrapping & Alignment
- Button labels wrap gracefully and remain centered.
- Global CSS adds `white-space: normal`, `text-wrap: balance`, `overflow-wrap: break-word`, `word-break: break-word`, `hyphens: auto`, and `text-align: center` for `button[data-slot="button"]`.

### Accessibility
- Focus indication: `focus-visible:ring-[3px]` with `ring-ring/50` maintained across variants.
- Contrast: Primary and destructive variants use design tokens that meet contrast guidelines; verify with DevTools Accessibility.
- Touch targets: All icon/circular buttons meet or exceed `48px` minimum.

### Notes
- Switch controls (`data-slot="switch"`) are excluded from generic circular sizing rules to preserve their native dimensions.
- For any raw `<button>` outside the shared component, add `rounded-full` for circles or ensure radius/padding match the specs; global CSS will align most cases.