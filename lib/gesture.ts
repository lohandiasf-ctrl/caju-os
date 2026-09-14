/**
 * Pure motion-math helpers from Apple's Designing Fluid Interfaces (WWDC 2018):
 * rubber-band resistance at a boundary, and momentum projection from a
 * release velocity. Kept dependency-free and side-effect-free so they are
 * trivial to unit test and reuse outside any specific gesture component.
 */

/** Progressive resistance past a boundary — never a hard stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Where a flick would come to rest under exponential-decay deceleration.
 * decelerationRate ~0.998 matches normal scroll feel; ~0.99 is snappier.
 */
export function projectMomentum(initialVelocity: number, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}
