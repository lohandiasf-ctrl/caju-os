import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMomentum, rubberband } from '../lib/gesture.ts';

test('rubberband resists progressively past the boundary, never hard-stops', () => {
  assert.equal(rubberband(0, 300), 0);
  const near = rubberband(20, 300);
  const far = rubberband(200, 300);
  assert.ok(near > 0 && near < 20, 'small overshoot is damped below the raw drag distance');
  assert.ok(far > near, 'a bigger drag still moves further');
  assert.ok(far / 200 < near / 20, 'resistance increases the further past the boundary');
});

test('rubberband keeps the sign of the overshoot', () => {
  assert.ok(rubberband(-40, 300) < 0);
  assert.ok(rubberband(40, 300) > 0);
});

test('rubberband with zero dimension never divides by zero', () => {
  assert.equal(rubberband(50, 0), 0);
});

test('projectMomentum returns zero for a released gesture with no velocity', () => {
  assert.equal(projectMomentum(0), 0);
});

test('projectMomentum extends further in the direction of a faster flick', () => {
  const slow = projectMomentum(200);
  const fast = projectMomentum(800);
  assert.ok(slow > 0 && fast > slow);
});

test('projectMomentum respects the sign of the velocity', () => {
  assert.ok(projectMomentum(-500) < 0);
});
