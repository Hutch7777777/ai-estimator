/**
 * scripts/validate-mn568-baseline.ts
 *
 * MN568 regression validator (Phase 0.5 — Regression harness skeleton).
 *
 * Purpose:
 *   Compare a captured "actual" takeoff result against the canonical
 *   MN568 expected baseline. Returns nonzero on any drift, so this script
 *   can gate calculation/database/n8n/frontend PRs before merge.
 *
 * Invocation:
 *   npm run validate:mn568
 *
 *   or:
 *   tsx scripts/validate-mn568-baseline.ts [--actual <path>] [--expected <path>] [--epsilon <number>]
 *
 *   Defaults:
 *     --expected  test-data/baselines/MN568.expected.json
 *     --actual    test-data/runs/MN568.actual.json
 *     --epsilon   0 (exact match)
 *
 * Exit codes:
 *   0  — actual matches expected (within epsilon)
 *   1  — drift detected, files missing, or JSON parse error
 *
 * Contract for the actual file:
 *   The "actual" file must have the same shape as the expected file. Any
 *   producer (the engine route, the n8n workflow, a manual capture) is
 *   responsible for shaping its output to match. The `_meta` block is
 *   ignored during comparison.
 *
 * No external API calls. No production behavior touched. File reads only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

interface BaselineFile {
  _meta?: unknown;
  project: { id: string; name: string };
  detection_counts: Record<string, number>;
  net_siding_sf: number;
  trim_lf: number;
  siding_squares: number;
  material_subtotal: number;
  labor_subtotal: number;
  overhead_subtotal: number;
  markup_percent: number;
  final_total: number;
  line_item_count: number;
  presentation_group_totals: Record<string, number>;
}

interface CliArgs {
  expectedPath: string;
  actualPath: string;
  epsilon: number;
}

function parseArgs(argv: string[]): CliArgs {
  const cwd = process.cwd();
  const args: CliArgs = {
    expectedPath: resolve(cwd, 'test-data/baselines/MN568.expected.json'),
    actualPath: resolve(cwd, 'test-data/runs/MN568.actual.json'),
    epsilon: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--expected' && value) {
      args.expectedPath = resolve(cwd, value);
      i++;
    } else if (flag === '--actual' && value) {
      args.actualPath = resolve(cwd, value);
      i++;
    } else if (flag === '--epsilon' && value) {
      const n = Number(value);
      if (Number.isNaN(n) || n < 0) {
        die(`Invalid --epsilon value: ${value} (must be a non-negative number)`);
      }
      args.epsilon = n;
      i++;
    } else if (flag === '--help' || flag === '-h') {
      printHelp();
      process.exit(0);
    } else {
      die(`Unknown argument: ${flag}\nRun with --help for usage.`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
MN568 regression validator

Usage:
  tsx scripts/validate-mn568-baseline.ts [options]

Options:
  --expected <path>   Path to the expected baseline JSON
                      (default: test-data/baselines/MN568.expected.json)
  --actual   <path>   Path to the actual run JSON to validate
                      (default: test-data/runs/MN568.actual.json)
  --epsilon  <num>    Allowed numeric tolerance for currency/SF fields
                      (default: 0). Integer fields (counts) ignore epsilon.
  --help, -h          Show this message

Exit codes:
  0 = baseline matches actual (within epsilon)
  1 = drift, missing files, or JSON parse error
`.trim());
}

function die(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function loadJson(path: string, label: string): BaselineFile {
  if (!existsSync(path)) {
    if (label === 'actual') {
      const rel = relative(process.cwd(), path);
      die(
        `Actual run file not found: ${rel}\n\n` +
        `   The validator needs an actual run captured from the system to compare\n` +
        `   against the expected baseline. To produce one:\n\n` +
        `     1. Run the MN568 takeoff through the production path (n8n approval)\n` +
        `        OR the parallel verification route (/api/estimating/calculate-siding).\n` +
        `     2. Reshape the response to match test-data/baselines/MN568.expected.json.\n` +
        `     3. Save it to test-data/runs/MN568.actual.json (or pass --actual <path>).\n\n` +
        `   See test-data/baselines/MN568.expected.json _meta block for the field contract.`
      );
    }
    die(`Expected baseline not found: ${relative(process.cwd(), path)}`);
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    die(`Failed to read ${label} file ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as BaselineFile;
  } catch (err) {
    die(`Failed to parse ${label} JSON at ${path}: ${(err as Error).message}`);
  }
}

interface Drift {
  field: string;
  expected: unknown;
  actual: unknown;
  delta?: number;
}

function compareNumber(
  field: string,
  expected: number,
  actual: unknown,
  epsilon: number,
  isInteger: boolean,
  drifts: Drift[]
): void {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    drifts.push({ field, expected, actual });
    return;
  }
  if (isInteger) {
    if (actual !== expected) {
      drifts.push({ field, expected, actual, delta: actual - expected });
    }
    return;
  }
  const delta = actual - expected;
  if (Math.abs(delta) > epsilon) {
    drifts.push({ field, expected, actual, delta });
  }
}

function compareString(
  field: string,
  expected: string,
  actual: unknown,
  drifts: Drift[]
): void {
  if (actual !== expected) {
    drifts.push({ field, expected, actual });
  }
}

function compareNumberMap(
  prefix: string,
  expected: Record<string, number>,
  actual: unknown,
  epsilon: number,
  isInteger: boolean,
  drifts: Drift[]
): void {
  if (!actual || typeof actual !== 'object') {
    drifts.push({ field: prefix, expected, actual });
    return;
  }
  const actualMap = actual as Record<string, unknown>;
  const allKeys = new Set([
    ...Object.keys(expected),
    ...Object.keys(actualMap),
  ]);
  for (const key of allKeys) {
    const fieldName = `${prefix}.${key}`;
    const expectedHas = Object.prototype.hasOwnProperty.call(expected, key);
    const actualHas = Object.prototype.hasOwnProperty.call(actualMap, key);
    if (expectedHas && !actualHas) {
      drifts.push({ field: fieldName, expected: expected[key], actual: undefined });
      continue;
    }
    if (!expectedHas && actualHas) {
      drifts.push({ field: fieldName, expected: undefined, actual: actualMap[key] });
      continue;
    }
    compareNumber(fieldName, expected[key], actualMap[key], epsilon, isInteger, drifts);
  }
}

function validate(expected: BaselineFile, actual: BaselineFile, epsilon: number): Drift[] {
  const drifts: Drift[] = [];

  compareString('project.id', expected.project.id, actual.project?.id, drifts);
  compareString('project.name', expected.project.name, actual.project?.name, drifts);

  compareNumberMap('detection_counts', expected.detection_counts, actual.detection_counts, 0, true, drifts);

  compareNumber('net_siding_sf', expected.net_siding_sf, actual.net_siding_sf, epsilon, false, drifts);
  compareNumber('trim_lf', expected.trim_lf, actual.trim_lf, epsilon, false, drifts);
  compareNumber('siding_squares', expected.siding_squares, actual.siding_squares, epsilon, false, drifts);

  compareNumber('material_subtotal', expected.material_subtotal, actual.material_subtotal, epsilon, false, drifts);
  compareNumber('labor_subtotal', expected.labor_subtotal, actual.labor_subtotal, epsilon, false, drifts);
  compareNumber('overhead_subtotal', expected.overhead_subtotal, actual.overhead_subtotal, epsilon, false, drifts);
  compareNumber('markup_percent', expected.markup_percent, actual.markup_percent, epsilon, false, drifts);
  compareNumber('final_total', expected.final_total, actual.final_total, epsilon, false, drifts);

  compareNumber('line_item_count', expected.line_item_count, actual.line_item_count, 0, true, drifts);

  compareNumberMap('presentation_group_totals', expected.presentation_group_totals, actual.presentation_group_totals, epsilon, false, drifts);

  return drifts;
}

function fmt(value: unknown): string {
  if (value === undefined) return '<missing>';
  if (typeof value === 'number') return value.toString();
  return JSON.stringify(value);
}

function printDriftReport(drifts: Drift[], expectedPath: string, actualPath: string, epsilon: number): void {
  const cwd = process.cwd();
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ MN568 regression: DRIFT DETECTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   expected: ${relative(cwd, expectedPath)}`);
  console.log(`   actual:   ${relative(cwd, actualPath)}`);
  console.log(`   epsilon:  ${epsilon}`);
  console.log(`   drifts:   ${drifts.length} field(s)`);
  console.log('');
  for (const drift of drifts) {
    const deltaStr = drift.delta !== undefined ? `  Δ ${drift.delta > 0 ? '+' : ''}${drift.delta}` : '';
    console.log(`   • ${drift.field}`);
    console.log(`       expected: ${fmt(drift.expected)}`);
    console.log(`       actual:   ${fmt(drift.actual)}${deltaStr}`);
  }
  console.log('');
}

function printPassReport(expectedPath: string, actualPath: string, epsilon: number): void {
  const cwd = process.cwd();
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ MN568 regression: PASS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   expected: ${relative(cwd, expectedPath)}`);
  console.log(`   actual:   ${relative(cwd, actualPath)}`);
  console.log(`   epsilon:  ${epsilon}`);
  console.log('');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const expected = loadJson(args.expectedPath, 'expected');
  const actual = loadJson(args.actualPath, 'actual');
  const drifts = validate(expected, actual, args.epsilon);
  if (drifts.length > 0) {
    printDriftReport(drifts, args.expectedPath, args.actualPath, args.epsilon);
    process.exit(1);
  }
  printPassReport(args.expectedPath, args.actualPath, args.epsilon);
  process.exit(0);
}

main();
