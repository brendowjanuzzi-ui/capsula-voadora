import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suborbitalTrajectory,
  planPointToPointMission,
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
