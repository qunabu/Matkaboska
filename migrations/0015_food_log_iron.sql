-- Iron per logged entry, so the tracking page can show żelazo next to kcal and
-- protein. Recipes and products already carry iron_mg; the food log dropped it,
-- which left the weekly summary without the one macro this plan cares about most.
ALTER TABLE food_log ADD COLUMN iron_mg REAL;
