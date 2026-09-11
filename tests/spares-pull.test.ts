import test from 'node:test';
import assert from 'node:assert/strict';
import { looksTruncated, MAX_PULL_ROWS } from '../lib/spares-pull.ts';

test('a connector page-size response is treated as truncated', () => {
  // The real incident: the pull flow returned exactly 256 rows of a 381-row
  // spreadsheet with HTTP 200, so FSA-132148 never reached the system while
  // the sync still reported success.
  assert.equal(looksTruncated(256), true);
  assert.equal(looksTruncated(512), true);
  assert.equal(looksTruncated(1000), true);
  assert.equal(looksTruncated(2048), true);
});

test('an ordinary row count is not flagged', () => {
  for (const count of [1, 255, 257, 381, 999, 1001]) {
    assert.equal(looksTruncated(count), false);
  }
});

test('an empty spreadsheet is not reported as truncated', () => {
  // Zero rows is a legitimate answer from an empty table; warning on it would
  // train people to ignore the warning.
  assert.equal(looksTruncated(0), false);
});

test('the pull cap leaves room above the current spreadsheet size', () => {
  assert.ok(MAX_PULL_ROWS > 381);
});
