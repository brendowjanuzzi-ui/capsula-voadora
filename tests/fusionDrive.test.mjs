import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFusionDrive,
  deuteriumFusionConstants,
  DEFAULT_FUSION_CONFIG
} from '../src/fusionDrive.js';
import { calculateFlightPhysics, DEFAULT_CONFIG } from '../src/physics.js';

test('deuterium fusion energetics are physically plausible', () => {
  const c = deuteriumFusionConstants();
  // D+D fusion ~3.6 MeV/reaction, energy density ~1.7e14 J/kg.
  assert.ok(Math.abs(c.energyPerReactionJ - 3.60e6 * 1.602176634e-19) < 1e-22);
  assert.ok(c.specificEnergyJkg > 1e14 && c.specificEnergyJkg < 3e14);
  // Ideal self-propelled exhaust is a few percent of c.
  assert.ok(c.idealExhaustFractionOfC > 0.03 && c.idealExhaustFractionOfC < 0.1);
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
  assert.ok(drive.deuteriumFuelPerHourKg < 1);
  assert.ok(drive.deuteriumFuelPerHourKg > 0);
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
  // Still self-consistent force/acceleration balance.
  const expected = fusion.forces.horizontalNetForceN / DEFAULT_CONFIG.massKg;
  assert.ok(Math.abs(fusion.performance.horizontalAccelerationMs2 - expected) < 1e-9);
});
