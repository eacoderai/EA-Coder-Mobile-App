-- Run this in your Supabase SQL Editor to enable access to Stripe Sync data from Edge Functions

-- 1. Grant usage on the stripe schema to the service_role (used by Edge Functions)
GRANT USAGE ON SCHEMA stripe TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA stripe TO service_role;

-- 2. Create a secure view to easily link Users to Subscriptions
-- This assumes the Stripe Sync Engine has created tables in the 'stripe' schema
CREATE OR REPLACE VIEW public.user_subscriptions_view AS
SELECT 
    au.id AS user_id,
    au.email,
    s.id AS subscription_id,
    s.status,
    s.current_period_end,
    s.created,
    s.cancel_at_period_end,
    -- Extract product ID from the first item in the items array (if available in JSONB)
    -- Note: The exact column structure depends on the Sync method (wrappers vs extension).
    -- Adjust 'attrs' or 'data' based on your actual schema if needed.
    s.items
FROM auth.users au
JOIN stripe.customers c ON lower(c.email) = lower(au.email)
JOIN stripe.subscriptions s ON s.customer = c.id
WHERE s.status IN ('active', 'trialing');

-- 3. Grant access to this view
GRANT SELECT ON public.user_subscriptions_view TO service_role;
