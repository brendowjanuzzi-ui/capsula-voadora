import { calculateFusionDrive } from './fusionDrive.js?v=6';

export const G_STANDARD = 9.80665;
export const SEA_LEVEL_DENSITY = 1.225;

// Fusion impulse-drive configuration used when propulsionModel === 'fusion'.
// These override DEFAULT_FUSION_CONFIG fields; see fusionDrive.js.
export const FUSION_PROPULSION_CONFIG = Object.freeze({
  propulsionModel: 'fusion',
  fusionPowerKw: 12_000,
  exhaustEfficiency: 0.82,
  fusionExhaustVelocityMs: 35_000,
  propellantMassKg: 120,
  fuelType: 'd2',
  // Mass of the fusion reactor hardware (core + magnets + shielding + radiators)
  // that the capsule carries when fusion mode is selected. This is the honest
  // weight of the "invisible bottle" — ~15 t for a ~15 MW D+³He reactor.
  fusionHardwareMassKg: 15_000
});

export const DEFAULT_CONFIG = Object.freeze({
  lengthM: 4.8,
  beamM: 3.1,
  heightM: 1.82,
  massKg: 1240,
  airDensityKgM3: SEA_LEVEL_DENSITY,
  airspeedMs: 36,
  liftThrottle: 0.86,
  propulsionThrottle: 0.46,
  liftPowerMaxKw: 720,
  propulsionPowerMaxKw: 420,
  liftActuatorAreaM2: 4.4,
  propulsionDiskAreaM2: 0.72,
  liftFigureOfMerit: 0.72,
  propulsionEfficiency: 0.78,
  dragCoefficient: 0.29,
  energyCapacityKwh: 180,
  gravityMs2: G_STANDARD,
  // Fusion impulse drive (active only when propulsionModel === 'fusion').
  propulsionModel: 'edf',
  fusionPowerKw: FUSION_PROPULSION_CONFIG.fusionPowerKw,
  exhaustEfficiency: FUSION_PROPULSION_CONFIG.exhaustEfficiency,
  fusionExhaustVelocityMs: FUSION_PROPULSION_CONFIG.fusionExhaustVelocityMs,
  propellantMassKg: FUSION_PROPULSION_CONFIG.propellantMassKg,
  fuelType: FUSION_PROPULSION_CONFIG.fuelType,
  fusionHardwareMassKg: FUSION_PROPULSION_CONFIG.fusionHardwareMassKg
});

const LIMITS = Object.freeze({
  lengthM: [3, 8],
  beamM: [1.8, 5],
  heightM: [1.2, 3.2],
  massKg: [500, 3000],
  airDensityKgM3: [0.35, 1.5],
  airspeedMs: [0, 160],
  liftThrottle: [0, 1],
  propulsionThrottle: [0, 1]
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG, ...input };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    config[key] = clamp(finiteOr(config[key], DEFAULT_CONFIG[key]), min, max);
  }

  for (const key of [
    'liftPowerMaxKw', 'propulsionPowerMaxKw', 'liftActuatorAreaM2',
    'propulsionDiskAreaM2', 'energyCapacityKwh', 'gravityMs2',
    'fusionPowerKw', 'fusionExhaustVelocityMs', 'propellantMassKg',
    'fusionHardwareMassKg'
  ]) {
    config[key] = Math.max(0.0001, finiteOr(config[key], DEFAULT_CONFIG[key]));
  }
  config.fusionHardwareMassKg = clamp(config.fusionHardwareMassKg, 0, 1_000_000);

  config.liftFigureOfMerit = clamp(finiteOr(config.liftFigureOfMerit, DEFAULT_CONFIG.liftFigureOfMerit), 0.05, 1);
  config.propulsionEfficiency = clamp(finiteOr(config.propulsionEfficiency, DEFAULT_CONFIG.propulsionEfficiency), 0.05, 1);
  config.dragCoefficient = clamp(finiteOr(config.dragCoefficient, DEFAULT_CONFIG.dragCoefficient), 0.02, 2);
  config.exhaustEfficiency = clamp(finiteOr(config.exhaustEfficiency, DEFAULT_CONFIG.exhaustEfficiency), 0.05, 1);
  config.propulsionModel = config.propulsionModel === 'fusion' ? 'fusion' : 'edf';
  return config;
}

/**
 * Momentum-theory actuator disk solver.
 *
 * It solves P_air = 2 ρ A vi (V + vi)² for induced velocity vi, then
 * T = 2 ρ A vi (V + vi). The bisection form remains stable at V = 0.
 */
export function actuatorDiskThrust({ powerW, densityKgM3, diskAreaM2, airspeedMs = 0, efficiency = 1 }) {
  const powerToAirW = Math.max(0, finiteOr(powerW, 0)) * clamp(finiteOr(efficiency, 1), 0, 1);
  const rho = Math.max(0.01, finiteOr(densityKgM3, SEA_LEVEL_DENSITY));
  const area = Math.max(0.001, finiteOr(diskAreaM2, 1));
  const velocity = Math.max(0, finiteOr(airspeedMs, 0));

  if (powerToAirW === 0) return { thrustN: 0, inducedVelocityMs: 0, powerToAirW: 0 };

  const requiredPower = inducedVelocity => 2 * rho * area * inducedVelocity * (velocity + inducedVelocity) ** 2;
  let low = 0;
  let high = 1;
  while (requiredPower(high) < powerToAirW && high < 2048) high *= 2;

  for (let iteration = 0; iteration < 64; iteration += 1) {
    const mid = (low + high) / 2;
    if (requiredPower(mid) < powerToAirW) low = mid;
    else high = mid;
  }

  const inducedVelocityMs = (low + high) / 2;
  const thrustN = 2 * rho * area * inducedVelocityMs * (velocity + inducedVelocityMs);
  return { thrustN, inducedVelocityMs, powerToAirW };
}

function ellipsoidSurfaceArea(a, b, c) {
  // Knud Thomsen approximation; relative error is normally below 1.1%.
  const p = 1.6075;
  return 4 * Math.PI * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p);
}

/**
 * Computes a deterministic SI-unit engineering snapshot for the AURORA.
 * The craft remains speculative; weight, drag, disk loading, thrust and
 * acceleration are classical mechanics / actuator-disk calculations.
 */
export function calculateFlightPhysics(input = {}) {
  const config = normalizedConfig(input);
  const {
    lengthM, beamM, heightM, massKg, airDensityKgM3: rho, airspeedMs,
    liftThrottle, propulsionThrottle, gravityMs2
  } = config;

  const semiLength = lengthM / 2;
  const semiBeam = beamM / 2;
  const semiHeight = heightM / 2;
  const hullVolumeM3 = (4 / 3) * Math.PI * semiLength * semiBeam * semiHeight;
  const wettedAreaM2 = ellipsoidSurfaceArea(semiLength, semiBeam, semiHeight);
  const frontalAreaM2 = Math.PI * semiBeam * semiHeight;

  // Effective mass: in fusion mode the craft carries the reactor hardware
  // (core + magnets + shielding + radiators). This is the honest consequence of
  // adding a ~15 t fusion reactor to a ~1.2 t airframe.
  const fusionHardwareMassKg = config.propulsionModel === 'fusion' ? config.fusionHardwareMassKg : 0;
  const effectiveMassKg = massKg + fusionHardwareMassKg;

  const weightN = effectiveMassKg * gravityMs2;
  const dynamicPressurePa = 0.5 * rho * airspeedMs ** 2;
  const dragN = dynamicPressurePa * config.dragCoefficient * frontalAreaM2;

  const liftPowerKw = config.liftPowerMaxKw * liftThrottle;
  const propulsionPowerKw = config.propulsionPowerMaxKw * propulsionThrottle;
  const liftDisk = actuatorDiskThrust({
    powerW: liftPowerKw * 1000,
    densityKgM3: rho,
    diskAreaM2: config.liftActuatorAreaM2,
    airspeedMs: 0,
    efficiency: config.liftFigureOfMerit
  });
  const propulsionDisk = actuatorDiskThrust({
    powerW: propulsionPowerKw * 1000,
    densityKgM3: rho,
    diskAreaM2: config.propulsionDiskAreaM2,
    airspeedMs,
    efficiency: config.propulsionEfficiency
  });

  const liftN = liftDisk.thrustN;

  // --- Fusion impulse drive branch (Star Trek-style) --------------------
  // When propulsionModel === 'fusion' the forward thrust is produced by a
  // deuterium-fusion plasma thruster instead of the electric EDF. Throttle
  // scales reactor jet power; thrust and Isp follow the rocket relation.
  let fusion = null;
  let forwardThrustN = propulsionDisk.thrustN;
  let totalPowerKw = liftPowerKw + propulsionPowerKw;
  let enduranceMinutes = (config.energyCapacityKwh / totalPowerKw) * 60;
  let wasteHeatKw = liftPowerKw * (1 - config.liftFigureOfMerit)
    + propulsionPowerKw * (1 - config.propulsionEfficiency);

  if (config.propulsionModel === 'fusion') {
    const jetPowerFullKw = config.fusionPowerKw * config.exhaustEfficiency;
    const maxThrustN = (2 * jetPowerFullKw * 1000) / config.fusionExhaustVelocityMs;
    const drivePowerKw = config.fusionPowerKw * propulsionThrottle;
    const designThrustN = maxThrustN * propulsionThrottle;
    fusion = calculateFusionDrive({
      thrustN: designThrustN,
      fusionPowerKw: drivePowerKw,
      exhaustEfficiency: config.exhaustEfficiency,
      exhaustVelocityMs: config.fusionExhaustVelocityMs,
      propellantMassKg: config.propellantMassKg,
      dryMassKg: effectiveMassKg,
      gravityMs2: config.gravityMs2,
      fuelType: config.fuelType
    });
    forwardThrustN = fusion.thrustN;
    totalPowerKw = liftPowerKw + drivePowerKw;
    enduranceMinutes = fusion.burnTimeMinutes;
    wasteHeatKw = liftPowerKw * (1 - config.liftFigureOfMerit)
      + drivePowerKw * (1 - config.exhaustEfficiency);
  }
  // -----------------------------------------------------------------------

  const verticalNetForceN = liftN - weightN;
  const horizontalNetForceN = forwardThrustN - dragN;
  const netForceN = Math.hypot(verticalNetForceN, horizontalNetForceN);
  const verticalAccelerationMs2 = verticalNetForceN / effectiveMassKg;
  const horizontalAccelerationMs2 = horizontalNetForceN / effectiveMassKg;
  const resultantAccelerationMs2 = netForceN / effectiveMassKg;
  const thrustToWeight = liftN / weightN;

  return Object.freeze({
    config: Object.freeze(config),
    mass: Object.freeze({
      baseMassKg: massKg,
      fusionHardwareMassKg,
      effectiveMassKg
    }),
    geometry: Object.freeze({
      hullVolumeM3,
      wettedAreaM2,
      frontalAreaM2,
      finenessRatio: lengthM / beamM,
      volumetricLoadingKgM3: massKg / hullVolumeM3
    }),
    forces: Object.freeze({
      weightN,
      liftN,
      forwardThrustN,
      dragN,
      verticalNetForceN,
      horizontalNetForceN,
      netForceN
    }),
    performance: Object.freeze({
      thrustToWeight,
      verticalAccelerationMs2,
      horizontalAccelerationMs2,
      resultantAccelerationMs2,
      dynamicPressurePa,
      diskLoadingPa: liftN / config.liftActuatorAreaM2,
      liftInducedVelocityMs: liftDisk.inducedVelocityMs,
      propulsionInducedVelocityMs: propulsionDisk.inducedVelocityMs,
      mach: airspeedMs / 343,
      reynoldsNumber: rho * airspeedMs * lengthM / 1.81e-5,
      totalPowerKw,
      enduranceMinutes,
      wasteHeatKw,
      estimatedCoreTemperatureK: 293 + wasteHeatKw * 1.45,
      propulsionModel: config.propulsionModel,
      fusion
    })
  });
}
