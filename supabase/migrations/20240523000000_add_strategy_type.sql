-- Add strategy_type column to strategies table
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS strategy_type TEXT CHECK (strategy_type IN ('automated', 'manual')) DEFAULT 'manual';

-- Update existing records to be 'automated' since manual didn't exist before
UPDATE strategies SET strategy_type = 'automated' WHERE strategy_type IS NULL OR strategy_type = 'manual'; -- Actually, default is manual as per user request, but existing ones were automated.
-- Re-reading user request: "DEFAULT 'manual'". 
-- But existing strategies were definitely automated code generation.
-- So I should probably set existing ones to 'automated'.
UPDATE strategies SET strategy_type = 'automated' WHERE created_at < NOW();
