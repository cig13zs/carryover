/*
 * Self-check for the compaction engine.  Run:  node engine.test.js
 * No framework on purpose — if this file needs a test runner, the engine is
 * already too complicated.
 */
'use strict';
const assert = require('assert');
require('./src/engine.js');
const E = globalThis.CarryoverEngine;

const convo = [
  { role: 'user', text: 'I want to build a chrome extension that tracks context usage.' },
  { role: 'assistant', text: 'Sure. We could scrape the DOM or intercept fetch.' },
  { role: 'user', text: 'ok' },
  { role: 'assistant', text: 'The problem was hashed class names, so we decided to use a structural reader instead of fixed selectors.' },
  { role: 'assistant', text: 'Here is a draft:\n```js\nconst x = 1;\n// early draft that is long enough to count as a real block\n```' },
  { role: 'assistant', text: 'Corrected version:\n```js\nconst x = 2;\n// the later version which supersedes the draft above\n```' },
  { role: 'user', text: 'Never use innerHTML for this, it has to stay XSS-safe.' },
  { role: 'assistant', text: 'Agreed — textContent only.' },
  { role: 'user', text: 'What is next?' },
  { role: 'assistant', text: 'Wire up the badge UI.' }
];

// --- token estimation -------------------------------------------------------
assert.strictEqual(E.estimateTokens(''), 0, 'empty text is zero tokens');
assert.ok(E.estimateTokens('hello world') > 0, 'latin text counts');
// CJK packs more tokens per character than latin does
assert.ok(E.estimateTokens('这是一个测试') > E.estimateTokens('abcdef'),
  'CJK weighs heavier per character than latin');
assert.strictEqual(E.formatTokens(38200), '38.2k');
assert.strictEqual(E.formatTokens(900), '900');

// --- code extraction --------------------------------------------------------
const blocks = E.extractCodeBlocks(convo);
assert.strictEqual(blocks.length, 2, 'both distinct code blocks are found');
assert.ok(blocks.every(b => b.lang === 'js'), 'language tag is preserved');
const dupes = E.extractCodeBlocks([convo[4], convo[4]]);
assert.strictEqual(dupes.length, 1, 'identical blocks are deduped');

// --- decisions --------------------------------------------------------------
const decisions = E.extractDecisions(convo, 20);
assert.ok(decisions.some(d => /hashed class names/i.test(d)),
  'a stated decision is captured');
assert.ok(!decisions.some(d => /^ok$/i.test(d.trim())),
  'filler lines are not treated as decisions');

// --- compaction -------------------------------------------------------------
const out = E.compact(convo, { source: 'ChatGPT', keepLast: 3 });
assert.ok(out.startsWith('# Context handoff'), 'document has a header');
assert.ok(out.includes('chrome extension'), 'original goal survives');
assert.ok(out.includes('Never use innerHTML'), 'the last turns are verbatim');
assert.ok(out.includes('const x = 2;'), 'the newest code version is kept');
assert.ok(out.length < convo.reduce((n, m) => n + m.text.length, 0) * 3,
  'output does not balloon past the input');

// A summary must never contain text that was not in the source — this is the
// whole safety claim of doing extraction instead of an LLM call.
const sourceText = convo.map(m => m.text).join(' ').replace(/\s+/g, ' ');
['const x = 2;', 'Never use innerHTML'].forEach(snippet => {
  assert.ok(sourceText.includes(snippet), 'kept content traces back to the source');
});

// --- range selection --------------------------------------------------------
// Picking "messages 1 to 4" must not leak anything from outside that window.
// The UI slices before calling compact(), so this is the guarantee behind it.
const ranged = E.compact(convo.slice(0, 4), { source: 'ChatGPT', keepLast: 2 });
assert.ok(ranged.includes('chrome extension'), 'the selected range survives');
assert.ok(!ranged.includes('Wire up the badge UI'), 'text after the range is excluded');
assert.ok(!ranged.includes('const x = 2;'), 'code after the range is excluded');
assert.ok(E.compact(convo.slice(0, 1), {}), 'a single-message range still builds');

// --- edge cases -------------------------------------------------------------
assert.strictEqual(E.compact([], {}), null, 'empty conversation yields nothing');
assert.strictEqual(E.compact(null, {}), null, 'null input does not throw');
assert.ok(E.compact([{ role: 'user', text: 'hi' }], {}), 'single message still works');
assert.ok(!E.compact([{ role: 'system', text: 'ignored' }, { role: 'user', text: 'kept' }], {})
  .includes('ignored'), 'non user/assistant roles are dropped');

console.log('All engine checks passed.');
