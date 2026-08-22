/* Release package checks. Run: node build.test.js */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { MATCHES, VERSION } = require('./build.js');

const DIST = path.join(__dirname, 'dist');
const OUT = path.join(DIST, 'carryover');
const ZIP = path.join(DIST, 'carryover-' + VERSION + '.zip');
const EXPECTED_MATCHES = [
  'https://chatgpt.com/*',
  'https://chat.deepseek.com/*',
  'https://grok.com/*',
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(root, dir) {
  const here = dir || root;
  const out = [];
  for (const entry of fs.readdirSync(here, { withFileTypes: true })) {
    const absolute = path.join(here, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(root, absolute));
    else out.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return out.sort();
}

function readLocalEntries(file) {
  const archive = fs.readFileSync(file);
  const entries = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    assert.strictEqual(method, 8, name + ' should use deflate');
    entries.set(name, zlib.inflateRawSync(compressed));
    offset = dataStart + compressedSize;
  }
  assert.strictEqual(archive.readUInt32LE(offset), 0x02014b50,
    'local entries should end at the central directory');
  return entries;
}

function runBuild() {
  execFileSync(process.execPath, ['build.js'], { cwd: __dirname, stdio: 'pipe' });
}

runBuild();
const firstHash = sha256(ZIP);
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const contentSource = fs.readFileSync(path.join(__dirname, 'src', 'content.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(__dirname, 'src', 'popup.html'), 'utf8');

assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.version, VERSION);
assert.ok(manifest.name.length <= 75, 'store name is within Chrome Web Store limits');
assert.ok(manifest.description.length <= 132, 'description is within manifest limits');
assert.match(manifest.description, /^For free ChatGPT, DeepSeek, and Grok users:/,
  'manifest identifies the intended free-tier audience');
assert.match(contentSource, /planningBudget/, 'percentage uses an explicitly named planning budget');
assert.doesNotMatch(contentSource, /\bceiling\s*:/, 'planning hint must not be represented as a real limit');
assert.match(popupSource, /rough free-plan planning hint, not your account limit/i,
  'popup explains the percentage honestly');
assert.strictEqual(manifest.content_scripts.length, 1,
  'one content script bundle should serve all sites');
assert.deepStrictEqual(Array.from(MATCHES), EXPECTED_MATCHES, 'build targets only the supported chats');
assert.deepStrictEqual(manifest.content_scripts[0].matches, EXPECTED_MATCHES);
for (const key of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions']) {
  assert.ok(!(key in manifest), 'manifest should not declare ' + key);
}
assert.ok(!fs.existsSync(path.join(DIST, 'chatgpt')), 'old ChatGPT-only build is gone');
assert.ok(!fs.existsSync(path.join(DIST, 'deepseek')), 'old DeepSeek-only build is gone');
assert.ok(!fs.existsSync(path.join(DIST, 'grok')), 'old Grok-only build is gone');

const unpacked = readLocalEntries(ZIP);
const expectedFiles = listFiles(OUT);
assert.deepStrictEqual(Array.from(unpacked.keys()), expectedFiles,
  'zip contains the unpacked extension and nothing else');
for (const relative of expectedFiles) {
  assert.deepStrictEqual(unpacked.get(relative), fs.readFileSync(path.join(OUT, ...relative.split('/'))),
    relative + ' differs between the zip and unpacked build');
}

const sidecar = fs.readFileSync(ZIP + '.sha256', 'utf8').trim();
assert.strictEqual(sidecar, firstHash + '  ' + path.basename(ZIP), 'checksum sidecar matches package');

runBuild();
assert.strictEqual(sha256(ZIP), firstHash, 'two clean builds must produce the same zip bytes');

console.log('Build checks passed: one 3-site package, sha256 ' + firstHash);
