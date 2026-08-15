/**
 * Fusion impulse-drive model ("Star Trek impulse engine", engineering-real physics).
 *
 * The fiction in Star Trek is the compact reactor and the inertial dampers. The
 * underlying physics of a deuterium-fusion drive that ejects a high-velocity
 * plasma exhaust is NOT fiction: it is the rocket equation applied to a fusion
 * thruster. This module models that drive with classical rocketry so the AURORA
 * engineering panel can trade thrust against specific impulse.
 *
 * Thermodynamics used here:
 *
 *   jet power        Pj = η · P_fusion            (fraction of reactor power that
 *                                                 reaches the exhaust as kinetic)
 *   thrust           F  = ṁ · Ve
 *   jet power        Pj = ½ · ṁ · Ve²
 *   ⇒ exhaust vel.   Ve = 2 · Pj / F
 *   ⇒ mass flow      ṁ  = F / Ve
 *   specific impulse Isp = Ve / g₀
 *   burn time        tb = m_prop / ṁ
 *   rocket Δv        Δv = Ve · ln(m₀ / m_f)
 *
 * Deuterium (D + D) fusion energetics (both branches averaged):
 *
 *   energy per reaction ≈ 3.60 MeV
 *   deuteron mass       ≈ 2.014 u
 *   specific energy     ≈ 1.7 × 10¹⁴ J/kg   (~3.8 million × gasoline)
 *
 * That specific energy bounds the *ideal* self-propelled exhaust at ≈ 6% c
 * (Isp ≈ 1.9×10⁶ s) if every joule were to accelerate only the fusion products.
 * Realistic "impulse" designs add reaction mass so the exhaust is slower, denser
 * and delivers more thrust per watt — which is exactly the Star Trek trade.
 */

// --- Physical constants (CODATA / NIST) --------------------------------
const G_STANDARD = 9.80665; // kept local to avoid a circular import with physics.js
const ELECTRONVOLT_J = 1.602176634e-19;
const ATOMIC_MASS_UNIT_KG = 1.66053906660e-27;
export const SPEED_OF_LIGHT_MS = 299_792_458;

export const DEFAULT_FUSION_CONFIG = Object.freeze({
  // Reactor jet power (thermal power that actually reaches the plasma as kinetic
  // energy), in kW. A 12 MW jet is an aggressive, fission-scale plant — shown as a
  // consequence of the energy bookkeeping, not a promise of a pocket reactor.
  fusionPowerKw: 12_000,
  // Fraction of reactor power converted to exhaust kinetic energy.
  exhaustEfficiency: 0.82,
  // Design exhaust velocity (m/s) sets the "gearing" between thrust and Isp.
  exhaustVelocityMs: 35_000,
  // Reaction mass (deuterium + cold working fluid) carried for a mission.
  propellantMassKg: 120,
  // Dry structural mass used for the rocket Δv computation.
  dryMassKg: 1240,
  gravityMs2: G_STANDARD
});

const LIMITS = Object.freeze({
  fusionPowerKw: [1, 1_000_000],
  exhaustEfficiency: [0.05, 1],
  exhaustVelocityMs: [500, 5_000_000],
  propellantMassKg: [1, 50_000],
  dryMassKg: [50, 100_000],
  thrustN: [1, 50_000_000]
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedConfig(input = {}) {
  const config = { ...DEFAULT_FUSION_CONFIG, ...input };
  for (const key of ['fusionPowerKw', 'propellantMassKg', 'dryMassKg']) {
    config[key] = clamp(finiteOr(config[key], DEFAULT_FUSION_CONFIG[key]), LIMITS[key][0], LIMITS[key][1]);
  }
  config.exhaustEfficiency = clamp(finiteOr(config.exhaustEfficiency, DEFAULT_FUSION_CONFIG.exhaustEfficiency), 0.05, 1);
  config.exhaustVelocityMs = clamp(finiteOr(config.exhaustVelocityMs, DEFAULT_FUSION_CONFIG.exhaustVelocityMs), LIMITS.exhaustVelocityMs[0], LIMITS.exhaustVelocityMs[1]);
  return config;
}

/**
 * Computes the deuterium D+D fusion energetics.
 * @returns {object} energy per reaction (J), deuterons per kg, specific energy (J/kg),
 *                   and the ideal self-propelled exhaust velocity (m/s) at η = 1.
 */
export function deuteriumFusionConstants() {
  const energyPerReactionJ = 3.60e6 * ELECTRONVOLT_J;                 // ≈ 5.77e-13 J
  const deuteronMassKg = 2.014101778 * ATOMIC_MASS_UNIT_KG;           // ≈ 3.34e-27 kg
  const deuteronsPerKg = 1 / deuteronMassKg;
  const specificEnergyJkg = deuteronsPerKg * energyPerReactionJ;      // ≈ 1.7e14 J/kg
  const idealExhaustVelocityMs = Math.sqrt(2 * specificEnergyJkg);    // ≈ 1.86e7 m/s ≈ 6% c
  return Object.freeze({
    energyPerReactionJ,
    deuteronMassKg,
    deuteronsPerKg,
    specificEnergyJkg,
    idealExhaustVelocityMs,
    idealSpecificImpulseS: idealExhaustVelocityMs / G_STANDARD,
    idealExhaustFractionOfC: idealExhaustVelocityMs / SPEED_OF_LIGHT_MS
  });
}

/**
 * Core impulse-drive solver: given a requested thrust and the reactor jet power,
 * derive exhaust velocity, mass flow, Isp, burn time and Δv.
 *
 * @param {object} input - overrides of DEFAULT_FUSION_CONFIG plus:
 *   thrustN: requested thrust (N)
 * @returns frozen SI snapshot of the drive.
 */
export function calculateFusionDrive(input = {}) {
  const config = normalizedConfig(input);
  const g = Math.max(0.001, finiteOr(config.gravityMs2, G_STANDARD));

  const jetPowerW = config.fusionPowerKw * 1000 * config.exhaustEfficiency;
  const designExhaustVelocityMs = config.exhaustVelocityMs;

  // The user either fixes a target thrust (F → derive Ve) or fixes a design
  // exhaust velocity / Isp (Ve → derive F). A thrust of 0 means "engine off".
  const requestedThrustN = finiteOr(input.thrustN, 0);
  let thrustN;
  let exhaustVelocityMs;
  if (requestedThrustN > 0) {
    thrustN = clamp(requestedThrustN, LIMITS.thrustN[0], LIMITS.thrustN[1]);
    exhaustVelocityMs = Math.max(1, (2 * jetPowerW) / thrustN);
  } else {
    exhaustVelocityMs = Math.max(1, designExhaustVelocityMs);
    thrustN = (2 * jetPowerW) / exhaustVelocityMs;
  }
  const propellantMassFlowKgS = thrustN / exhaustVelocityMs;
  const specificImpulseS = exhaustVelocityMs / g;
  const burnTimeMinutes = config.propellantMassKg / propellantMassFlowKgS / 60;

  // Reaction mass needed purely to *fuel* the fusion (D+D) at this jet power is
  // negligible — this is the whole point of fusion as a "high Isp" source.
  const constants = deuteriumFusionConstants();
  const deuteriumFuelFlowKgS = jetPowerW / constants.specificEnergyJkg;
  const deuteriumFuelPerHourKg = deuteriumFuelFlowKgS * 3600;

  // Rocket Δv over the mission propellant budget.
  const initialMassKg = config.dryMassKg + config.propellantMassKg;
  const deltaVMs = exhaustVelocityMs * Math.log(initialMassKg / Math.max(1e-3, config.dryMassKg));

  // Rough, clearly-speculative reactor package mass. Real fusion cores today are
  // orders of magnitude heavier; this is a forward-looking scaling (≈1 kg/kW for
  // an optimistic closed-field compact reactor) — flagged as fictional envelope.
  const reactorMassEstimateKg = config.fusionPowerKw * 0.9;

  return Object.freeze({
    config: Object.freeze(config),
    thrustN,
    jetPowerW,
    exhaustVelocityMs,
    specificImpulseS,
    propellantMassFlowKgS,
    burnTimeMinutes,
    deltaVMs,
    deuteriumFuelFlowKgS,
    deuteriumFuelPerHourKg,
    reactorMassEstimateKg,
    exhaustFractionOfC: exhaustVelocityMs / SPEED_OF_LIGHT_MS,
    ideal: constants
  });
}
