/** Output verification for token-radar: checks generated artifacts are complete and well-formed.
 *  Stdlib only; returns problems instead of throwing on malformed data.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** One verification problem: the file, a machine-readable kind, and a human-readable message. */
export interface VerifyProblem {
  file: string;
  kind: 'missing' | 'malformed' | 'mismatch' | 'oversize' | 'invalid';
  message: string;
}

/** Screenshot caps; keep in sync with main.ts's SCREENSHOT_CAPS. */
export const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };

/** Top-level keys window.RADAR must carry. */
const RADAR_KEYS = [
  'as_of', 'source', 'floor_usd', 'model', 'model_version',
  'watchlist_size', 'board_size', 'early_size', 'live_size',
  'rows', 'live'
] as const;

/** Minimal shapes the verifier needs. */
interface RankRow { rank: number; slug: string }
interface Radar {
  board_size: number;
  rows: RankRow[];
  live: unknown[];
  [key: string]: unknown;
}

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Check ranks of a row array are exactly 1..n, appending problems to `out`. */
function checkRanks(rows: RankRow[], file: string, out: VerifyProblem[]): void {
  for (let i = 0; i < rows.length; i++) {
    const rank = rows[i]?.rank;
    if (rank !== i + 1) {
      out.push({ file, kind: 'mismatch', message: `row ${i} has rank ${String(rank)}, expected ${i + 1}` });
    }
    if (typeof rows[i]?.slug !== 'string' || rows[i]!.slug === '') {
      out.push({ file, kind: 'malformed', message: `row ${i} has no slug` });
    }
  }
}

/** Parse window.RADAR out of data.js text; null + problem on failure. */
function parseRadar(text: string, file: string, out: VerifyProblem[]): Radar | null {
  const m = /^\s*window\.RADAR\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
  if (m === null) {
    out.push({ file, kind: 'malformed', message: 'data.js does not contain window.RADAR = {...};' });
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(m[1]!);
  } catch (err) {
    out.push({ file, kind: 'malformed', message: `data.js RADAR is not valid JSON: ${String(err)}` });
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    out.push({ file, kind: 'malformed', message: 'data.js RADAR is not an object' });
    return null;
  }
  return value as Radar;
}

/** dashboard/index.html exists and references the data script and the board mount. */
function checkDashboardHtml(file: string, out: VerifyProblem[]): void {
  if (!existsSync(file)) {
    out.push({ file, kind: 'missing', message: 'dashboard/index.html not found' });
    return;
  }
  const html = readFileSync(file, 'utf8');
  if (!/<script src="\.\.\/data\.js"><\/script>/.test(html) && !/<script src="data\.js"><\/script>/.test(html)) {
    out.push({ file, kind: 'malformed', message: 'dashboard/index.html does not embed the data script (../data.js)' });
  }
  if (!/id="board"/.test(html)) {
    out.push({ file, kind: 'malformed', message: 'dashboard/index.html has no board mount (id="board")' });
  }
}

/** data.js: required keys, board_size, rows count + ranks, live array. Returns the count it found. */
function checkDataJs(file: string, expected: number | undefined, out: VerifyProblem[]): number | null {
  if (!existsSync(file)) {
    out.push({ file, kind: 'missing', message: 'data.js not found' });
    return null;
  }
  const radar = parseRadar(readFileSync(file, 'utf8'), file, out);
  if (radar === null) return null;

  for (const key of RADAR_KEYS) {
    if (!(key in radar)) out.push({ file, kind: 'malformed', message: `RADAR missing key: ${key}` });
  }
  if (!Number.isSafeInteger(radar.board_size) || radar.board_size < 0) {
    out.push({ file, kind: 'malformed', message: `RADAR.board_size is not a non-negative integer: ${String(radar.board_size)}` });
  }
  if (!Array.isArray(radar.rows)) {
    out.push({ file, kind: 'malformed', message: 'RADAR.rows is not an array' });
  } else {
    if (radar.board_size !== radar.rows.length) {
      out.push({ file, kind: 'mismatch', message: `RADAR.board_size ${radar.board_size} != RADAR.rows length ${radar.rows.length}` });
    }
    if (expected !== undefined && radar.rows.length !== expected) {
      out.push({ file, kind: 'mismatch', message: `RADAR.rows length ${radar.rows.length} != expected ${expected}` });
    }
    checkRanks(radar.rows, file, out);
  }
  if (!Array.isArray(radar.live)) {
    out.push({ file, kind: 'malformed', message: 'RADAR.live is not an array' });
  }
  return Array.isArray(radar.rows) ? radar.rows.length : null;
}

/** board.json: parse rows, compare count to expected, check ranks. Returns expected count for cross-check. */
function checkBoardJson(file: string, expected: number | undefined, out: VerifyProblem[]): void {
  if (!existsSync(file)) {
    out.push({ file, kind: 'missing', message: 'board.json not found' });
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    out.push({ file, kind: 'malformed', message: `board.json not valid JSON: ${String(err)}` });
    return;
  }
  // board.json is written as {rows: [...]}; accept a bare array too for tolerance.
  const rows: unknown = typeof value === 'object' && value !== null && !Array.isArray(value) && 'rows' in value
    ? (value as { rows: unknown }).rows
    : value;
  if (!Array.isArray(rows)) {
    out.push({ file, kind: 'malformed', message: 'board.json has no rows array' });
    return;
  }
  if (expected !== undefined && rows.length !== expected) {
    out.push({ file, kind: 'mismatch', message: `board.json has ${rows.length} rows, expected ${expected}` });
  }
  checkRanks(rows as RankRow[], file, out);
}

/** One screenshot: exists, non-empty PNG signature, within byte cap. */
function checkPng(file: string, out: VerifyProblem[]): void {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(file);
  } catch {
    out.push({ file, kind: 'missing', message: `screenshot not found: ${file}` });
    return;
  }
  if (!st.isFile()) {
    out.push({ file, kind: 'invalid', message: `screenshot is not a regular file: ${file}` });
    return;
  }
  if (st.size === 0) {
    out.push({ file, kind: 'malformed', message: `screenshot is empty: ${file}` });
    return;
  }
  if (st.size > SCREENSHOT_CAPS.max_bytes) {
    out.push({ file, kind: 'oversize', message: `screenshot is ${st.size} bytes, over cap ${SCREENSHOT_CAPS.max_bytes}: ${file}` });
    return;
  }
  const head = readFileSync(file).subarray(0, PNG_MAGIC.length);
  if (!PNG_MAGIC.every((b, i) => head[i] === b)) {
    out.push({ file, kind: 'invalid', message: `screenshot has no PNG signature: ${file}` });
  }
}

/** screenshots/: directory present, count within cap, every file a valid capped PNG. */
function checkScreenshots(dir: string, out: VerifyProblem[]): void {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n: string) => !n.startsWith('.'));
  } catch {
    out.push({ file: dir, kind: 'missing', message: 'screenshots/ directory not found' });
    return;
  }
  if (names.length === 0) {
    out.push({ file: dir, kind: 'missing', message: 'screenshots/ holds no image' });
  }
  if (names.length > SCREENSHOT_CAPS.max) {
    out.push({ file: dir, kind: 'oversize', message: `${names.length} screenshots exceed cap ${SCREENSHOT_CAPS.max}` });
  }
  for (const name of names) checkPng(join(dir, name), out);
}

/**
 * Verify the artifact set in `outputDir`.
 *
 * `expectedBoardSize`, when given, is the authoritative row count (main.ts passes the board it built).
 * Without it, the count is cross-checked only between data.js (board_size) and board.json.
 * Never throws for data problems: malformed, missing, or inconsistent artifacts come back as problems.
 */
export function verifyOutput(outputDir: string, expectedBoardSize?: number): VerifyProblem[] {
  const problems: VerifyProblem[] = [];
  checkDashboardHtml(join(outputDir, 'dashboard', 'index.html'), problems);
  const dataCount = checkDataJs(join(outputDir, 'data.js'), expectedBoardSize, problems);
  // Fall back to data.js's own count when the caller didn't pin one, so board.json is still cross-checked.
  checkBoardJson(join(outputDir, 'board.json'), expectedBoardSize ?? dataCount ?? undefined, problems);
  checkScreenshots(join(outputDir, 'screenshots'), problems);
  return problems;
}