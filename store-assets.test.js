'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function checkPng(relative, width, height) {
  const file = path.join(__dirname, relative);
  assert.ok(fs.existsSync(file), 'missing store asset: ' + relative);
  const data = fs.readFileSync(file);
  assert.strictEqual(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', relative + ' is not PNG');
  assert.strictEqual(data.readUInt32BE(16), width, relative + ' width');
  assert.strictEqual(data.readUInt32BE(20), height, relative + ' height');
  assert.ok(data.length > 10000, relative + ' is unexpectedly small');
  assert.ok(data.length < 5 * 1024 * 1024, relative + ' exceeds 5 MB');
  return crypto.createHash('sha256').update(data).digest('hex');
}

const selected = [
  'store-assets/chatgpt/01-pill.png',
  'store-assets/deepseek/01-pill.png',
  'store-assets/grok/01-pill.png',
  'store-assets/chatgpt/02-handoff.png',
  'store-assets/chatgpt/03-privacy.png'
];
const screenshotHashes = selected.map((file) => checkPng(file, 1280, 800));
assert.strictEqual(new Set(screenshotHashes).size, selected.length, 'selected screenshots must be visually distinct');
checkPng('store-assets/chatgpt/promo-440x280.png', 440, 280);

const listing = fs.readFileSync(path.join(__dirname, 'store-assets', 'README.md'), 'utf8');
const listingProse = listing.replace(/^>\s?/gm, '');
assert.match(listingProse, /built for people using the free tiers/i);
assert.match(listingProse, /free-plan planning hint/i);
assert.match(listingProse, /not a measurement of an account's actual model\s+limit/i);
assert.doesNotMatch(
  listingProse,
  /\b(?:bypass(?:es)? limits|unlimited context|guaranteed context)\b/i
);

console.log('ok, Carryover store assets and free-tier positioning passed');
