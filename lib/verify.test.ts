/** Tests for lib/verify.ts — stdlib only, using node:test and a temp dir. */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOutput, SCREENSHOT_CAPS } from './verify.ts';

function makePng(bytes: number): Buffer {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.alloc(bytes - head.length, 0x00);
  return Buffer.concat([head, body]);
}

function validPng(): Buffer { return makePng(100); }
function largePng(): Buffer { return makePng(SCREENSHOT_CAPS.max_bytes + 1); }
function emptyFile(): Buffer { return Buffer.alloc(0); }
function notPng(): Buffer { return Buffer.from('not a png'); }

describe('verifyOutput', () => {
  let base: string;
  let out: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'tr-verify-'));
    out = join(base, 'out');
    mkdirSync(out, { recursive: true });
    mkdirSync(join(out, 'dashboard'), { recursive: true });
    mkdirSync(join(out, 'screenshots'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(base, { recursive: true, force: true }); } catch {}
  });

  function writeDashboard(html: string) {
    writeFileSync(join(out, 'dashboard', 'index.html'), html);
  }
  function writeDataJs(content: string) {
    writeFileSync(join(out, 'data.js'), content);
  }
  function writeBoardJson(content: string) {
    writeFileSync(join(out, 'board.json'), content);
  }
  function writeScreenshot(name: string, buf: Buffer) {
    writeFileSync(join(out, 'screenshots', name), buf);
  }

  function radars(boardSize: number, rows?: Array<{rank: number; slug: string}>): string {
    const r = rows ?? Array.from({ length: boardSize }, (_, i) => ({ rank: i + 1, slug: `p${i + 1}` }));
    return `window.RADAR={"as_of":"2026-01-01","source":"test","floor_usd":1000000,"model":{},"model_version":"radar-2","watchlist_size":3,"board_size":${boardSize},"early_size":0,"live_size":0,"rows":${JSON.stringify(r)},"live":[]};`;
  }

  test('passes: all artifacts valid', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    writeScreenshot('1-board.png', validPng());
    writeScreenshot('2-detail.png', validPng());
    writeScreenshot('3-filtered.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.equal(problems.length, 0);
  });

  test('fails: missing dashboard/index.html', () => {
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'missing' && p.file.includes('index.html')));
  });

  test('fails: dashboard missing data.js script reference', () => {
    writeDashboard(`<!doctype html><html><body id="board"></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'malformed' && p.message.includes('data script')));
  });

  test('fails: data.js missing window.RADAR', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs('window.FOO={};');
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'malformed' && p.message.includes('window.RADAR')));
  });

  test('fails: data.js RADAR missing required keys', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs('window.RADAR={};');
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'malformed' && p.message.includes('RADAR missing key')));
  });

  test('fails: data.js rows length mismatches board_size', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs('window.RADAR={"as_of":"2026-01-01","source":"t","floor_usd":1,"model":{},"model_version":"v","watchlist_size":1,"board_size":5,"early_size":0,"live_size":0,"rows":[{"rank":1,"slug":"p1"}],"live":[]};');
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('board_size')));
  });

  test('fails: data.js ranks not 1..n', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3, [{ rank: 1, slug: 'p1' }, { rank: 3, slug: 'p2' }, { rank: 2, slug: 'p3' }]));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('rank')));
  });

  test('fails: data.js row missing slug', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3, [{ rank: 1, slug: '' }, { rank: 2, slug: 'p2' }, { rank: 3, slug: 'p3' }]));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'malformed' && p.message.includes('no slug')));
  });

  test('fails: board.json missing', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'missing' && p.file.includes('board.json')));
  });

  test('fails: board.json rows count mismatches expected', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('expected 3')));
  });

  test('fails: board.json ranks not 1..n', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":3,"slug":"p2"},{"rank":2,"slug":"p3"}]}`);
    writeScreenshot('1.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('rank')));
  });

  test('fails: board.json duplicate rank', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":1,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    writeScreenshot('1.png', validPng());
    writeScreenshot('2.png', validPng());
    writeScreenshot('3.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('rank')));
  });

  test('fails: screenshots directory missing', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    // no screenshots dir

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'missing' && p.message.includes('screenshots')));
  });

  test('fails: no screenshots', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'missing' && p.message.includes('no image')));
  });

  test('fails: too many screenshots', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    for (let i = 1; i <= SCREENSHOT_CAPS.max + 1; i++) writeScreenshot(`${i}.png`, validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'oversize' && p.message.includes('exceed cap')));
  });

  test('fails: screenshot empty', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    writeScreenshot('1.png', emptyFile());
    writeScreenshot('2.png', validPng());
    writeScreenshot('3.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'malformed' && p.message.includes('empty')));
  });

  test('fails: screenshot not PNG', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    writeScreenshot('1.png', notPng());
    writeScreenshot('2.png', validPng());
    writeScreenshot('3.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'invalid' && p.message.includes('no PNG signature')));
  });

  test('fails: screenshot oversize', () => {
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3));
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"},{"rank":2,"slug":"p2"},{"rank":3,"slug":"p3"}]}`);
    writeScreenshot('1.png', largePng());
    writeScreenshot('2.png', validPng());
    writeScreenshot('3.png', validPng());

    const problems = verifyOutput(out, 3);
    assert.ok(problems.some(p => p.kind === 'oversize' && p.message.includes('over cap')));
  });

  test('cross-checks board.json against data.js when expectedBoardSize omitted', () => {
    // Expected not passed; board.json count should still be cross-checked against data.js
    writeDashboard(`<!doctype html><html><body id="board"><script src="../data.js"></script></body></html>`);
    writeDataJs(radars(3)); // board_size=3, rows=3
    writeBoardJson(`{"rows":[{"rank":1,"slug":"p1"}]}`); // only 1 row
    writeScreenshot('1.png', validPng());
    writeScreenshot('2.png', validPng());
    writeScreenshot('3.png', validPng());

    const problems = verifyOutput(out); // no expected
    assert.ok(problems.some(p => p.kind === 'mismatch' && p.message.includes('expected 3')));
  });

  test('reports multiple problems', () => {
    // missing dashboard, bad data.js, no screenshots
    writeDashboard(`<!doctype html><html><body></body></html>`); // no board mount, no data.js ref
    writeDataJs('window.RADAR={};');
    // no board.json
    // no screenshots dir

    const problems = verifyOutput(out, 3);
    assert.ok(problems.length >= 3);
  });
});