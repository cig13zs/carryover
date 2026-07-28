/*
 * Boot check: does content.js survive being loaded at all?
 *
 * 1.2.0 shipped a `let` read above its own declaration, which threw before any
 * UI was built. The extension installed fine and then did nothing, with the
 * error buried in a console nobody had open. Engine unit tests can't catch
 * that, so this stubs enough DOM to actually execute the file.
 *
 * Run: node boot.test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function el(tag) {
  const node = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], style: { setProperty() {}, cssText: '', display: '' },
    classList: { add() {}, remove() {}, contains: () => false },
    dataset: {}, attributes: {},
    textContent: '', innerText: '', value: '', title: '', href: '', className: '',
    parentElement: null,
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    attachShadow() { this.shadow = el('shadow'); return this.shadow; },
    focus() {}, select() {}, click() {},
  };
  return node;
}

// A block of page text sitting in the main column, the shape readStructural
// scores. Width and left put it past the sidebar cutoff.
function block(text) {
  const node = el('div');
  node.innerText = text;
  node.textContent = text;
  node.getBoundingClientRect = () => ({ width: 700, height: 40, top: 200, left: 400, right: 1100, bottom: 240 });
  return node;
}

function run(source, hostname, pageBlocks) {
  const documentElement = el('html');
  const body = el('body');
  const blocks = pageBlocks || [];
  const sandbox = {
    location: { hostname: hostname, href: 'https://' + hostname + '/' },
    innerWidth: 1440, innerHeight: 900,
    document: {
      documentElement: documentElement, body: body,
      createElement: el,
      querySelectorAll: (sel) => (String(sel).indexOf('div') === 0 ? blocks : []),
      querySelector: () => null,
      execCommand: () => true,
      addEventListener() {},
    },
    addEventListener() {},
    setTimeout() {}, clearTimeout() {},
    getComputedStyle: () => ({ backgroundColor: 'rgba(0,0,0,0)' }),
    MutationObserver: function () { this.observe = function () {}; },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {} },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: function () {},
    Event: function (t) { this.type = t; },
    HTMLTextAreaElement: { prototype: {} },
    HTMLInputElement: { prototype: {} },
    console: console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'src', 'engine.js'), 'utf8'), sandbox);
  vm.runInContext(source, sandbox);
  return documentElement;
}

const source = fs.readFileSync(path.join(__dirname, 'src', 'content.js'), 'utf8');

// Loading it must not throw. A TDZ error, a typo, a missing guard: anything
// fatal at module scope fails right here.
const SITES = ['chatgpt.com', 'chat.deepseek.com', 'grok.com'];
for (const host of SITES) {
  let root;
  assert.doesNotThrow(function () { root = run(source, host); },
    'content.js threw while loading on ' + host);
  assert.ok(root.children.length > 0,
    'content.js loaded but attached no UI on ' + host);
  assert.strictEqual(root.children[0].style.display, 'none',
    'pill is visible with no conversation on ' + host);
}

// A new-chat screen: greeting, prompt suggestions, mode chips, disclaimer. All
// short and roughly equal. This used to clear the old floor and show the pill.
const parent = el('div');
[
  'Hi, I am DeepSeek. How can I help you today?',
  'Help me write a cover letter for a job',
  'Explain quantum computing in simple terms',
  'AI-generated, for reference only',
].forEach(function (t) { parent.appendChild(block(t)); });

const chips = run(source, 'chat.deepseek.com', parent.children);
assert.strictEqual(chips.children[0].style.display, 'none',
  'pill showed on a new-chat screen with only interface text');

// A real exchange: one long turn is enough to tell it apart.
const convo = el('div');
convo.appendChild(block('How do I center a div in CSS?'));
convo.appendChild(block('There are a few ways to do it. '.repeat(20)));
const live = run(source, 'chat.deepseek.com', convo.children);
assert.notStrictEqual(live.children[0].style.display, 'none',
  'pill stayed hidden during a real conversation');

// On a site it does not target it must attach nothing and still not throw.
let other;
assert.doesNotThrow(function () { other = run(source, 'example.com'); },
  'content.js threw on an unrelated site');
assert.strictEqual(other.children.length, 0,
  'content.js attached UI to a site it does not target');

console.log('Boot checks passed on ' + SITES.length + ' sites.');
