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
 * Two fuel cycles are modeled:
 *
 *   D + D      →  (T + p) / (³He + n), Q ≈ 3.60 MeV, 2 deuterons/reaction
 *                specific energy ≈ 8.6 × 10¹³ J/kg (~1.9 million × gasoline)
 *   D + ³He    →  ⁴He + p,          Q ≈ 18.35 MeV, 1 deuteron + 1 ³He/reaction
 *                specific energy ≈ 3.5 × 10¹⁴ J/kg (~4 × D+D)
 *
 * ³He is ~4× more energetic per mass than D+D and, crucially, almost
 * aneutronic: almost all of the energy is released as charged particles
 * (⁴He + proton), so the exhaust can be a direct, steerable plasma jet with far
 * less neutron shielding. Its catch is scarcity — ³He is essentially absent on
 * Earth and is a practical source of the lunar regolith / gas-giant mining (the
 * very premise Star Trek uses).
 *
 * These energy densities bound the *ideal* self-propelled exhaust: ≈ 4.4% c for
 * D+D (Isp ≈ 1.3×10⁶ s) and ≈ 8.9% c for D+³He (Isp ≈ 2.7×10⁶ s), if every joule
 * were to accelerate only the fusion products. Realistic "impulse" designs add
 * reaction mass so the exhaust is slower, denser and delivers more thrust per
 * watt — which is exactly the Star Trek trade.
 */

// --- Physical constants (CODATA / NIST) --------------------------------
const G_STANDARD = 9.80665; // kept local to avoid a circular import with physics.js
const ELECTRONVOLT_J = 1.602176634e-19;
const ATOMIC_MASS_UNIT_KG = 1.66053906660e-27;
export const SPEED_OF_LIGHT_MS = 299_792_458;

/**
 * Fusion fuel cycles. `reactantMassU` is the total reactant mass per reaction
 * (which is why D+D divides the deuteron mass by two reactions per two atoms).
 */
export const FUSION_FUELS = Object.freeze({
  d2: Object.freeze({
    name: 'D + D',
    energyPerReactionJ: 3.60e6 * ELECTRONVOLT_J,                  // ≈ 5.77e-13 J
    reactantMassU: 2 * 2.014101778,                               // 4.028 u
    neutrons: true,                                               // D+D emits neutrons
    source: 'deutério (abundante na água)'
  }),
  dhe3: Object.freeze({
    name: 'D + ³He',
    energyPerReactionJ: 18.35e6 * ELECTRONVOLT_J,                 // ≈ 2.95e-12 J
    reactantMassU: 2.014101778 + 3.016029321,                     // 5.030 u
    neutrons: false,                                              // almost aneutronic
    source: 'deutério + hélio-3 (raro na Terra; Lua / gigantes gasosos)'
  })
});

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
  gravityMs2: G_STANDARD,
  // Fuel cycle: 'd2' (deuterium) or 'dhe3' (deuterium + helium-3).
  fuelType: 'd2'
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
  config.fuelType = config.fuelType === 'dhe3' ? 'dhe3' : 'd2';
  return config;
}

/**
 * Fusion energetics for a given fuel cycle.
 * @param {string} [fuelType='d2'] - 'd2' (deuterium) or 'dhe3' (deuterium + helium-3).
 * @returns {object} energy per reaction (J), reactions per kg, specific energy (J/kg),
 *                   ideal self-propelled exhaust velocity (m/s) at η = 1, and whether
 *                   the cycle is aneutronic.
 */
export function fusionConstants(fuelType = 'd2') {
  const fuel = FUSION_FUELS[fuelType] || FUSION_FUELS.d2;
  const reactantMassKg = fuel.reactantMassU * ATOMIC_MASS_UNIT_KG;
  const reactionsPerKg = 1 / reactantMassKg;
  const specificEnergyJkg = reactionsPerKg * fuel.energyPerReactionJ;
  const idealExhaustVelocityMs = Math.sqrt(2 * specificEnergyJkg);
  return Object.freeze({
    fuelType: fuelType === 'dhe3' ? 'dhe3' : 'd2',
    name: fuel.name,
    energyPerReactionJ: fuel.energyPerReactionJ,
    reactantMassKg,
    reactionsPerKg,
    specificEnergyJkg,
    neutrons: fuel.neutrons,
    source: fuel.source,
    idealExhaustVelocityMs,
    idealSpecificImpulseS: idealExhaustVelocityMs / G_STANDARD,
    idealExhaustFractionOfC: idealExhaustVelocityMs / SPEED_OF_LIGHT_MS
  });
}

/**
 * Backwards-compatible alias for the deuterium (D+D) cycle.
 * @returns {object} the D+D fusion constants.
 */
export function deuteriumFusionConstants() {
  return fusionConstants('d2');
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

  // Reaction mass needed purely to *fuel* the fusion cycle at this jet power is
  // negligible — this is the whole point of fusion as a "high Isp" source.
  const constants = fusionConstants(config.fuelType);
  const fuelFlowKgS = jetPowerW / constants.specificEnergyJkg;
  const fuelPerHourKg = fuelFlowKgS * 3600;

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
    fuelFlowKgS,
    fuelPerHourKg,
    reactorMassEstimateKg,
    exhaustFractionOfC: exhaustVelocityMs / SPEED_OF_LIGHT_MS,
    ideal: constants
  });
}
