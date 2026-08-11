import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actuatorDiskThrust,
  calculateFlightPhysics,
  DEFAULT_CONFIG,
  G_STANDARD
} from '../src/physics.js';

test('weight follows Newton second-law inputs in SI units', () => {
  const result = calculateFlightPhysics({ massKg: 1000 });
  assert.ok(Math.abs(result.forces.weightN - 1000 * G_STANDARD) < 1e-9);
});

test('aerodynamic drag follows the velocity-squared relation', () => {
  const slow = calculateFlightPhysics({ airspeedMs: 20 });
  const fast = calculateFlightPhysics({ airspeedMs: 40 });
  assert.ok(Math.abs(fast.forces.dragN / slow.forces.dragN - 4) < 1e-10);
});

test('actuator-disk thrust increases with shaft power', () => {
  const low = actuatorDiskThrust({ powerW: 100_000, densityKgM3: 1.225, diskAreaM2: 2, efficiency: 0.75 });
  const high = actuatorDiskThrust({ powerW: 200_000, densityKgM3: 1.225, diskAreaM2: 2, efficiency: 0.75 });
  assert.ok(high.thrustN > low.thrustN);
  assert.ok(high.inducedVelocityMs > low.inducedVelocityMs);
});

test('force balance and acceleration remain internally consistent', () => {
  const result = calculateFlightPhysics(DEFAULT_CONFIG);
  const expected = result.forces.verticalNetForceN / DEFAULT_CONFIG.massKg;
  assert.ok(Math.abs(result.performance.verticalAccelerationMs2 - expected) < 1e-12);
  assert.ok(Number.isFinite(result.performance.enduranceMinutes));
  assert.ok(result.performance.thrustToWeight > 0);
});

test('parametric beam changes volume, frontal area, and drag', () => {
  const narrow = calculateFlightPhysics({ beamM: 2.6, airspeedMs: 45 });
  const wide = calculateFlightPhysics({ beamM: 3.6, airspeedMs: 45 });
  assert.ok(wide.geometry.hullVolumeM3 > narrow.geometry.hullVolumeM3);
  assert.ok(wide.geometry.frontalAreaM2 > narrow.geometry.frontalAreaM2);
  assert.ok(wide.forces.dragN > narrow.forces.dragN);
});

test('unsafe and non-finite UI inputs are clamped to solver limits', () => {
  const result = calculateFlightPhysics({ massKg: -10, liftThrottle: 7, airspeedMs: Number.NaN });
  assert.equal(result.config.massKg, 500);
  assert.equal(result.config.liftThrottle, 1);
  assert.equal(result.config.airspeedMs, DEFAULT_CONFIG.airspeedMs);
});
