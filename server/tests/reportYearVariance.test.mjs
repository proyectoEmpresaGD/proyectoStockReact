import test from 'node:test';
import assert from 'node:assert/strict';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';

test('la variación se calcula sobre la misma base positiva sin alterar las cantidades', () => {
  assert.equal(reportYearVariance(1250, 1000),25);
  assert.equal(reportYearVariance(750, 1000),-25);
  assert.equal(reportYearVariance(0, 1000),-100);
  assert.equal(reportYearVariance(1010.50, 1000),1.05);
});
test('no inventa variación cuando no existe base positiva, la cifra es negativa o es parcial', () => {
  for (const [actual,previous] of [[100,0],[0,0],[-10,100],[100,-20],['',100],[null,100],[Infinity,100]])
    assert.equal(reportYearVariance(actual,previous),null);
  assert.equal(reportYearVariance(100,100,{partial:true}),null);
  assert.match(varianceReadingNote,/abonos/i);
});
