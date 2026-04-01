import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, splitRawArgumentString } from "../plugins/codex/scripts/lib/args.mjs";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs returns empty options and positionals for an empty argv", () => {
  const result = parseArgs([]);
  assert.deepEqual(result.options, {});
  assert.deepEqual(result.positionals, []);
});

test("parseArgs collects bare words as positionals", () => {
  const { options, positionals } = parseArgs(["investigate", "the", "flaky", "test"]);
  assert.deepEqual(options, {});
  assert.deepEqual(positionals, ["investigate", "the", "flaky", "test"]);
});

test("parseArgs treats unknown flags as positionals", () => {
  const { positionals } = parseArgs(["--unknown-flag", "value"]);
  assert.deepEqual(positionals, ["--unknown-flag", "value"]);
});

test("parseArgs sets boolean options to true", () => {
  const { options } = parseArgs(["--background", "--write"], {
    booleanOptions: ["background", "write"]
  });
  assert.equal(options.background, true);
  assert.equal(options.write, true);
});

test("parseArgs sets boolean option to false when value is 'false'", () => {
  const { options } = parseArgs(["--background=false"], {
    booleanOptions: ["background"]
  });
  assert.equal(options.background, false);
});

test("parseArgs reads value options separated by a space", () => {
  const { options } = parseArgs(["--model", "gpt-5.4-mini", "--effort", "high"], {
    valueOptions: ["model", "effort"]
  });
  assert.equal(options.model, "gpt-5.4-mini");
  assert.equal(options.effort, "high");
});

test("parseArgs reads value options using = syntax", () => {
  const { options } = parseArgs(["--model=spark"], {
    valueOptions: ["model"]
  });
  assert.equal(options.model, "spark");
});

test("parseArgs throws when a required value is missing after a value option", () => {
  assert.throws(
    () => parseArgs(["--model"], { valueOptions: ["model"] }),
    /Missing value for --model/
  );
});

test("parseArgs resolves a single-character alias to the full option name", () => {
  const { options } = parseArgs(["-m", "gpt-5.4-mini"], {
    valueOptions: ["model"],
    aliasMap: { m: "model" }
  });
  assert.equal(options.model, "gpt-5.4-mini");
});

test("parseArgs treats everything after -- as positionals regardless of flag shape", () => {
  const { options, positionals } = parseArgs(["--background", "--", "--not-a-flag", "value"], {
    booleanOptions: ["background"]
  });
  assert.equal(options.background, true);
  assert.deepEqual(positionals, ["--not-a-flag", "value"]);
});

test("parseArgs mixes flags and positionals in any order", () => {
  const { options, positionals } = parseArgs(
    ["investigate", "--model", "spark", "the", "--write", "flaky", "test"],
    { valueOptions: ["model"], booleanOptions: ["write"] }
  );
  assert.equal(options.model, "spark");
  assert.equal(options.write, true);
  assert.deepEqual(positionals, ["investigate", "the", "flaky", "test"]);
});

test("parseArgs uses the C alias for cwd by default", () => {
  const { options } = parseArgs(["-C", "/workspace"], {
    valueOptions: ["cwd"],
    aliasMap: { C: "cwd" }
  });
  assert.equal(options.cwd, "/workspace");
});

// ---------------------------------------------------------------------------
// splitRawArgumentString
// ---------------------------------------------------------------------------

test("splitRawArgumentString returns empty array for an empty string", () => {
  assert.deepEqual(splitRawArgumentString(""), []);
});

test("splitRawArgumentString returns empty array for whitespace-only input", () => {
  assert.deepEqual(splitRawArgumentString("   \t  "), []);
});

test("splitRawArgumentString splits on whitespace", () => {
  assert.deepEqual(splitRawArgumentString("a b c"), ["a", "b", "c"]);
});

test("splitRawArgumentString collapses multiple whitespace characters between tokens", () => {
  assert.deepEqual(splitRawArgumentString("foo   bar\tbaz"), ["foo", "bar", "baz"]);
});

test("splitRawArgumentString preserves spaces inside single quotes", () => {
  assert.deepEqual(splitRawArgumentString("--base 'main branch'"), ["--base", "main branch"]);
});

test("splitRawArgumentString preserves spaces inside double quotes", () => {
  assert.deepEqual(splitRawArgumentString('--focus "auth and retry"'), ["--focus", "auth and retry"]);
});

test("splitRawArgumentString strips the quote characters themselves", () => {
  const tokens = splitRawArgumentString("'hello world'");
  assert.deepEqual(tokens, ["hello world"]);
});

test("splitRawArgumentString handles a backslash escape outside quotes", () => {
  assert.deepEqual(splitRawArgumentString("foo\\ bar baz"), ["foo bar", "baz"]);
});

test("splitRawArgumentString handles a trailing backslash by preserving it", () => {
  assert.deepEqual(splitRawArgumentString("foo\\"), ["foo\\"]);
});

test("splitRawArgumentString handles flags with values exactly as the companion passes them", () => {
  const tokens = splitRawArgumentString('--background --model spark "fix the flaky test"');
  assert.deepEqual(tokens, ["--background", "--model", "spark", "fix the flaky test"]);
});
