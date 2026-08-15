import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dryMassBudget,
  sizeEDF,
  sizeFusionReactor,
  sizeCryoTanks,
  sizeCapsule,
  CREW
} from '../src/sizing.js';

test('dry mass budget is realistic for a two-person capsule', () => {
  const m = dryMassBudget({});
  assert.ok(m.dryMassKg > 1000 && m.dryMassKg < 2500); // credible airframe
  assert.equal(m.crewMassKg, CREW.count * 90);
  assert.ok(m.totalMassKg > m.dryMassKg);
  assert.ok(m.hullVolumeM3 > 25); // big enough for cabin + systems
});

test('EDF sizing lifts the capsule with a credible power budget', () => {
  const e = sizeEDF({ totalMassKg: 1850 });
  assert.ok(e.thrustToWeight >= 1); // can hover
  assert.ok(e.liftPowerKw > 800 && e.liftPowerKw < 1600); // credible EDF power
  assert.ok(e.inducedVelocityMs > 20 && e.inducedVelocityMs < 60);
  assert.ok(e.diskLoadingPa > 1500 && e.diskLoadingPa < 5000); // eVTOL disk loading (~2-5 kPa)
});

test('fusion reactor module is sized from real densities and is credible', () => {
  const r = sizeFusionReactor({ fusionPowerKw: 3000 });
  assert.ok(r.totalMassKg > 2000 && r.totalMassKg < 8000); // ~4.5 t, not 15 t
  assert.ok(r.fuelPerHourKg < 0.01); // grams/hour of D+³He
  assert.ok(r.shieldingMassKg < 1000); // light (aneutronic D+³He)
  assert.ok(r.wasteHeatKw > 0);
});

test('cryogenic tanks are compact spheres for the propellant load', () => {
  const t = sizeCryoTanks({ deuteriumKg: 60, helium3Kg: 30 });
  assert.ok(t.d2TankRadiusM > 0.3 && t.d2TankRadiusM < 0.6);
  assert.ok(t.he3TankRadiusM > 0.2 && t.he3TankRadiusM < 0.5);
  assert.ok(t.tankMassKg > 10 && t.tankMassKg < 60);
});

test('capsule sizing integrates hull, mass, EDF and reactor coherently', () => {
  const s = sizeCapsule({});
  assert.equal(s.edf.totalMassKg, s.mass.totalMassKg); // EDF sized for full mass
  assert.ok(s.edf.thrustToWeight >= 1); // operational
  assert.ok(s.reactor.totalMassKg > 3000); // fusion module
  assert.ok(s.hull.finenessRatio > 3); // elongated mast silhouette
});
