/* Build one Chrome Web Store package for every supported chat site. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const OUT = path.join(DIST, 'carryover');
const ICONS = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
const VERSION = '1.4.0';
const MATCHES = Object.freeze([
  'https://chatgpt.com/*',
  'https://chat.deepseek.com/*',
  'https://grok.com/*',
]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(root, dir) {
  const here = dir || root;
  const files = [];
  for (const entry of fs.readdirSync(here, { withFileTypes: true })) {
    const absolute = path.join(here, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(root, absolute));
    else files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files.sort();
}

/*
 * A tiny ZIP writer keeps releases reproducible without adding a dependency.
 * Entries are sorted and use the ZIP epoch (1980-01-01 00:00:00).
 */
function writeDeterministicZip(root, destination) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 33;
  const utf8 = 0x0800;

  for (const relative of listFiles(root)) {
    const name = Buffer.from(relative, 'utf8');
    const input = fs.readFileSync(path.join(root, ...relative.split('/')));
    const compressed = zlib.deflateRawSync(input, { level: 9 });
    const checksum = crc32(input);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(utf8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(input.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(input.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  const count = centralParts.length / 2;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(destination, Buffer.concat([...localParts, centralDirectory, end]));
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

  fs.copyFileSync(path.join(SRC, 'engine.js'), path.join(OUT, 'engine.js'));
  fs.copyFileSync(path.join(SRC, 'content.js'), path.join(OUT, 'content.js'));
  const popup = fs.readFileSync(path.join(SRC, 'popup.html'), 'utf8')
    .replace(/__VERSION__/g, VERSION);
  fs.writeFileSync(path.join(OUT, 'popup.html'), popup);
  for (const icon of ICONS) {
    fs.copyFileSync(path.join(SRC, 'icons', icon), path.join(OUT, 'icons', icon));
  }

  const name = 'Carryover: AI chat context handoff';
  const manifest = {
    manifest_version: 3,
    name: name,
    short_name: 'Carryover',
    version: VERSION,
    homepage_url: 'https://github.com/cig13zs/carryover',
    description: 'For free ChatGPT, DeepSeek, and Grok users: estimate chat size and carry context into a fresh conversation. Runs locally.',
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: {
      default_title: name,
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    },
    content_scripts: [
      {
        matches: MATCHES,
        js: ['engine.js', 'content.js'],
        run_at: 'document_idle',
      },
    ],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const zipName = 'carryover-' + VERSION + '.zip';
  const zipPath = path.join(DIST, zipName);
  writeDeterministicZip(OUT, zipPath);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  fs.writeFileSync(path.join(DIST, zipName + '.sha256'), digest + '  ' + zipName + '\n');

  console.log('built dist/carryover/');
  console.log('packed dist/' + zipName);
  console.log('sha256 ' + digest);
  return { manifest: manifest, zipPath: zipPath, digest: digest };
}

if (require.main === module) build();

module.exports = {
  MATCHES: MATCHES,
  VERSION: VERSION,
  build: build,
  writeDeterministicZip: writeDeterministicZip,
};
