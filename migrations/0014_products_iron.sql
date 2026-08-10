-- Iron content for products, so a product pinned to the plan can act as an iron
-- booster. Until now only recipe macros carried iron_mg and the weekly summary
-- hard-coded 0 for every product entry.
ALTER TABLE products ADD COLUMN iron_mg REAL;
