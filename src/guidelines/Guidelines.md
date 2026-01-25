**Add your own guidelines here**
<!--

System Guidelines

Use this file to provide the AI with rules and guidelines you want it to follow.
This template outlines a few examples of things you can add. You can add your own sections and format it to suit your needs

TIP: More context isn't always better. It can confuse the LLM. Try and add the most important rules you need

# General guidelines

Any general rules you want the AI to follow.
For example:

* Only use absolute positioning when necessary. Opt for responsive and well structured layouts that use flexbox and grid by default
* Refactor code as you go to keep code clean
* Keep file sizes small and put helper functions and components in their own files.

--------------

# Design system guidelines
Rules for how the AI should make generations look like your company's design system

Additionally, if you select a design system to use in the prompt box, you can reference
your design system's components, tokens, variables and components.
For example:

* Use a base font-size of 14px
* Date formats should always be in the format “Jun 10”
* The bottom toolbar should only ever have a maximum of 4 items
* Never use the floating action button with the bottom toolbar
* Chips should always come in sets of 3 or more
* Don't use a dropdown if there are 2 or fewer options

You can also create sub sections and add more specific details
For example:


## Button
The Button component is a fundamental interactive element in our design system, designed to trigger actions or navigate
users through the application. It provides visual feedback and clear affordances to enhance user experience.

### Usage
Buttons should be used for important actions that users need to take, such as form submissions, confirming choices,
or initiating processes. They communicate interactivity and should have clear, action-oriented labels.

### Variants
* Primary Button
  * Purpose : Used for the main action in a section or page
  * Visual Style : Bold, filled with the primary brand color
  * Usage : One primary button per section to guide users toward the most important action
* Secondary Button
  * Purpose : Used for alternative or supporting actions
  * Visual Style : Outlined with the primary color, transparent background
  * Usage : Can appear alongside a primary button for less important actions
* Tertiary Button
  * Purpose : Used for the least important actions
  * Visual Style : Text-only with no border, using primary color
  * Usage : For actions that should be available but not emphasized
-->
## UI Change Log

- Free Usage Card spacing: Set a consistent 10px gap between the “Create New Strategy” button and the Free Generations card using `mt-[10px]` on the card container in `HomeScreen.tsx`. This ensures cross-browser consistency and maintains existing layout structure.
- Free Usage Card description: Removed the descriptive paragraph from the card to streamline the header area and avoid redundant copy. Verified that removal does not impact layout or functionality.
- Card internal padding: Added `pt-2` (8px) to the card container to balance vertical spacing while retaining established design tokens.

- Backtest Card removed: The standalone “Backtest (3-Year)” card and button were removed from `SubmitStrategyScreen.tsx`. Backtesting now runs automatically when analysis is triggered after strategy submission.
- Integrated backtesting: The analysis trigger includes a `backtest` payload (3-year window by default, single-currency when an instrument is selected, otherwise multi-currency majors). Results are integrated into the analysis output.

Files impacted:
- `src/components/HomeScreen.tsx`
- `src/components/SubmitStrategyScreen.tsx`
- `src/types/analysis.ts`

Rationale:
- Improve visual balance and ensure precise spacing regardless of content changes.
- Keep styles consistent with design system primitives and utility-first CSS approach.
- Streamline the submission flow and ensure analysis always includes backtesting without requiring manual action.

### Close Button (non-highlighted state)
- Remove interactive highlighting from modal and sheet close controls.
- No hover, focus, or ring visuals; keep consistent opacity and no background change.
- Implemented by stripping highlight classes and adding `outline-none` to close elements.
- Verified across browsers: hover, focus, click produce no visual change beyond default opacity.
- Applies to `DialogPrimitive.Close` in `src/components/ui/dialog.tsx` and `SheetPrimitive.Close` in `src/components/ui/sheet.tsx`.
