/**
 * Suborbital point-to-point transfer physics (fusion impulse, space phase).
 *
 * Architecture modeled on real point-to-point concepts (e.g. Starship ballistic
 * hops): the EDF / actuator-disk system handles the atmospheric phases (pad
 * climb and terminal landing) and the deuterium-fusion impulse handles the
 * exoatmospheric transfer arc between two points on Earth. This module computes
 * that arc with pure Keplerian mechanics.
 *
 * For two surface points separated by a central angle β, the minimum-energy
 * ballistic trajectory is an ellipse with Earth's center at one focus and the
 * launch/landing points symmetric about apogee. Solving for the minimum
 * semi-major axis gives:
 *
 *   e      = (1 − sin(β/2)) / cos(β/2)
 *   a      = R(1 + sin(β/2)) / 2
 *   v_inj  = sqrt( 2μ·sin(β/2) / (R·(1 + sin(β/2))) )     [injection speed]
 *   r_apogee = a·(1 + e)                                   [apogee radius]
 *
 * Flight time follows from Kepler's equation (mean anomaly n = sqrt(μ/a³)):
 * the arc passes through apogee, so the time is twice the time from apogee to
 * one surface point.
 *
 * The rocket propellant needed for the injection burn comes from the fusion
 * drive's Tsiolkovsky budget:
 *
 *   m_prop = m_dry · ( exp(Δv / Vₑ) − 1 )
 *
 * It also models two related space regimes:
 *   - circular orbit insertion (LEO):  v_orb = sqrt(μ / (R + h))
 *   - escape velocity:                  v_esc = sqrt(2μ / (R + h)) = √2·v_orb
 */

import { calculateFusionDrive, DEFAULT_FUSION_CONFIG } from './fusionDrive.js?v=10';

export const GRAVITATIONAL_PARAMETER_M3S2 = 3.986004418e14; // μ Earth (m³/s²)
export const EARTH_RADIUS_M = 6_371_000;                    // mean radius (m)
const DEG2RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Minimum-energy ballistic (suborbital) transfer between two surface points.
 * @param {object} input - { centralAngleDeg } in (0, 180].
 * @returns frozen SI snapshot of the transfer arc.
 */
export function suborbitalTrajectory({ centralAngleDeg }) {
  const beta = clamp(finiteOr(centralAngleDeg, 10), 0.5, 180) * DEG2RAD;
  const s = Math.sin(beta / 2);
  const c = Math.cos(beta / 2);

  const eccentricity = (1 - s) / c;
  const semiMajorAxisM = (EARTH_RADIUS_M * (1 + s)) / 2;
  const apogeeRadiusM = semiMajorAxisM * (1 + eccentricity);
  const apogeeAltitudeKm = (apogeeRadiusM - EARTH_RADIUS_M) / 1000;

  const launchDeltaVMs = Math.sqrt((2 * GRAVITATIONAL_PARAMETER_M3S2 * s) / (EARTH_RADIUS_M * (1 + s)));

  // Kepler: time of flight (both symmetric halves of the arc through apogee).
  const eccentricAnomalyA = Math.acos(-eccentricity);
  const meanAnomalyA = eccentricAnomalyA - eccentricity * Math.sin(eccentricAnomalyA);
  const meanMotion = Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / semiMajorAxisM ** 3);
  const flightSeconds = (2 * (Math.PI - meanAnomalyA)) / meanMotion;

  const rangeKm = (EARTH_RADIUS_M * beta) / 1000;
  const circularOrbitalVelocityMs = Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / EARTH_RADIUS_M);

  return Object.freeze({
    centralAngleDeg: beta / DEG2RAD,
    rangeKm,
    launchDeltaVMs,
    apogeeAltitudeKm,
    apogeeFractionOfC: launchDeltaVMs / 299_792_458,
    flightMinutes: flightSeconds / 60,
    semiMajorAxisKm: semiMajorAxisM / 1000,
    eccentricity,
    injectionFractionOfOrbitalVelocity: launchDeltaVMs / circularOrbitalVelocityMs
  });
}

/**
 * Plans a one-way point-to-point mission with a given fusion drive: computes the
 * transfer arc and the rocket propellant the drive must burn for the injection.
 *
 * @param {object} input - overrides of DEFAULT_FUSION_CONFIG plus:
 *   centralAngleDeg: destination central angle in (0, 180].
 *   burnEfficiency: optional extra efficiency applied to the rocket burn
 *                   (gravity + steering losses), default 0.9.
 * @returns frozen mission plan with feasibility vs. the propellant budget.
 */
export function planPointToPointMission(input = {}) {
  const centralAngleDeg = clamp(finiteOr(input.centralAngleDeg, 10), 0.5, 180);
  const burnEfficiency = clamp(finiteOr(input.burnEfficiency, 0.9), 0.3, 1);

  const trajectory = suborbitalTrajectory({ centralAngleDeg });

  const driveConfig = { ...DEFAULT_FUSION_CONFIG, ...input };
  const drive = calculateFusionDrive({
    thrustN: 0, // design-exhaust-velocity mode: derive thrust from jet power
    fusionPowerKw: driveConfig.fusionPowerKw,
    exhaustEfficiency: driveConfig.exhaustEfficiency,
    exhaustVelocityMs: driveConfig.exhaustVelocityMs,
    propellantMassKg: driveConfig.propellantMassKg,
    dryMassKg: driveConfig.dryMassKg,
    fuelType: driveConfig.fuelType
  });

  const exhaustVelocityMs = drive.exhaustVelocityMs;
  const dryMassKg = driveConfig.dryMassKg;
  const propellantAvailableKg = driveConfig.propellantMassKg;

  // Rocket equation: propellant for the injection burn.
  const deltaVNeededMs = trajectory.launchDeltaVMs / burnEfficiency;
  const propellantRequiredKg = dryMassKg * (Math.exp(deltaVNeededMs / exhaustVelocityMs) - 1);
  const feasible = propellantRequiredKg <= propellantAvailableKg;
  const propellantAfterKg = Math.max(0, propellantAvailableKg - propellantRequiredKg);

  // Max range achievable by fully draining the propellant budget.
  const maxDeltaVMs = exhaustVelocityMs * Math.log(1 + propellantAvailableKg / dryMassKg);
  const maxInjectionSpeedMs = maxDeltaVMs * burnEfficiency;
  const ratio2 = (maxInjectionSpeedMs / Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / EARTH_RADIUS_M)) ** 2;
  const sMax = ratio2 / (2 - ratio2); // from v = v_c·sqrt(2s/(1+s))
  const maxCentralAngleDeg = clamp(2 * Math.asin(Math.max(0, Math.min(1, sMax))) / DEG2RAD, 0.5, 180);
  const maxTrajectory = suborbitalTrajectory({ centralAngleDeg: maxCentralAngleDeg });

  return Object.freeze({
    centralAngleDeg,
    trajectory,
    drive: Object.freeze({
      exhaustVelocityMs,
      jetPowerKw: drive.jetPowerW / 1000,
      thrustN: drive.thrustN
    }),
    deltaVNeededMs,
    propellantRequiredKg,
    propellantAvailableKg,
    propellantAfterKg,
    feasible,
    maxRange: Object.freeze({
      centralAngleDeg: maxCentralAngleDeg,
      rangeKm: maxTrajectory.rangeKm,
      apogeeAltitudeKm: maxTrajectory.apogeeAltitudeKm,
      flightMinutes: maxTrajectory.flightMinutes
    })
  });
}

/**
 * Circular-orbit and escape-velocity regime at a given altitude.
 * @param {object} input - { altitudeKm }.
 * @returns {object} orbit velocity, orbital period, and escape velocity.
 */
export function orbitRegime({ altitudeKm = 0 }) {
  const altitudeM = Math.max(0, finiteOr(altitudeKm, 0)) * 1000;
  const radiusM = EARTH_RADIUS_M + altitudeM;
  const orbitalVelocityMs = Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / radiusM);
  const escapeVelocityMs = Math.sqrt(2 * GRAVITATIONAL_PARAMETER_M3S2 / radiusM);
  const periodMinutes = (2 * Math.PI * radiusM / orbitalVelocityMs) / 60;

  return Object.freeze({
    altitudeKm: altitudeM / 1000,
    radiusKm: radiusM / 1000,
    orbitalVelocityMs,
    escapeVelocityMs,
    escapeToOrbitalRatio: escapeVelocityMs / orbitalVelocityMs, // √2
    periodMinutes
  });
}

/**
 * Plans an ascent from the surface to a circular orbit at a given altitude,
 * using the fusion drive's rocket budget for the orbital insertion burn.
 *
 * The total Δv lumps the orbital velocity plus gravity/drag losses typical of a
 * real ascent. It then reports whether the onboard propellant can cover it, and
 * the minimum tank required to reach the target (honest feasibility readout).
 *
 * @param {object} input - overrides of DEFAULT_FUSION_CONFIG plus:
 *   altitudeKm: target circular orbit altitude.
 *   gravityLossMs: lumped gravity + drag losses for the ascent (default 1_400).
 * @returns frozen plan for the orbital insertion mission.
 */
export function planOrbitalInsertion(input = {}) {
  const altitudeKm = Math.max(0, finiteOr(input.altitudeKm, 400));
  const gravityLossMs = Math.max(0, finiteOr(input.gravityLossMs, 1_400));

  const regime = orbitRegime({ altitudeKm });
  const deltaVTotalMs = regime.orbitalVelocityMs + gravityLossMs;

  const driveConfig = { ...DEFAULT_FUSION_CONFIG, ...input };
  const drive = calculateFusionDrive({
    thrustN: 0, // design-exhaust-velocity mode
    fusionPowerKw: driveConfig.fusionPowerKw,
    exhaustEfficiency: driveConfig.exhaustEfficiency,
    exhaustVelocityMs: driveConfig.exhaustVelocityMs,
    propellantMassKg: driveConfig.propellantMassKg,
    dryMassKg: driveConfig.dryMassKg,
    fuelType: driveConfig.fuelType
  });
  const exhaustVelocityMs = drive.exhaustVelocityMs;
  const dryMassKg = driveConfig.dryMassKg;
  const propellantAvailableKg = driveConfig.propellantMassKg;

  const propellantRequiredKg = dryMassKg * (Math.exp(deltaVTotalMs / exhaustVelocityMs) - 1);
  const feasible = propellantRequiredKg <= propellantAvailableKg;
  const propellantAfterKg = Math.max(0, propellantAvailableKg - propellantRequiredKg);

  // With the current tank, what Δv can the drive deliver? This is the honest
  // ceiling: reaching LEO needs ≈ v_orb (≥7.3 km/s) before any losses, so a
  // tank that only provides a few km/s cannot insert into low Earth orbit.
  const maxDeltaVMs = exhaustVelocityMs * Math.log(1 + propellantAvailableKg / dryMassKg);

  return Object.freeze({
    altitudeKm,
    deltaVTotalMs,
    gravityLossMs,
    regime,
    drive: Object.freeze({ exhaustVelocityMs, jetPowerKw: drive.jetPowerW / 1000, thrustN: drive.thrustN }),
    propellantRequiredKg,
    propellantAvailableKg,
    propellantAfterKg,
    feasible,
    maxDeltaVMs,
    canReachLowEarthOrbit: feasible && altitudeKm >= 150
  });
}

