# EA Coder – Official Pricing & Feature Specification  
**Version 1.0**  
**Last Updated: January 21, 2026**  
**Tech Stack: React + Supabase + Stripe**

## 🎯 App Overview
EA Coder is an AI-powered mobile application that enables retail traders to generate, analyze, tweak, and convert algorithmic trading strategies (Expert Advisors) using natural language. Users describe their trading logic in plain English via a strategy form, and the app generates production-ready code in **MQL4, MQL5, or Pine Script v5
Target users: retail algo traders, funded traders, developers, and trading educators.

## 💡 Monetization Strategy
- **Freemium model**: 1 free bot to prove value.
- **Recurring subscriptions only** (no one-time fees).
- **High-value pricing** reflecting replacement of $200–$500 freelance developer costs.
- **Stripe** handles billing; **Supabase** stores user tier and entitlements.

## 📦 Pricing Tiers
| Plan | Monthly Price | Annual Price | Stripe Price ID (Monthly) | Stripe Price ID (Annual) |
|------|---------------|--------------|----------------------------|---------------------------|
| **Free** | $0 | $0 | — | — |
| **Pro** | $19.00 | $199.00 | `price_pro_monthly` | `price_pro_annual` |
| **Elite** | $29.00 | $299.00 | `price_elite_monthly` | `price_elite_annual` |

> ✅ All prices in USD.  
> ✅ Annual plans offer ~15% savings.  
> ✅ Free tier requires no payment method.

## 🔑 Feature Entitlements by Tier
| Feature | Free | Pro | Elite |
|--------|------|-----|-------|
| **Strategy Submissions** | 1 total (lifetime) | ✅ up to 10 monthly | ✅ Unlimited |
| **MQL5 Code Generation** | ✅ (1 only) | ✅ | ✅ |
| **MQL4 Code Generation** | ❌ | ✅ | ✅ |
| **Pine Script v5 Generation** | ❌ | ❌ | ✅ |
| **AI Chat for Code Tweaks** | ❌ | ✅ (standard queue) | ✅ (priority queue) |
| **Code Converter (MQL ↔ Pine)** | ❌ | ❌ | ✅ |
| **Backtesting Preview Metrics**<br>(Win Rate, Max Drawdown, Profit Factor) | ❌ | ✅ | ✅ + AI summary and suggestions |
| **Save & Version History** | ❌ | Last 3 versions | Unlimited |
| **Download .mq4 / .mq5 / .pine Files** | ❌ | ✅ | ✅ |
| **Email Support** | ❌ | ≤48h | ≤12h |
| **Ad-Supported?** | ✅ (rewarded video only) | ❌ | ❌ |
| **Manual Re-analysis** | ❌ | ❌ | ✅ |
| **AI Recommendations** | ❌ | ❌ | ✅ |

> ⚠️ **Free Tier Rules**:  
> - Only **MQL5** allowed.  
> - After 1 bot generation, block further submissions until upgrade.  
> - No access to `/chat`, `/convert`, or backtesting UI.

## 🧠 Supabase Data Model
### `profiles` Table (extends `auth.users`)
```sql
id UUID (PK, FK to auth.users)
tier TEXT CHECK (tier IN ('free', 'pro', 'elite')) DEFAULT 'free'
stripe_customer_id TEXT
current_subscription_id TEXT
billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual', null))
free_bot_used BOOLEAN DEFAULT false
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### `strategies` Table
```sql
id UUID (PK)
user_id UUID (FK to profiles.id)
status TEXT -- 'pending', 'generated', 'error'
input JSONB -- { entry, exit, symbol, platform, ... }
output_code TEXT
language TEXT -- 'MQL4', 'MQL5', 'PineScript'
created_at TIMESTAMPTZ
```

### Row-Level Security (RLS)
- Users can only read/write their own `strategies`.
- `profiles` updatable only by user or Stripe webhook.

## ⚙️ Business Logic Rules
### Free Bot Enforcement
- On strategy submission:
  ```ts
  if (profile.tier === 'free' && profile.free_bot_used) {
    throw new Error('FREE_TIER_LIMIT_REACHED');
  }
  ```
- After successful generation, set `free_bot_used = true`.

### Platform Restrictions
- If `language === 'MQL4'` and `tier !== 'pro' && tier !== 'elite'` → reject.
- If `language === 'PineScript'` and `tier !== 'elite'` → reject.

### Stripe Webhook Handling
- On `checkout.session.completed` → update `profiles` with:
  - `tier`
  - `stripe_customer_id`
  - `current_subscription_id`
  - `billing_cycle`
- On `customer.subscription.deleted` → downgrade to `free`.

## 💳 Stripe Setup Requirements
### Products & Prices (in Stripe Dashboard)
| Product | Price ID | Amount | Interval |
|--------|--------|--------|--------|
| EA Coder Pro | `price_pro_monthly` | $19.00 | month |
| EA Coder Pro | `price_pro_annual` | $199.00 | year |
| EA Coder Elite | `price_elite_monthly` | $29.00 | month |
| EA Coder Elite | `price_elite_annual` | $299.00 | year |

> ✅ Enable **customer portal** for self-service upgrades/downgrades.

## 📱 React Native UI Requirements
### Paywall Triggers
- After 1st free bot → show **Pro upgrade sheet**.
- When user selects “Pine Script” → show **Elite upgrade sheet**.
- In chat screen (if free) → “Upgrade to Pro to edit with AI”.

### Plan Selector Screen
- Toggle between monthly/annual.
- Highlight **Pro Annual** as “Most Popular”.
- Show savings: “Save $29/year”.

### Post-Upgrade Flow
- Immediately refresh user profile from Supabase.
- Unlock UI elements based on `tier`.

## 📈 Analytics & Compliance
### Track Events (via your preferred analytics SDK)
- `free_bot_used`
- `paywall_viewed`
- `plan_selected` (with plan ID)
- `subscription_success`
- `feature_used` (e.g., `pine_script_generated`)

### Legal Disclaimers
Display on code/results screen:  
> “Generated code is for educational purposes only. Test thoroughly on a demo account before live trading. Past performance is not indicative of future results.”

## 🚫 Out of Scope
- Live trading execution
- Direct MetaTrader/TradingView integration
- One-time purchases
- Physical goods or services

> ✅ **Final Note**: This pricing reflects EA Coder’s unique position as the first AI-native, no-code EA generator in a high-value niche. Maintain premium positioning — do not discount core value.
```