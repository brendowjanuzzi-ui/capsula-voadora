import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFusionDrive,
  deuteriumFusionConstants,
  fusionConstants,
  DEFAULT_FUSION_CONFIG
} from '../src/fusionDrive.js';
import { calculateFlightPhysics, DEFAULT_CONFIG } from '../src/physics.js';

test('deuterium fusion energetics are physically plausible', () => {
  const c = deuteriumFusionConstants();
  // D+D fusion ~3.6 MeV/reaction. Two deuterons per reaction: energy density
  // ≈ 8.6e13 J/kg (~1.9 million × gasoline), ideal exhaust ≈ 4.4% c.
  assert.ok(Math.abs(c.energyPerReactionJ - 3.60e6 * 1.602176634e-19) < 1e-22);
  assert.ok(c.specificEnergyJkg > 8e13 && c.specificEnergyJkg < 9e13);
  assert.ok(c.idealExhaustFractionOfC > 0.03 && c.idealExhaustFractionOfC < 0.06);
  assert.equal(c.fuelType, 'd2');
  assert.equal(c.neutrons, true);
});

test('helium-3 cycle is ~4× more energetic and aneutronic', () => {
  const he3 = fusionConstants('dhe3');
  const d2 = fusionConstants('d2');
  assert.equal(he3.fuelType, 'dhe3');
  assert.equal(he3.neutrons, false); // almost all energy to charged particles
  // D+³He releases ~18.35 MeV per reaction.
  assert.ok(Math.abs(he3.energyPerReactionJ - 18.35e6 * 1.602176634e-19) < 1e-22);
  // Energy density and ideal exhaust are higher than D+D (≈3.5e14 J/kg, ≈8.9% c).
  assert.ok(he3.specificEnergyJkg > 3.4e14 && he3.specificEnergyJkg < 3.6e14);
  assert.ok(he3.specificEnergyJkg > 3 * d2.specificEnergyJkg);
  assert.ok(he3.idealExhaustVelocityMs > d2.idealExhaustVelocityMs);
  assert.ok(he3.idealExhaustFractionOfC > 0.06 && he3.idealExhaustFractionOfC < 0.12);
});

test('fusion mode carries the bolt-on reactor module, EDF mode does not', () => {
  const edf = calculateFlightPhysics(DEFAULT_CONFIG);
  const fusion = calculateFlightPhysics({ propulsionModel: 'fusion' });
  assert.equal(edf.mass.effectiveMassKg, edf.mass.baseMassKg); // no reactor in EDF mode
  assert.ok(fusion.mass.effectiveMassKg > fusion.mass.baseMassKg); // bolt-on module adds mass
  assert.ok(fusion.mass.effectiveMassKg < fusion.mass.baseMassKg * 4); // ~4.5 t module (credible, not 15 t)
  assert.equal(fusion.mass.fusionHardwareMassKg, fusion.config.fusionHardwareMassKg);
});

test('fusion module reduces but does not destroy atmospheric lift-to-weight', () => {
  const fusion = calculateFlightPhysics({ propulsionModel: 'fusion' });
  // With the ~4.5 t bolt-on module the EDF can no longer hover (too heavy), but
  // the base EDF configuration is fully operational — the honest split.
  const base = calculateFlightPhysics(DEFAULT_CONFIG);
  assert.ok(base.performance.thrustToWeight > 1); // EDF-only capsule hovers
  assert.ok(fusion.performance.thrustToWeight < 0.5); // with reactor module it cannot
});

test('invalid fuel type falls back to deuterium', () => {
  assert.equal(fusionConstants('nope').fuelType, 'd2');
  const drive = calculateFusionDrive({ fuelType: 'bogus' });
  assert.equal(drive.config.fuelType, 'd2');
  assert.equal(drive.ideal.fuelType, 'd2');
});

test('rocket relations hold: F = mdot·Ve and Pj = ½·mdot·Ve²', () => {
  const drive = calculateFusionDrive({ thrustN: 10_000 });
  const expectedFlow = drive.thrustN / drive.exhaustVelocityMs;
  assert.ok(Math.abs(drive.propellantMassFlowKgS - expectedFlow) < 1e-9);
  assert.ok(Math.abs(0.5 * drive.propellantMassFlowKgS * drive.exhaustVelocityMs ** 2 - drive.jetPowerW) < 1e-3);
});

test('higher exhaust velocity raises Isp and lowers mass flow at fixed power', () => {
  // Fix the design exhaust velocity (no thrust target): the rocket then trades
  // thrust for Isp as Ve rises, at constant jet power.
  const slow = calculateFusionDrive({ exhaustVelocityMs: 10_000 });
  const fast = calculateFusionDrive({ exhaustVelocityMs: 40_000 });
  assert.ok(fast.specificImpulseS > slow.specificImpulseS);
  assert.ok(fast.propellantMassFlowKgS < slow.propellantMassFlowKgS);
  assert.ok(fast.thrustN < slow.thrustN); // same power, faster exhaust ⇒ less thrust
});

test('burn time scales with propellant budget and inverse mass flow', () => {
  const a = calculateFusionDrive({ thrustN: 20_000, propellantMassKg: 100 });
  const b = calculateFusionDrive({ thrustN: 20_000, propellantMassKg: 200 });
  assert.ok(b.burnTimeMinutes > a.burnTimeMinutes);
});

test('deuterium fuel flow for fusion is negligible relative to reaction mass', () => {
  const drive = calculateFusionDrive({ thrustN: 12_000 });
  // A 12 MW-class fusion plant consumes only grams of deuterium per hour.
  assert.ok(drive.fuelPerHourKg < 1);
  assert.ok(drive.fuelPerHourKg > 0);
});

test('rocket delta-v increases with exhaust velocity', () => {
  const low = calculateFusionDrive({ exhaustVelocityMs: 20_000, propellantMassKg: 150 });
  const high = calculateFusionDrive({ exhaustVelocityMs: 60_000, propellantMassKg: 150 });
  assert.ok(high.deltaVMs > low.deltaVMs);
});

test('non-finite and unsafe fusion inputs are clamped', () => {
  const drive = calculateFusionDrive({ thrustN: Number.NaN, exhaustEfficiency: 9, fusionPowerKw: -5 });
  assert.ok(Number.isFinite(drive.thrustN));
  assert.ok(drive.thrustN >= 0);
  assert.ok(drive.config.exhaustEfficiency <= 1);
  assert.ok(drive.config.fusionPowerKw >= 1);
});

test('physics solver switches to fusion drive when propulsionModel = fusion', () => {
  const edf = calculateFlightPhysics(DEFAULT_CONFIG);
  const fusion = calculateFlightPhysics({ propulsionModel: 'fusion' });
  assert.equal(edf.performance.propulsionModel, 'edf');
  assert.equal(fusion.performance.propulsionModel, 'fusion');
  assert.ok(fusion.performance.fusion !== null);
  assert.equal(fusion.performance.fusion.thrustN, fusion.forces.forwardThrustN);
  assert.ok(fusion.forces.forwardThrustN > 0);
});

test('fusion endurance is propellant-limited, not battery-limited', () => {
  const fusion = calculateFlightPhysics({ propulsionModel: 'fusion', propulsionThrottle: 0.5 });
  assert.ok(fusion.performance.enduranceMinutes > 0);
  assert.ok(Number.isFinite(fusion.performance.fusion.deltaVMs));
  // Still self-consistent force/acceleration balance using the effective mass
  // (base airframe + fusion reactor hardware carried in fusion mode).
  const expected = fusion.forces.horizontalNetForceN / fusion.mass.effectiveMassKg;
  assert.ok(Math.abs(fusion.performance.horizontalAccelerationMs2 - expected) < 1e-9);
  assert.ok(fusion.mass.effectiveMassKg > fusion.mass.baseMassKg);
});
