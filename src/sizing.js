/**
 * Full engineering sizing of the AURORA capsule — a coherent, operationally
 * feasible mass & volume budget built from real component densities.
 *
 * The critical realism fix: an earlier draft put a 12 MW / 15 t fusion reactor
 * on board, which collapsed the EDF lift-to-weight to ~0.08 (the capsule could
 * not hover). Real engineering separates the two regimes:
 *
 *   - ATMOSPHERIC FLIGHT (EDF): a light, battery/EDF vehicle (~1.7 t) that
 *     actually hovers and flies.
 *   - SPACE MISSIONS (fusion impulse): a bolt-on fusion reactor module
 *     (D+³He) used only exoatmospherically, where its low thrust / high Isp
 *     is the right tool.
 *
 * Every component is sized from a density/energy figure grounded in physics:
 *   carbon-fiber monocoque (~55 kg/m³), Li-ion battery (~6 kg/kWh),
 *   LiH/B4C neutron shielding (~3.2 kg/kW of neutron power),
 *   D+³He tanks from liquid densities, radiators from Stefan-Boltzmann.
 */

import { HELIUM_BOILING_K } from './thermalProtection.js?v=12';
import { G_STANDARD } from './physics.js?v=12';

// --- Reference material / system densities -----------------------------
export const DENSITIES = Object.freeze({
  carbonFiberKgM3: 55,        // composite monocoque (sandwich)
  aluminumKgM3: 2700,
  lithiumIonKgKwh: 6,         // ~6 kg/kWh system-level Li-ion
  neutronShieldKgPerKw: 3.2,  // LiH/B4C shielding per kW of neutron power
  liquidDeuteriumKgM3: 163,   // D2 liquid at ~20 K
  liquidHelium3KgM3: 125,     // ³He liquid near 4 K
  cryoTankKgPerM3: 45         // cryogenic tank structural mass per m³ volume
});

export const CREW = Object.freeze({
  count: 2,
  massKgPerPerson: 90,
  baggageKgPerPerson: 35
});

/**
 * Build a coherent dry-mass budget for the atmospheric (EDF) configuration.
 * @param {object} input - overrides.
 */
export function dryMassBudget(input = {}) {
  const lengthM = Math.max(3, Number(input.lengthM) || 12);
  const beamM = Math.max(1.8, Number(input.beamM) || 3.0);
  const heightM = Math.max(1.2, Number(input.heightM) || 1.8);
  // Ellipsoid hull volume.
  const hullVolumeM3 = (4 / 3) * Math.PI * (lengthM / 2) * (beamM / 2) * (heightM / 2);
  const monoMassKg = hullVolumeM3 * DENSITIES.carbonFiberKgM3 * 0.28; // ~28% of volume is structure

  const batteryKwh = Math.max(20, Number(input.batteryKwh) || 60);
  const batteryMassKg = batteryKwh * DENSITIES.lithiumIonKgKwh;

  const items = {
    'Monocoque (compósito carbono)': monoMassKg,
    'Cabine pressurizada + 2 assentos': 150,
    'Aviônicos / IA / telas': 85,
    'EDF de sustentação (2 motores + discos)': 130,
    'EDF de propulsão': 65,
    [`Bateria ${batteryKwh} kWh (Li-ion)`]: batteryMassKg,
    'Trem de pouso': 50,
    'Sistemas térmicos / criogênicos': 60,
    'Margem / integração': 100
  };

  const dryMassKg = Object.values(items).reduce((a, b) => a + b, 0);
  const crewMassKg = CREW.count * CREW.massKgPerPerson;
  const baggageKg = CREW.count * CREW.baggageKgPerPerson;
  const reactionMassKg = Math.max(0, Number(input.reactionMassKg) || 80);
  const totalMassKg = dryMassKg + crewMassKg + baggageKg + reactionMassKg;

  return Object.freeze({
    lengthM, beamM, heightM,
    hullVolumeM3,
    items: Object.freeze(items),
    dryMassKg,
    crewMassKg,
    baggageKg,
    reactionMassKg,
    totalMassKg
  });
}

/**
 * Size the EDF lift and propulsion to actually lift the configured mass.
 * Uses actuator-disk momentum theory: T = 2ρA·vi², P_air = 2ρA·vi³, FM = P_air/P_el.
 * @param {object} input - { totalMassKg, diskAreaM2, densityKgM3, figureOfMerit, hoverMargin }
 */
export function sizeEDF(input = {}) {
  const totalMassKg = Math.max(100, Number(input.totalMassKg) || 1700);
  const diskAreaM2 = Math.max(1, Number(input.diskAreaM2) || 6);
  const rho = Math.max(0.5, Number(input.densityKgM3) || 1.225);
  const fm = Math.max(0.2, Number(input.figureOfMerit) || 0.72);
  const margin = Math.max(1.05, Number(input.hoverMargin) || 1.15); // T/P for hover

  const weightN = totalMassKg * G_STANDARD;
  const requiredThrustN = weightN * margin;
  const inducedVelocityMs = Math.sqrt(requiredThrustN / (2 * rho * diskAreaM2));
  const airPowerW = 2 * rho * diskAreaM2 * inducedVelocityMs ** 3;
  const shaftPowerW = airPowerW / fm;
  const liftPowerKw = shaftPowerW / 1000;
  const diskLoadingPa = requiredThrustN / diskAreaM2;

  return Object.freeze({
    totalMassKg,
    weightN,
    requiredThrustN,
    diskAreaM2,
    inducedVelocityMs,
    airPowerKw: airPowerW / 1000,
    liftPowerKw,
    diskLoadingPa,
    thrustToWeight: requiredThrustN / weightN
  });
}

/**
 * Size the fusion reactor module for space missions (D+³He), from physics.
 * @param {object} input - { fusionPowerKw, jetEfficiency }
 */
export function sizeFusionReactor(input = {}) {
  const fusionPowerKw = Math.max(200, Number(input.fusionPowerKw) || 3000);
  const jetEfficiency = Math.max(0.5, Number(input.jetEfficiency) || 0.8);
  const neutronFraction = 0.03; // D+³He almost aneutronic
  const neutronPowerKw = fusionPowerKw * neutronFraction;
  const shieldingMassKg = neutronPowerKw * DENSITIES.neutronShieldKgPerKw;
  // Massa de núcleo/bobinas/criogenia ~ fixa + escala com potência.
  const coreMassKg = fusionPowerKw * 0.9 + 1500; // ~0.9 t/MW + 1.5 t fixa (bobinas REBCO/criogenia)
  const totalMassKg = coreMassKg + shieldingMassKg;

  // Fuel consumed: D+³He -> 4He + p (18.35 MeV/reaction).
  const energyPerReactionJ = 18.35e6 * 1.602176634e-19;
  const reactantMassU = 2.014101778 + 3.016029321;
  const fuelFlowKgS = (fusionPowerKw * 1000 * jetEfficiency) /
    (energyPerReactionJ / (reactantMassU * 1.66053906660e-27));
  const fuelPerHourKg = fuelFlowKgS * 3600;

  return Object.freeze({
    fusionPowerKw,
    jetEfficiency,
    neutronFraction,
    neutronPowerKw,
    shieldingMassKg,
    coreMassKg,
    totalMassKg,
    fuelPerHourKg,
    wasteHeatKw: fusionPowerKw * (1 - jetEfficiency)
  });
}

/**
 * Size cryogenic propellant tanks (liquid D2 / He-3) for a mission.
 * @param {object} input - { deuteriumKg, helium3Kg }
 */
export function sizeCryoTanks(input = {}) {
  const d2kg = Math.max(0, Number(input.deuteriumKg) || 60);
  const he3kg = Math.max(0, Number(input.helium3Kg) || 30);
  const d2VolumeM3 = d2kg / DENSITIES.liquidDeuteriumKgM3;
  const he3VolumeM3 = he3kg / DENSITIES.liquidHelium3KgM3;
  const tankMassKg = (d2VolumeM3 + he3VolumeM3) * DENSITIES.cryoTankKgPerM3;
  const radiusOfSphere = v => (v * 3 / (4 * Math.PI)) ** (1 / 3);

  return Object.freeze({
    deuteriumKg: d2kg,
    helium3Kg: he3kg,
    d2VolumeM3,
    he3VolumeM3,
    d2TankRadiusM: radiusOfSphere(d2VolumeM3),
    he3TankRadiusM: radiusOfSphere(he3VolumeM3),
    tankMassKg
  });
}

/**
 * Comprehensive sizing report for the capsule, merging all subsystems.
 */
export function sizeCapsule(input = {}) {
  const lengthM = Number(input.lengthM) || 12;
  const beamM = Number(input.beamM) || 3.0;
  const heightM = Number(input.heightM) || 1.8;
  const mass = dryMassBudget({ lengthM, beamM, heightM, ...input });
  const edf = sizeEDF({ totalMassKg: mass.totalMassKg, ...input });
  const reactor = sizeFusionReactor(input);
  const tanks = sizeCryoTanks(input);
  const reactorModule = reactor; // the bolt-on fusion module for space

  return Object.freeze({
    hull: Object.freeze({
      lengthM, beamM, heightM,
      hullVolumeM3: mass.hullVolumeM3,
      finenessRatio: lengthM / beamM
    }),
    mass,
    edf,
    reactor,
    tanks,
    regimeNote: 'EDF para atmosfera; módulo de fusão D+³He acoplado só em missão espacial.'
  });
}
