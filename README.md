
# EA Coder Mobile App

  This is a code bundle for EA Coder Mobile App. The original project is available at https://www.figma.com/design/AxL6XDewCnLwlLJplw7Jx4/EA-Coder-Mobile-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
 
  ## Anthropic API Setup
 
  The server uses Anthropic Messages API directly for AI features.
  
  - Set `ANTHROPIC_API_KEY` in your environment (preferred).
  - Optionally set `CLAUDE_MODEL` (default: `claude-3.5-sonnet-20241022`).
  - `CLAUDE_API_BASE` defaults to `https://api.anthropic.com/v1/messages`.
  
  Example `.env` for server functions:
  
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  CLAUDE_MODEL=claude-3.5-sonnet-20241022
  ```
  
  Note: OpenRouter configuration has been removed. Ensure no `OR_*` vars remain.
  # EA-Coder

## Free Generations Usage Sync and 403 Handling

- A new authenticated endpoint `GET /make-server-00a119be/usage` is exposed by the Supabase Edge Function to return `{ count, remaining, window }` for the user’s free EA generations (monthly reset).
- The client now loads this usage on sign-in and uses it to determine gating for strategy creation, ensuring alignment with server-side limits and preventing unexpected `403` responses when the UI shows remaining quota.
- The "Generate Expert Advisor" button’s 403 handling was refined: when quota remains, 403s are treated as informational with a lightweight `console.warn` instead of a verbose error object; when quota is exhausted, the user is informed and redirected to `Subscription`.

This change is backwards compatible and does not alter existing feature behavior beyond reducing noisy logs and syncing gating with the authoritative server count.


## Developer Override for Premium Upgrade

To facilitate development and testing without actual payment processing, a developer override system has been implemented for premium upgrades.

### How to Enable
1. In your `.env` file, set `VITE_DEV_OVERRIDE_PREMIUM=true`.
2. Restart the development server if it's running.

### What it Does
- When enabled, clicking the "Upgrade to Premium" button will simulate a successful upgrade without calling payment APIs.
- It sets a simulated premium subscription with a 1-week expiry.
- Displays a "DEV MODE" badge on the premium card.
- Logs the override action to the console.
- Shows a success toast with "(Dev Mode)" indicator.
- Preserves all premium features and UI flow.
- Can be toggled by changing the env variable and restarting the app.

Note: This is for development only. Do not enable in production.