import test from 'node:test';
import assert from 'node:assert/strict';
import { bars } from '../js/charts.js';

globalThis.devicePixelRatio = 1;
globalThis.document = { body: {} };
globalThis.getComputedStyle = () => ({ color: '#111' });

function canvasMock() {
  const calls = { bars: [], labels: [] };
  const context = {
    scale() {}, clearRect() {},
    fillRect(...args) { calls.bars.push(args); },
    fillText(text) { calls.labels.push(String(text)); },
  };
  return {
    canvas: { clientWidth: 600, style: {}, getContext: () => context },
    calls,
  };
}

test('el gráfico representa todos los meses aunque haya más de ocho entradas', () => {
  const { canvas, calls } = canvasMock();
  const months = Array.from({ length: 12 }, (_, index) => [`Mes ${index + 1}`, index + 1]);
  bars(canvas, months);
  assert.equal(calls.bars.length, 12);
  assert.ok(calls.labels.includes('Mes 12'));
  assert.equal(canvas.style.height, '342px');
});

test('el gráfico de evolución representa todos los puntos sin truncarlos', () => {
  const { canvas, calls } = canvasMock();
  const evolution = Array.from({ length: 25 }, (_, index) => [`2026-07-${String(index + 1).padStart(2, '0')}`, 1000 + index]);
  bars(canvas, evolution);
  assert.equal(calls.bars.length, evolution.length);
  assert.ok(calls.labels.includes('2026-07-25'));
  assert.equal(canvas.style.height, '680px');
});
