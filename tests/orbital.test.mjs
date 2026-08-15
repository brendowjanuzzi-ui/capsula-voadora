import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suborbitalTrajectory,
  planPointToPointMission,
  orbitRegime,
  planOrbitalInsertion,
  EARTH_RADIUS_M,
  GRAVITATIONAL_PARAMETER_M3S2
} from '../src/orbital.js';

test('longer central angle yields longer range and higher injection velocity', () => {
  const short = suborbitalTrajectory({ centralAngleDeg: 5 });
  const long = suborbitalTrajectory({ centralAngleDeg: 45 });
  assert.ok(long.rangeKm > short.rangeKm);
  assert.ok(long.launchDeltaVMs > short.launchDeltaVMs);
  assert.ok(long.apogeeAltitudeKm > short.apogeeAltitudeKm);
});

test('injection velocity never exceeds surface orbital velocity', () => {
  const vc = Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / EARTH_RADIUS_M);
  for (const deg of [2, 10, 60, 120, 180]) {
    const t = suborbitalTrajectory({ centralAngleDeg: deg });
    assert.ok(t.launchDeltaVMs <= vc);
    assert.ok(t.flightMinutes > 0);
  }
});

test('range is consistent with central angle on a spherical Earth', () => {
  const t = suborbitalTrajectory({ centralAngleDeg: 30 });
  const expected = (EARTH_RADIUS_M / 1000) * (30 * Math.PI / 180);
  assert.ok(Math.abs(t.rangeKm - expected) < 1e-6);
});

test('propellant for injection follows Tsiolkovsky equation', () => {
  const plan = planPointToPointMission({ centralAngleDeg: 5 });
  // propellantRequired recovers Δv through the rocket equation m_prop = m_dry(e^{Δv/Vₑ}−1).
  const recovered = plan.drive.exhaustVelocityMs * Math.log(1 + plan.propellantRequiredKg / 1240);
  assert.ok(Math.abs(recovered - plan.deltaVNeededMs) < 1e-6);
});

test('a short hop is feasible and a very long hop is not', () => {
  const short = planPointToPointMission({ centralAngleDeg: 3 });
  const far = planPointToPointMission({ centralAngleDeg: 90 });
  assert.equal(short.feasible, true);
  assert.equal(far.feasible, false);
  assert.ok(short.propellantAfterKg > 0);
  assert.equal(far.propellantAfterKg, 0);
});

test('max range drains the propellant budget exactly', () => {
  const plan = planPointToPointMission({ centralAngleDeg: 180 });
  const t = plan.maxRange;
  const atMax = planPointToPointMission({ centralAngleDeg: t.centralAngleDeg });
  assert.ok(Math.abs(atMax.propellantRequiredKg - atMax.propellantAvailableKg) < 1e-6);
  assert.ok(t.rangeKm > 500 && t.rangeKm < 2000); // fusion budget lands in the ~1e3 km class
});

test('clamps non-finite and out-of-range angles', () => {
  const t = suborbitalTrajectory({ centralAngleDeg: Number.NaN });
  assert.ok(Number.isFinite(t.launchDeltaVMs));
  const min = suborbitalTrajectory({ centralAngleDeg: 0 });
  const max = suborbitalTrajectory({ centralAngleDeg: 9999 });
  assert.ok(min.centralAngleDeg >= 0.5);
  assert.ok(max.centralAngleDeg <= 180);
});

test('escape velocity is exactly √2 times circular orbital velocity', () => {
  for (const h of [0, 200, 400, 1000]) {
    const r = orbitRegime({ altitudeKm: h });
    assert.ok(Math.abs(r.escapeToOrbitalRatio - Math.sqrt(2)) < 1e-9);
  }
});

test('orbital velocity and period decrease with altitude as μ/r', () => {
  const low = orbitRegime({ altitudeKm: 200 });
  const high = orbitRegime({ altitudeKm: 1000 });
  assert.ok(high.orbitalVelocityMs < low.orbitalVelocityMs);
  assert.ok(high.periodMinutes > low.periodMinutes);
  const expected = Math.sqrt(GRAVITATIONAL_PARAMETER_M3S2 / (EARTH_RADIUS_M + 200_000));
  assert.ok(Math.abs(low.orbitalVelocityMs - expected) < 1e-6);
});

test('LEO insertion (≈400 km) is infeasible with the small fusion tank', () => {
  const plan = planOrbitalInsertion({ altitudeKm: 400 });
  assert.equal(plan.feasible, false);
  assert.equal(plan.canReachLowEarthOrbit, false);
  // LEO needs a few hundred kg of propellant, far above the 120 kg carried.
  assert.ok(plan.propellantRequiredKg > 300);
  assert.ok(plan.deltaVTotalMs > 8_000);
  // The tank ceiling (few km/s) is below LEO orbital velocity.
  assert.ok(plan.maxDeltaVMs < 7_000);
});

test('a very large tank could cover LEO insertion (consistent rocket equation)', () => {
  const plan = planOrbitalInsertion({ altitudeKm: 400, propellantMassKg: 800, dryMassKg: 1240 });
  assert.equal(plan.feasible, true);
  // Cross-check: Δv recovered from the required propellant.
  const recovered = plan.drive.exhaustVelocityMs * Math.log(1 + plan.propellantRequiredKg / 1240);
  assert.ok(Math.abs(recovered - plan.deltaVTotalMs) < 1e-6);
});

test('higher altitude requires slightly less Δv but the tank ceiling stays fixed', () => {
  const low = planOrbitalInsertion({ altitudeKm: 400 });
  const high = planOrbitalInsertion({ altitudeKm: 1000 });
  assert.ok(high.deltaVTotalMs < low.deltaVTotalMs);
  assert.ok(Math.abs(low.maxDeltaVMs - high.maxDeltaVMs) < 1e-9);
});
