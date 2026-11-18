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

// Parser refusals: each bad snapshot names its own defect instead of scoring silently.
const base = JSON.parse(readFileSync('snapshot.json', 'utf8'));
function refuses(mutate: (s: any) => void, needle: string): void {
  const copy = JSON.parse(JSON.stringify(base));
  mutate(copy);
  assert.throws(() => parseSnapshot(JSON.stringify(copy)), (err: Error) => err.name === 'SnapshotError' && err.message.includes(needle), `expected refusal mentioning ${needle}`);
}
refuses((s) => { s.protocols.push({ ...s.protocols[0] }); }, 'duplicate protocol slug');
refuses((s) => { s.watchlist.push(s.watchlist[0]); }, 'duplicate watchlist slug');
refuses((s) => { s.protocols[0].name = '   '; }, 'valid slug, name');
refuses((s) => { s.protocols[0].tvl_usd = -1; }, 'valid slug, name');
refuses((s) => { s.protocols[0].slug = ''; }, 'valid slug, name');
refuses((s) => { s.as_of = '2026-02-30'; }, 'as_of');

// A duplicate slug that slips past the parser cannot occupy two board slots.
const dup = { ...snapshot, protocols: [...snapshot.protocols, p] };
const dupRows = buildRadar(dup).board;
assert.equal(new Set(dupRows.map((r) => r.slug)).size, dupRows.length);
assert.equal(dupRows.length, 100);

console.log('model checks passed');
