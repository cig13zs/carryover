/*
 * Boot check: does content.js survive being loaded at all?
 *
 * Version 1.2.0 shipped a ReferenceError on the very first run — a `let` read
 * above its own declaration — which threw before any UI was built. The
 * extension installed fine and then did visibly nothing, with the error buried
 * in a console nobody had open. Unit tests on the engine could not catch it,
 * because the engine was never the problem.
 *
 * This stubs just enough DOM to execute the file. It asserts the script runs
 * clean and actually attaches its UI. Run: node boot.test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function el(tag) {
  const node = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], style: { setProperty() {}, cssText: '' },
    classList: { add() {}, remove() {}, contains: () => false },
    dataset: {}, attributes: {},
    textContent: '', value: '', title: '', href: '', className: '',
    appendChild(c) { this.children.push(c); return c; },
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

function run(source, hostname) {
  const documentElement = el('html');
  const body = el('body');
  const sandbox = {
    location: { hostname: hostname, href: 'https://' + hostname + '/' },
    innerWidth: 1440, innerHeight: 900,
    document: {
      documentElement: documentElement, body: body,
      createElement: el,
      querySelectorAll: () => [],
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

// The real assertion: loading it must not throw. A TDZ error, a typo, a missing
// guard — anything fatal at module scope fails right here.
const SITES = ['chatgpt.com', 'chat.deepseek.com', 'grok.com'];
for (const host of SITES) {
  let root;
  assert.doesNotThrow(function () { root = run(source, host); },
    'content.js threw while loading on ' + host);
  assert.ok(root.children.length > 0,
    'content.js loaded but attached no UI on ' + host);
}

// On a site it does not target it must attach nothing and still not throw.
let other;
assert.doesNotThrow(function () { other = run(source, 'example.com'); },
  'content.js threw on an unrelated site');
assert.strictEqual(other.children.length, 0,
  'content.js attached UI to a site it does not target');

console.log('Boot checks passed on ' + SITES.length + ' sites.');