import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actuatorDiskThrust,
  calculateFlightPhysics,
  atmosphericEnvelope,
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

test('atmospheric envelope: EDF is a low-flying fan, orbit needs Mach ~23', () => {
  const e = atmosphericEnvelope();
  assert.ok(e.edfCeilingKm >= 30 && e.edfCeilingKm <= 50); // practical fan ceiling
  assert.ok(e.orbitalVelocityKmS > 7 && e.orbitalVelocityKmS < 8); // ≈ 7.9 km/s
  assert.ok(e.orbitalMach > 20); // ≈ Mach 23
  // Fusion max thrust is low; it only beats drag high up.
  assert.ok(e.fusionMaxThrustN < 2000);
  assert.ok(e.fusionCrossoverKm > 15); // needs thin air to win
});

test('fusion impulse thrust is far below sea-level drag at low speed', () => {
  const e = atmosphericEnvelope({ referenceSpeedMs: 100 });
  // At 100 m/s the drag in dense air dwarfs the fusion thrust.
  const config = DEFAULT_CONFIG;
  const frontalArea = Math.PI * (config.beamM / 2) * (config.heightM / 2);
  const dragSeaLevel = 0.5 * config.airDensityKgM3 * 100 ** 2 * config.dragCoefficient * frontalArea;
  assert.ok(dragSeaLevel > 10 * e.fusionMaxThrustN); // air dominates at sea level
});
