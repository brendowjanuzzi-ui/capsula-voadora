import { calculateFusionDrive } from './fusionDrive.js?v=12';

export const G_STANDARD = 9.80665;
export const SEA_LEVEL_DENSITY = 1.225;

// Fusion impulse-drive configuration used when propulsionModel === 'fusion'.
// These override DEFAULT_FUSION_CONFIG fields; see fusionDrive.js.
export const FUSION_PROPULSION_CONFIG = Object.freeze({
  propulsionModel: 'fusion',
  // Reactor sized for the capsule: ~3 MW fusion (D+³He), a bolt-on space module.
  fusionPowerKw: 3_000,
  exhaustEfficiency: 0.82,
  fusionExhaustVelocityMs: 50_000,
  propellantMassKg: 80,
  fuelType: 'dhe3',
  // Mass of the bolt-on fusion reactor module (core + REBCO magnets + shielding +
  // radiators). Sized to ~4.5 t for 3 MW — far more credible than a 15 t reactor.
  fusionHardwareMassKg: 4_500,
  // Distance (m) between the crew cabin and the reactor (mast architecture).
  reactorDistanceM: 16
});

export const DEFAULT_CONFIG = Object.freeze({
  lengthM: 12,
  beamM: 3.0,
  heightM: 1.8,
  massKg: 1850,
  airDensityKgM3: SEA_LEVEL_DENSITY,
  airspeedMs: 36,
  liftThrottle: 0.86,
  propulsionThrottle: 0.46,
  // EDF sized to actually lift the ~1850 kg capsule (T/P ≈ 1.15 in hover).
  liftPowerMaxKw: 1100,
  propulsionPowerMaxKw: 420,
  liftActuatorAreaM2: 6.0,
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
  fusionHardwareMassKg: FUSION_PROPULSION_CONFIG.fusionHardwareMassKg,
  reactorDistanceM: FUSION_PROPULSION_CONFIG.reactorDistanceM
});

const LIMITS = Object.freeze({
  lengthM: [3, 24],
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
    'fusionHardwareMassKg', 'reactorDistanceM'
  ]) {
    config[key] = Math.max(0.0001, finiteOr(config[key], DEFAULT_CONFIG[key]));
  }
  config.fusionHardwareMassKg = clamp(config.fusionHardwareMassKg, 0, 1_000_000);
  config.reactorDistanceM = clamp(config.reactorDistanceM, 1, 200);

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
const SCALE_HEIGHT_M = 8500; // exponential atmosphere scale height
const EARTH_RADIUS_M = 6_371_000;
const EARTH_MU_M3S2 = 3.986004418e14;
const ORBITAL_VELOCITY_MS = Math.sqrt(EARTH_MU_M3S2 / EARTH_RADIUS_M); // ≈ 7.91 km/s
/**
 * Atmospheric flight envelope: where each propulsion system can operate.
 * The EDF is an air-breathing fan (needs dense air), the fusion impulse is a
 * rocket (needs vacuum). This computes:
 *   - the EDF practical ceiling (~where air is ~1% of sea level);
 *   - the orbital velocity requirement (~7.9 km/s, ≈ Mach 23);
 *   - the altitude where the fusion impulse's max thrust finally exceeds drag
 *     (the crossover where the atmosphere stops being the dominant problem).
 */
export function atmosphericEnvelope(input = {}) {
  const config = normalizedConfig(input);
  const seaDensity = config.airDensityKgM3;
  const frontalAreaM2 = Math.PI * (config.beamM / 2) * (config.heightM / 2);
  const ceilingRatio = 0.01; // EDF needs at least ~1% of sea-level air
  const edfCeilingKm = (SCALE_HEIGHT_M / 1000) * Math.log(1 / ceilingRatio);

  const orbitalVelocityKmS = ORBITAL_VELOCITY_MS / 1000;
  const speedOfSoundMs = 343;
  const orbitalMach = (orbitalVelocityKmS * 1000) / speedOfSoundMs;

  // Max fusion thrust (full throttle, all reactor power to the jet).
  const jetPowerW = config.fusionPowerKw * 1000 * config.exhaustEfficiency;
  const fusionMaxThrustN = (2 * jetPowerW) / config.fusionExhaustVelocityMs;
  const densityForBalance = h => seaDensity * Math.exp(-h * 1000 / SCALE_HEIGHT_M);

  // Reference cruise speed used to find the fusion drag-balance altitude.
  const refSpeedMs = Math.max(50, finiteOr(input.referenceSpeedMs, 250));
  const dragAt = (h, v) => 0.5 * densityForBalance(h) * v ** 2 * config.dragCoefficient * frontalAreaM2;
  let fusionCrossoverKm = 0;
  for (let h = 0; h <= 80; h += 0.25) {
    if (dragAt(h, refSpeedMs) <= fusionMaxThrustN) { fusionCrossoverKm = h; break; }
  }
  if (fusionCrossoverKm === 0) fusionCrossoverKm = 80;

  return Object.freeze({
    edfCeilingKm,
    airDensityAtCeilingRatio: ceilingRatio,
    orbitalVelocityKmS,
    orbitalMach,
    fusionMaxThrustN,
    fusionCrossoverKm,
    referenceSpeedMs: refSpeedMs,
    region: `EDF até ~${Math.round(edfCeilingKm)} km; fusão vence o arrasto acima de ~${Math.round(fusionCrossoverKm)} km; órbita exige ${orbitalMach.toFixed(0)} Mach.`
  });
}

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
      effectiveMassKg,
      reactorDistanceM: config.reactorDistanceM
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
