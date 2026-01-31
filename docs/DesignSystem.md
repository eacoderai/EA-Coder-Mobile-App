# Design System Specifications

## Overview
This document outlines the design specifications used for the EA Coder Mobile App, specifically focused on the modern dialogue popup and help components. The design system prioritizes accessibility, consistency, and a clean, modern aesthetic.

## Grid System & Spacing
We utilize a strict **8px grid system** for all spacing, padding, and margins to ensure visual rhythm and consistency.

- **Base Unit**: 4px (0.25rem)
- **Standard Spacing**:
  - `p-1` (4px): Minimal spacing
  - `p-2` (8px): Tight spacing (buttons, small containers)
  - `p-3` (12px): Comfortable spacing
  - `p-4` (16px): Standard padding for cards and containers
  - `p-6` (24px): Section padding
  - `gap-2` (8px): Grid gap for tight elements
  - `gap-4` (16px): Standard grid gap

## Typography
Typography follows a clear hierarchy using the system font stack (San Francisco on iOS, Roboto on Android, Segoe UI on Windows) for native feel.

- **Headings**:
  - `text-xl` (20px) + `font-bold`: Modal titles
  - `text-lg` (18px) + `font-semibold`: Section headers
- **Body**:
  - `text-base` (16px): Default text, form inputs
  - `text-sm` (14px): Secondary text, descriptions
  - `text-xs` (12px): Labels, metadata, badges
- **Weights**:
  - `font-bold` (700): Emphasis, titles
  - `font-medium` (500): Interactive elements, tabs
  - `font-normal` (400): Body text

## Color Palette & Theming
The app supports light and dark modes via CSS variables (Tailwind `bg-background`, `text-foreground`).

- **Primary**: Used for active states, key actions, and highlights.
- **Muted**: Used for backgrounds (`bg-muted`), secondary text (`text-muted-foreground`), and inactive states.
- **Border**: Subtle dividers (`border-border/40`) to maintain structure without visual noise.
- **Destructive**: Error states and dangerous actions.

## Component Specifications

### Dialogs & Modals (HelpBubble)
- **Container**:
  - `rounded-3xl`: Modern, friendly corner radius.
  - `bg-background/95 backdrop-blur-xl`: Frosted glass effect for depth.
  - `shadow-2xl`: High elevation to separate from content.
- **Header**:
  - Fixed height with `border-b` separator.
  - Distinct Close button (`rounded-full`, `w-9 h-9`) for easy dismissal.
- **Tabs**:
  - `h-11`: Large touch target for tab triggers.
  - `rounded-xl`: Consistent curvature with container.
  - Active state: `bg-background shadow-sm` for lift effect.
- **Buttons**:
  - **Minimum Touch Target**: 44px height for accessibility.
  - `rounded-xl`: Consistent styling.
  - States:
    - Hover: `hover:bg-primary/5` or `hover:shadow-md`
    - Active: `active:scale-95` (tactile feedback)
    - Disabled: `opacity-50 cursor-not-allowed`

## Animations
Subtle animations enhance perceived performance and polish.

- **Durations**:
  - Micro-interactions (hover, click): `duration-200` or `duration-300`.
  - Modals/Panels: `duration-300` ease-in-out.
- **Transitions**:
  - `transition-all`: Smoothly animate layout changes.
  - `active:scale-95`: "Press" effect on buttons.

## Accessibility (WCAG 2.1 AA)
- **Contrast**: Text elements meet minimum 4.5:1 contrast ratio against backgrounds.
- **Focus Management**: Focus is trapped within modals when open. Focus rings are visible on keyboard navigation.
- **Touch Targets**: All interactive elements have a minimum dimension of 44x44px.
- **ARIA**:
  - `role="dialog"` for modals.
  - `aria-label` on icon-only buttons.
  - `aria-expanded` states for accordions.
