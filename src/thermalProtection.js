/**
 * Fusion reactor thermal-protection engineering ("the invisible bottle").
 *
 * A D + ³He plasma burns at ~10⁸ K (a hundred million °C). No solid material
 * can touch it — so the confinement, first wall, radiators and crew protection
 * are all engineered around that constraint. This module models the four systems
 * described in the AURORA documentation, with real physics:
 *
 *   1. Magnetic confinement (superconducting magnets)  P_mag = B² / (2·μ₀)
 *   2. First wall / divertor (tungsten)                ΔT = q·t / k
 *   3. Radiators (Stefan–Boltzmann)                    P = ε·σ·A·T⁴
 *   4. Residual-neutron shielding (D+³He is ~aneutronic)
 *
 * Key numbers for the AURORA's ~12 MW reactor:
 *   - 20 T REBCO field ⇒ P_mag ≈ 159 MPa (≈1570 atm) ⇒ ~80 atm plasma at β=5%.
 *   - Tungsten first wall survives 10 MW/m² with >2000 °C margin to melt.
 *   - Radiators must run HOT (T⁴ scaling): ~90 m² at 900 K vs ~7000 m² at 300 K.
 *   - D+³He emits only ~1–3% neutron power (D–D side branch) ⇒ far less shielding
 *     than D+D, but not zero.
 */

export const STEFAN_BOLTZMANN_WM2K4 = 5.670374419e-8;
const VACUUM_PERMEABILITY = 4 * Math.PI * 1e-7; // μ₀ (H/m)
const KELVIN = 273.15;

export const MATERIALS = Object.freeze({
  tungsten: {
    name: 'Tungstênio',
    meltK: 3422 + KELVIN,
    purpose: 'primeira parede / divertor (maior ponto de fusão entre metais)'
  },
  rebco: {
    name: 'REBCO (ímã supercondutor de alta temperatura)',
    operatingK: 65,
    purpose: 'ímãs de confinamento — cerâmica óxido de bário, cobre e terras raras'
  },
  hafniumBorde: {
    name: 'Boreto de Háfnio (UHTC)',
    meltK: 3250 + KELVIN,
    purpose: 'nariz / bordas de ataque na reentrada'
  },
  zirconiumBorde: {
    name: 'Boreto de Zircônio (UHTC)',
    meltK: 3246 + KELVIN,
    purpose: 'escudo térmico de reentrada'
  },
  carbonFiber: {
    name: 'Compósito de carbono / grafeno',
    purpose: 'espalhamento de calor (alta condutividade térmica, baixa massa)'
  },
  liquidHelium: {
    name: 'Hélio líquido',
    operatingK: 4.2,
    purpose: 'refrigeração criogênica dos ímãs e da cabine'
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}
function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Liquid helium boiling point (K) — the cryogenic coolant for the magnets. */
export const HELIUM_BOILING_K = 4.22;

/**
 * Liquid-helium cryogenic cooling loop for the superconducting magnets.
 * He liquefies at ~4.2 K (−269 °C); it runs through the magnet structure to keep
 * the REBCO coils superconducting (if the He fails, the field collapses, the
 * plasma touches the wall, and the ship melts).
 * @param {object} input - { heatToCryoKw, inletTempK, outletTempK }.
 */
export function heliumCooling({ heatToCryoKw = 60, inletTempK = 4.2, outletTempK = 20 } = {}) {
  const heatKw = Math.max(0, finiteOr(heatToCryoKw, 60));
  const outlet = Math.max(finiteOr(inletTempK, 4.2) + 0.1, finiteOr(outletTempK, 20));
  // Helium heat of vaporization ≈ 21 kJ/kg and specific heat ≈ 5.2 kJ/(kg·K).
  const latentHeatKjKg = 21;
  const specificHeatKjKgK = 5.2;
  const deltaT = outlet - finiteOr(inletTempK, 4.2);
  const totalKjKg = latentHeatKjKg + specificHeatKjKgK * deltaT;
  const flowKgS = heatKw / totalKjKg;
  const loopPowerKw = heatKw * 0.22; // cryocooler COP ~4.5 ⇒ ~22% of heat as work
  const magnetTempK = finiteOr(inletTempK, 4.2); // REBCO operates near the He bath
  return Object.freeze({
    heatToCryoKw: heatKw,
    boilingTempK: HELIUM_BOILING_K,
    boilingTempC: HELIUM_BOILING_K - 273.15,
    inletTempK: finiteOr(inletTempK, 4.2),
    outletTempK: outlet,
    deltaTK: deltaT,
    totalHeatKjKg: totalKjKg,
    flowKgS,
    loopPowerKw,
    magnetTempK,
    critical: magnetTempK < 5, // REBCO needs a bath near the boiling point
    safe: magnetTempK < 30
  });
}

/**
 * Autonomous reactor control ("AI"). The fusion plasma is unstable on
 * millisecond timescales — a human cannot actuate the magnets in time. An
 * autonomous controller trims the magnetic field on the plasma-response scale;
 * humans only plan routes and set the destination.
 * @param {object} input - { fusionPowerKw, responseMs, jitterPct }.
 */
export function reactorAI({ fusionPowerKw = 15_000, responseMs = 0.5, jitterPct = 0.5 } = {}) {
  const powerKw = Math.max(1, finiteOr(fusionPowerKw, 15_000));
  const jitter = clamp(finiteOr(jitterPct, 0.5), 0, 20);
  const instabilityPerMin = 60_000 / Math.max(1, finiteOr(responseMs, 0.5));
  return Object.freeze({
    fusionPowerKw: powerKw,
    responseMs: Math.max(0.1, finiteOr(responseMs, 0.5)),
    fieldCorrectionsPerMin: instabilityPerMin,
    fieldJitterPct: jitter,
    humanLagMs: 200, // best-case human reaction is ~200 ms
    marginVsHumanMs: Math.max(0.1, finiteOr(responseMs, 0.5)) + 200,
    note: 'Autonomous magnet control on the plasma-response scale; crew plans routes.'
  });
}

/**
 * Confinement magnetic pressure vs plasma pressure (the "invisible wall").
 * The plasma pressure that can be held is β · P_mag; β ≈ 0.05 for tokamaks.
 * @param {object} input - { fieldT, plasmaBeta }.
 */
export function magneticContainment({ fieldT = 20, plasmaBeta = 0.05 } = {}) {
  const B = Math.max(0.1, finiteOr(fieldT, 20));
  const beta = clamp(finiteOr(plasmaBeta, 0.05), 0.001, 0.5);
  const magneticPressurePa = (B ** 2) / (2 * VACUUM_PERMEABILITY);
  const plasmaPressurePa = magneticPressurePa * beta;
  return Object.freeze({
    fieldT: B,
    magneticPressurePa,
    magneticPressureAtm: magneticPressurePa / 101325,
    plasmaBeta: beta,
    plasmaPressurePa,
    plasmaPressureAtm: plasmaPressurePa / 101325
  });
}

/**
 * First-wall / divertor temperature for a given heat flux, using simple
 * steady-state conduction through a tungsten tile. Returns margin to melting.
 * @param {object} input - { heatFluxMWm2, tileThicknessM, coolantTempK }.
 */
export function firstWall({ heatFluxMWm2 = 10, tileThicknessM = 0.005, coolantTempK = 1200 } = {}) {
  const flux = Math.max(0, finiteOr(heatFluxMWm2, 10)) * 1e6; // W/m²
  const thickness = Math.max(1e-4, finiteOr(tileThicknessM, 0.005));
  const coolant = Math.max(100, finiteOr(coolantTempK, 1200));
  const kTungsten = 173; // W/(m·K) at high temperature
  const deltaT = (flux * thickness) / kTungsten;
  const surfaceTempK = coolant + deltaT;
  const meltK = MATERIALS.tungsten.meltK;
  const marginToMeltC = meltK - surfaceTempK; // a diferença em K é igual à diferença em °C
  return Object.freeze({
    heatFluxMWm2: finiteOr(heatFluxMWm2, 10),
    deltaT,
    surfaceTempC: surfaceTempK - KELVIN,
    marginToMeltC,
    safe: marginToMeltC > 0
  });
}

/**
 * Radiator area required to reject waste heat in vacuum by radiation alone
 * (Stefan–Boltzmann). The T⁴ scaling is the whole reason radiators must be hot.
 * @param {object} input - { wasteHeatKw, radiatorTempK, emissivity }.
 */
export function radiatorArea({ wasteHeatKw, radiatorTempK = 900, emissivity = 0.9 } = {}) {
  const powerW = Math.max(0, finiteOr(wasteHeatKw, 3000)) * 1000;
  const temp = Math.max(50, finiteOr(radiatorTempK, 900));
  const eps = clamp(finiteOr(emissivity, 0.9), 0.05, 1);
  const areaM2 = powerW / (eps * STEFAN_BOLTZMANN_WM2K4 * temp ** 4);
  return Object.freeze({
    wasteHeatKw: powerW / 1000,
    radiatorTempK: temp,
    emissivity: eps,
    areaM2,
    areaClass: areaM2 < 150 ? 'compacto' : areaM2 < 1000 ? 'moderado' : 'inviável (quilômetros quadrados)'
  });
}

/**
 * Coherent thermal-protection design for the AURORA's fusion reactor.
 * @param {object} input - overrides: fusionPowerKw, jetEfficiency, fieldT, etc.
 */
export function thermalProtectionDesign(input = {}) {
  const fusionPowerKw = Math.max(100, finiteOr(input.fusionPowerKw, 15_000));
  const jetEfficiency = clamp(finiteOr(input.jetEfficiency, 0.80), 0.05, 1);
  const wasteHeatKw = fusionPowerKw * (1 - jetEfficiency) + 400; // + cryocoolers
  const neutronFraction = clamp(finiteOr(input.neutronFraction, 0.03), 0, 0.2);
  const neutronPowerKw = fusionPowerKw * neutronFraction;

  const containment = magneticContainment({ fieldT: finiteOr(input.fieldT, 20) });
  const wall = firstWall({ heatFluxMWm2: finiteOr(input.firstWallFluxMWm2, 10) });
  const radiators900 = radiatorArea({ wasteHeatKw, radiatorTempK: 900 });
  const radiators300 = radiatorArea({ wasteHeatKw, radiatorTempK: 300 });
  const helium = heliumCooling({ heatToCryoKw: finiteOr(input.cryoHeatKw, 60) });
  const ai = reactorAI({ fusionPowerKw, responseMs: finiteOr(input.aiResponseMs, 0.5) });

  // Crew-to-reactor distance. Radiation drops as the inverse square, so a long
  // boom ("mast") between the cabin and the reactor is the primary crew shield.
  const crewDistanceM = Math.max(1, finiteOr(input.crewDistanceM, 16));
  const inverseSquareFactor = 1 / crewDistanceM ** 2;

  // Rough forward-looking shielding estimate for residual neutrons (D+³He).
  const shieldingMassKg = neutronPowerKw * 3.2; // ~3.2 kg/kW of neutron power (LiH/boron) — speculative
  const reactorMassEstimateKg = fusionPowerKw * 0.9;

  return Object.freeze({
    plasmaTemperatureK: 1.5e8,
    fusionPowerKw,
    jetEfficiency,
    wasteHeatKw,
    neutronFraction,
    neutronPowerKw,
    shieldingMassKg,
    reactorMassEstimateKg,
    containment,
    wall,
    helium,
    ai,
    radiators: Object.freeze({
      at300K: radiators300,
      at900K: radiators900
    }),
    crewProtection: Object.freeze({
      distanceFromReactorM: crewDistanceM,
      inverseSquareFactor,
      windows: 'nenhuma — pilotagem por telas (câmeras externas + sensores de calor)',
      coolantLoop: 'hélio líquido → ímãs REBCO → painéis radiadores de alta temperatura',
      note: 'Cabine na ponta oposta ao reator, a ' + crewDistanceM + ' m; blindagem de sombra + escudo de nêutrons; reator controlado por IA.'
    })
  });
}
