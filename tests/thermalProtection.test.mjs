import test from 'node:test';
import assert from 'node:assert/strict';
import {
  magneticContainment,
  firstWall,
  radiatorArea,
  thermalProtectionDesign,
  MATERIALS,
  STEFAN_BOLTZMANN_WM2K4
} from '../src/thermalProtection.js';

test('magnetic pressure follows B²/(2μ₀)', () => {
  const m = magneticContainment({ fieldT: 20 });
  const expected = (20 ** 2) / (2 * 4 * Math.PI * 1e-7);
  assert.ok(Math.abs(m.magneticPressurePa - expected) < 1e-6);
  // 20 T holds a plasma of tens of atmospheres at β=5%.
  assert.ok(m.magneticPressureAtm > 1000);
  assert.ok(m.plasmaPressureAtm > 50 && m.plasmaPressureAtm < 200);
});

test('higher field holds more pressure', () => {
  const low = magneticContainment({ fieldT: 10 });
  const high = magneticContainment({ fieldT: 20 });
  assert.ok(high.magneticPressurePa > 4 * low.magneticPressurePa - 1e-6 || Math.abs(high.magneticPressurePa - 4 * low.magneticPressurePa) < 1e-6);
});

test('tungsten first wall survives a high divertor heat flux with margin', () => {
  const wall = firstWall({ heatFluxMWm2: 10 });
  assert.equal(wall.safe, true);
  assert.ok(wall.marginToMeltC > 1000); // big margin to the 3422 °C melting point
  assert.ok(wall.surfaceTempC < MATERIALS.tungsten.meltK - 273);
  // Doubling heat flux raises the wall temperature (still below melt at 20).
  const hot = firstWall({ heatFluxMWm2: 20 });
  assert.ok(hot.surfaceTempC > wall.surfaceTempC);
});

test('radiator area follows the T⁴ law and is why radiators must be hot', () => {
  const cold = radiatorArea({ wasteHeatKw: 3000, radiatorTempK: 300 });
  const hot = radiatorArea({ wasteHeatKw: 3000, radiatorTempK: 900 });
  // A 3× hotter radiator rejects 3⁴ = 81× the heat per area.
  assert.ok(Math.abs(cold.areaM2 / hot.areaM2 - (900 / 300) ** 4) < 1);
  assert.ok(hot.areaM2 < cold.areaM2 / 50);
  assert.ok(hot.areaM2 < 200);
  // Cross-check against Stefan-Boltzmann directly.
  const expected = 3e6 / (0.9 * STEFAN_BOLTZMANN_WM2K4 * 900 ** 4);
  assert.ok(Math.abs(hot.areaM2 - expected) < 1e-6);
});

test('the 300 K radiator is impractically large, the 900 K one is compact', () => {
  const d = thermalProtectionDesign({});
  assert.equal(d.radiators.at300K.areaClass, 'inviável (quilômetros quadrados)');
  assert.equal(d.radiators.at900K.areaClass, 'compacto');
});

test('residual neutron shielding is small because D+³He is almost aneutronic', () => {
  const d = thermalProtectionDesign({ fusionPowerKw: 15_000, neutronFraction: 0.03 });
  // ~450 kW of neutron power ⇒ a few tonnes of LiH/boron shielding, not the
  // massive vault a D+D reactor would demand.
  assert.ok(d.neutronPowerKw > 300 && d.neutronPowerKw < 600);
  assert.ok(d.shieldingMassKg > 1000 && d.shieldingMassKg < 3000);
});

test('crew protection relies on distance and shielding, not thick walls', () => {
  const d = thermalProtectionDesign({});
  assert.ok(d.crewProtection.distanceFromReactorM > 0);
  assert.ok(d.crewProtection.inverseSquareFactor < 1); // inverse-square falloff
});
