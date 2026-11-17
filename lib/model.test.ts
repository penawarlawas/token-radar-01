import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRadar, boardIssue, impliedValue, MODEL, parseSnapshot } from './model.ts';

const snapshot = parseSnapshot(readFileSync('snapshot.json', 'utf8'));
const first = buildRadar(snapshot);
assert.equal(boardIssue(first.board, snapshot), null);
assert.equal(first.board.length, 100);
assert.equal(new Set(first.board.map((row) => row.slug)).size, 100);
assert.equal(JSON.stringify(first), JSON.stringify(buildRadar(snapshot)));
assert.ok(first.board.every((row) => row.farm_steps.length === 3 && row.farm_steps.every((step) => step.length >= 20 && step.length <= 600)));
const p = snapshot.protocols[0]!;
assert.equal(impliedValue({ ...p, tvl_usd: 0, change_7d: null, listed_at: null }, snapshot.as_of, MODEL).implied, 1);
assert.ok(Number.isFinite(impliedValue({ ...p, tvl_usd: Number.MAX_VALUE, change_7d: 1e100 }, snapshot.as_of, MODEL).implied));
assert.ok(impliedValue({ ...p, change_7d: 80 }, snapshot.as_of, MODEL).implied > impliedValue({ ...p, change_7d: -60 }, snapshot.as_of, MODEL).implied);
console.log('model checks passed');
