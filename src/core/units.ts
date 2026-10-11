/**
 * Units for areas and distances. "Imperial" means miles and acres (US, UK
 * and a few others); everyone else gets metric.
 */
export type UnitSystem = 'metric' | 'imperial';
/** What the user picked in Settings; 'auto' follows the phone. */
export type UnitPreference = 'auto' | UnitSystem;

const M2_PER_KM2 = 1e6;
const M2_PER_MI2 = 2_589_988.11;
const M2_PER_ACRE = 4_046.856;
const M_PER_MI = 1_609.344;
const M_PER_FT = 0.3048;

/** The phone's measurement system as expo-localization reports it ('metric', 'us', 'uk' or null). */
export function unitsForPhone(measurementSystem: string | null | undefined): UnitSystem {
  return measurementSystem === 'us' || measurementSystem === 'uk' ? 'imperial' : 'metric';
}

export function resolveUnits(pref: UnitPreference, measurementSystem: string | null | undefined): UnitSystem {
  return pref === 'auto' ? unitsForPhone(measurementSystem) : pref;
}

const num = (n: number, digits: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Two decimals for small numbers so progress stays visible, whole numbers for big ones. */
const digitsFor = (n: number) => (n >= 100 ? 0 : 2);

export function formatArea(m2: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const mi2 = m2 / M2_PER_MI2;
    // Below a tenth of a square mile, acres read better (1 mi² = 640 acres).
    if (mi2 >= 0.1) return `${num(mi2, digitsFor(mi2))} mi²`;
    return `${num(Math.round(m2 / M2_PER_ACRE), 0)} acres`;
  }
  if (m2 >= M2_PER_KM2) {
    const km2 = m2 / M2_PER_KM2;
    return `${num(km2, digitsFor(km2))} km²`;
  }
  return `${num(Math.round(m2), 0)} m²`;
}

export function formatDistance(m: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const mi = m / M_PER_MI;
    if (mi >= 0.1) return `${num(mi, mi >= 100 ? 0 : 1)} mi`;
    return `${num(Math.round(m / M_PER_FT), 0)} ft`;
  }
  if (m >= 1000) return `${num(m / 1000, m >= 100_000 ? 0 : 1)} km`;
  return `${num(Math.round(m), 0)} m`;
}
