// Shared booking constants — single source of truth imported by
// pages/book-service.js, pages/company/[slug]/book.js, and
// pages/api/create-pricing-booking.js.

export const MASTER_DEFAULTS = {
  sofa:        { standard_rate: 320, bulk_rate: 280, bulk_threshold: 10 },
  foam:        { standard_rate: 280, bulk_rate: 250, bulk_threshold: 10 },
  carpet:      { band_0_100: 25, band_101_300: 23, band_301_500: 22, band_500_plus: 20 },
  mattress:    { single_standard: 1500, single_bulk: 1200, double_standard: 2500, double_bulk: 2000 },
  curtain:     { small: 500, standard: 800, large: 1200, blackout: 1500 },
  tank:        { band_500: 2500, band_1000: 3500, band_2000: 5000, band_5000: 7000 },
  home_regular: {
    small_bed: 1200, small_lounge: 1500, small_kitchen: 800,  small_wash: 800,  small_garage: 800,  small_stair: 800,  small_store: 800,
    large_bed: 1500, large_lounge: 1500, large_kitchen: 1200, large_wash: 1200, large_garage: 1200, large_stair: 1200, large_store: 1200,
  },
  home_deep: {
    small_bed: 2000, small_lounge: 2000, small_kitchen: 1500, small_wash: 1500, small_garage: 1500, small_stair: 1500, small_store: 1500,
    large_bed: 2800, large_lounge: 2800, large_kitchen: 2000, large_wash: 2000, large_garage: 2000, large_stair: 2000, large_store: 2000,
  },
}

// Reads one rule value from the loaded company rules, falling back to the
// master default for that category+key if the company has no row for it yet
// (e.g. mid-migration, or a row was manually removed).
export function ruleValue(rulesByCategory, category, key) {
  const loaded = rulesByCategory?.[category]?.[key]
  return loaded != null ? Number(loaded) : MASTER_DEFAULTS[category][key]
}

export const TIME_SLOTS = [
  { value: "Morning (8am–12pm)",   label: "🌅 Morning",   sub: "8am–12pm"  },
  { value: "Afternoon (12pm–4pm)", label: "☀️ Afternoon", sub: "12pm–4pm" },
  { value: "Evening (4pm–8pm)",    label: "🌆 Evening",   sub: "4pm–8pm"  },
]
