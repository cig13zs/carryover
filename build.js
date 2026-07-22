/*
 * Carryover — one source, two store listings.
 * Builds dist/chatgpt/ and dist/deepseek/ from src/. Run: node build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const ICONS = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

const TARGETS = {
  chatgpt: {
    name: 'Carryover — unofficial context handoff for ChatGPT',
    match: 'https://chatgpt.com/*',
    description: 'See how full your chat is, then carry its context into a new one. Works fully offline — no account, no server, no data collected. Not affiliated with or endorsed by OpenAI.',
  },
  deepseek: {
    name: 'Carryover — unofficial context handoff for DeepSeek',
    match: 'https://chat.deepseek.com/*',
    description: 'See how full your chat is, then carry its context into a new one. Works fully offline — no account, no server, no data collected. Not affiliated with or endorsed by DeepSeek.',
  },
  grok: {
    name: 'Carryover — unofficial context handoff for Grok',
    match: 'https://grok.com/*',
    description: 'See how full your chat is, then carry its context into a new one. Works fully offline — no account, no server, no data collected. Not affiliated with or endorsed by xAI.',
  },
};

const VERSION = '1.2.3';

function buildTarget(id, cfg) {
  const outDir = path.join(DIST, id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });

  fs.copyFileSync(path.join(SRC, 'engine.js'), path.join(outDir, 'engine.js'));
  fs.copyFileSync(path.join(SRC, 'content.js'), path.join(outDir, 'content.js'));
// Version lives in one place. The popup used to hardcode it, which is exactly
  // the kind of thing that silently goes stale two releases later.
  const popup = fs.readFileSync(path.join(SRC, 'popup.html'), 'utf8')
    .replace(/__VERSION__/g, VERSION);
  fs.writeFileSync(path.join(outDir, 'popup.html'), popup);
  for (const icon of ICONS) {
    fs.copyFileSync(path.join(SRC, 'icons', icon), path.join(outDir, 'icons', icon));
  }

  const manifest = {
    manifest_version: 3,
    name: cfg.name,
    version: VERSION,
    homepage_url: 'https://github.com/cig13zs/carryover',
    description: cfg.description,
icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    // A toolbar popup needs no permission. It is the only place a user can find
    // the project and the tip jar once the extension is installed from a store.
    action: {
      default_title: cfg.name,
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    },
    content_scripts: [
      {
        matches: [cfg.match],
        js: ['engine.js', 'content.js'],
        run_at: 'document_idle',
      },
    ],
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`built dist/${id}/`);
}

for (const [id, cfg] of Object.entries(TARGETS)) {
  buildTarget(id, cfg);
}
