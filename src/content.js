/*
 * Carryover — content script.
 *
 * Reads the conversation already rendered in the page, estimates its size, and
 * builds a handoff document on request. It makes no network requests of any
 * kind: there is no server, no API key, and no telemetry. Everything below runs
 * against the DOM that is already in front of you.
 */
(function () {
  'use strict';

  const E = globalThis.CarryoverEngine;
  if (!E) return;

  const KOFI_URL = 'https://ko-fi.com/jju1s';

  /* ---------------------------------------------------------------------- *
   * Site adapters
   * ---------------------------------------------------------------------- */

  // ponytail: conservative per-site defaults. The page never states which plan
  // or model window you are on, so these are a sane ruler rather than a
  // measurement — the token count is the honest number, the bar is a hint.
  const ADAPTERS = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      host: /(^|\.)chatgpt\.com$/,
      ceiling: 32000,
      fresh: 'https://chatgpt.com/',
      /*
       * `data-turn` sits on every turn and reads "user" or "assistant".
       *
       * Verified against the live site on 2026-07-22 — do not "simplify" this
       * back to [data-message-author-role]. That attribute still exists but is
       * now only emitted on some turns, so it silently returns half the
       * conversation, which looks like it works right up until it matters.
       */
      read: function () {
        return [].slice.call(document.querySelectorAll('[data-turn]'))
          .map(function (el) {
            return { role: el.getAttribute('data-turn'), text: turnText(el) };
          });
      }
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      host: /(^|\.)deepseek\.com$/,
      ceiling: 128000,
      fresh: 'https://chat.deepseek.com/',
      read: readStructural
    },
    {
      id: 'grok',
      name: 'Grok',
      host: /(^|\.)grok\.com$/,
      ceiling: 128000,
      fresh: 'https://grok.com/',
      read: readStructural
    }
  ];

  function text(el) {
    return (el.innerText || el.textContent || '').trim();
  }

  /*
   * innerText, not textContent — textContent drags in screen-reader labels
   * ("You said:") that would pollute the handoff.
   *
   * A turn with no text but an image is a real turn: an uploaded screenshot or
   * photo. Mark it so the ordering of the conversation stays intact, and so you
   * can see at a glance that something visual is missing rather than wondering
   * why the summary skips a beat. Images cannot ride along in a text handoff.
   */
  function turnText(el) {
    const t = text(el);
    if (t) return t;
    return el.querySelector('img') ? '[image attachment — not carried over]' : '';
  }

  /*
   * Structural reader, for sites whose class names are build-hashed (DeepSeek
   * ships classes like `_3098d02` that change on every deploy — a selector
   * written against those is broken by the next release).
   *
   * Instead of naming anything, find the element that actually holds a stack of
   * sibling text blocks in the main column, and read that.
   */
  function readStructural() {
    const minX = innerWidth * 0.25;
    const scored = new Map();

    // Any element with real text in the main column votes for its parent.
    document.querySelectorAll('div, article, section').forEach(function (el) {
      const t = text(el);
      if (t.length < 20) return;
      const r = el.getBoundingClientRect();
      if (r.width < 250 || r.left < minX) return;   // sidebars and chrome
      const parent = el.parentElement;
      if (!parent) return;
      const entry = scored.get(parent) || { count: 0, chars: 0 };
      entry.count++;
      entry.chars += t.length;
      scored.set(parent, entry);
    });

    // The message list is the container with the most text-bearing siblings.
    let best = null, bestScore = 0;
    scored.forEach(function (v, parent) {
      if (v.count < 2) return;
      const score = v.chars * Math.min(v.count, 40);
      if (score > bestScore) { bestScore = score; best = parent; }
    });
    if (!best) return [];

    const turns = [].slice.call(best.children)
      .map(function (el) { return { el: el, text: text(el) }; })
      .filter(function (t) { return t.text.length > 0; });

    return turns.map(function (t, i) {
      return { role: classify(t.el, i, turns), text: t.text };
    });
  }

  /*
   * Which side of the conversation is this? Chat UIs almost universally give the
   * user's turn a filled bubble and let the assistant's turn run full width.
   * Where that reads ambiguously, fall back to strict alternation.
   */
  function classify(el, index, turns) {
    const filled = hasBubble(el);
    const anyFilled = turns.some(function (t) { return hasBubble(t.el); });
    if (anyFilled) return filled ? 'user' : 'assistant';

    const widths = turns.map(function (t) { return t.el.getBoundingClientRect().width; });
    const max = Math.max.apply(null, widths);
    const mine = el.getBoundingClientRect().width;
    if (max > 0 && mine < max * 0.85) return 'user';   // narrower column = user
    return index % 2 === 0 ? 'user' : 'assistant';
  }

  function hasBubble(el) {
    const probe = [el].concat([].slice.call(el.querySelectorAll('*')).slice(0, 4));
    return probe.some(function (n) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(',').map(Number);
      return parts.length < 4 || parts[3] > 0.05;      // any non-transparent fill
    });
  }

  const adapter = ADAPTERS.find(function (a) { return a.host.test(location.hostname); });
  if (!adapter) return;

  function readConversation() {
    let msgs;
    try {
      msgs = adapter.read() || [];
    } catch (err) {
      return [];
    }
    return msgs.filter(function (m) {
      return m && m.text && (m.role === 'user' || m.role === 'assistant');
    });
  }

  /* ---------------------------------------------------------------------- *
   * UI — isolated in a shadow root so the host page cannot style or read it
   * ---------------------------------------------------------------------- */

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483646;bottom:16px;right:16px;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = [
    ':host,*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',

    /*
     * The pill borrows the host page's visual language instead of fighting it:
     * a quiet light capsule that sits just above the composer. The previous
     * dark chip in the viewport corner read as bolted on, and on narrow windows
     * it collided with the page's own controls.
     */
    '.pill{display:flex;align-items:center;gap:9px;padding:4px 5px 4px 11px;border-radius:999px;',
    'background:rgba(255,255,255,.86);color:#52525b;font-size:12px;line-height:1;',
    'border:1px solid rgba(9,9,11,.08);box-shadow:0 1px 2px rgba(9,9,11,.05);',
    '-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);',
    'opacity:.72;transition:opacity .2s ease,box-shadow .2s ease}',
    '.pill:hover{opacity:1;box-shadow:0 3px 12px rgba(9,9,11,.09)}',
    '.count{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.bar{position:relative;width:34px;height:3px;border-radius:2px;background:rgba(9,9,11,.11);overflow:hidden}',
    '.fill{position:absolute;inset:0 auto 0 0;width:0;background:#22c55e;transition:width .3s ease,background .3s ease}',

    // A text button, not a filled block. Filled reads like an ad on someone else's page.
    'button{border:0;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;',
    'background:transparent;color:#4d6bfe;cursor:pointer;transition:background .15s ease}',
    'button:hover{background:rgba(77,107,254,.1)}',
    'button:disabled{opacity:.4;cursor:default;background:transparent}',
    '.tip{display:flex;align-items:center;padding:0 7px 0 1px;color:rgba(9,9,11,.2);',
    'text-decoration:none;font-size:12px;line-height:1;transition:color .16s ease}',
    '.tip:hover{color:#fb7185}',

    '.toast{margin-bottom:8px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,.96);',
    'border:1px solid rgba(9,9,11,.08);color:#3f3f46;font-size:12px;line-height:1.45;max-width:280px;',
    'box-shadow:0 6px 22px rgba(9,9,11,.1)}',

    '.panel{display:flex;flex-direction:column;gap:9px;margin-bottom:8px;padding:12px;',
    'width:min(460px,calc(100vw - 48px));border-radius:14px;background:rgba(255,255,255,.97);',
    'border:1px solid rgba(9,9,11,.09);color:#27272a;box-shadow:0 12px 38px rgba(9,9,11,.16);',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}',
    '.phead{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.ptitle{font-size:12px;opacity:.6;font-variant-numeric:tabular-nums}',
    '.preview{width:100%;height:min(46vh,340px);resize:vertical;padding:10px;border-radius:9px;',
    'border:1px solid rgba(9,9,11,.12);background:rgba(9,9,11,.03);color:#3f3f46;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5}',
    '.preview:focus{outline:1px solid rgba(77,107,254,.5)}',
    '.pfoot{display:flex;align-items:center;gap:8px}',
    'button.ghost{color:#52525b;box-shadow:inset 0 0 0 1px rgba(9,9,11,.14)}',
    'button.ghost:hover{background:rgba(9,9,11,.05)}',
    '.kofi{margin-left:auto;font-size:11px;color:#a1a1aa;text-decoration:none}',
    '.kofi:hover{color:#fb7185}',
    '.hide{display:none}',

    // Follow the page into dark mode rather than glowing white in the corner.
    '@media (prefers-color-scheme:dark){',
    '.pill{background:rgba(30,30,34,.84);color:#d4d4d8;border-color:rgba(255,255,255,.09);',
    'box-shadow:0 1px 2px rgba(0,0,0,.4)}',
    '.pill:hover{box-shadow:0 3px 14px rgba(0,0,0,.5)}',
    '.bar{background:rgba(255,255,255,.14)}',
    'button{color:#8fa4ff}',
    'button:hover{background:rgba(143,164,255,.14)}',
    '.tip{color:rgba(255,255,255,.24)}',
    '.toast{background:rgba(28,28,32,.96);border-color:rgba(255,255,255,.1);color:#e4e4e7}',
    '.panel{background:rgba(24,24,28,.97);border-color:rgba(255,255,255,.1);color:#e4e4e7;',
    'box-shadow:0 12px 38px rgba(0,0,0,.6)}',
    '.preview{background:rgba(0,0,0,.3);border-color:rgba(255,255,255,.12);color:#d4d4d8}',
    'button.ghost{color:#d4d4d8;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
    'button.ghost:hover{background:rgba(255,255,255,.07)}',
    '}'
  ].join('');

  const panel = document.createElement('div');
  panel.className = 'panel hide';

  const panelHead = document.createElement('div');
  panelHead.className = 'phead';
  const panelTitle = document.createElement('span');
  panelTitle.className = 'ptitle';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ghost';
  closeBtn.textContent = 'Close';
  panelHead.appendChild(panelTitle);
  panelHead.appendChild(closeBtn);

  // A textarea, not a div: it renders text as text (never markup), and it lets
  // you trim the handoff before you paste it.
  const preview = document.createElement('textarea');
  preview.className = 'preview';
  preview.spellcheck = false;

  const panelFoot = document.createElement('div');
  panelFoot.className = 'pfoot';
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'ghost';
  saveBtn.textContent = 'Save .md';
  const freshBtn = document.createElement('button');
  freshBtn.className = 'ghost';
  freshBtn.textContent = 'New chat';
  freshBtn.title = 'Open a fresh conversation in a new tab, then paste';
  const kofi = document.createElement('a');
  kofi.className = 'kofi';
  kofi.href = KOFI_URL;
  kofi.target = '_blank';
  kofi.rel = 'noopener noreferrer';
  kofi.textContent = 'Ko-fi';
  panelFoot.appendChild(copyBtn);
  panelFoot.appendChild(saveBtn);
  panelFoot.appendChild(freshBtn);
  panelFoot.appendChild(kofi);

  panel.appendChild(panelHead);
  panel.appendChild(preview);
  panel.appendChild(panelFoot);

  const toast = document.createElement('div');
  toast.className = 'toast hide';

  const pill = document.createElement('div');
  pill.className = 'pill';

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = '—';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.appendChild(fill);

  const button = document.createElement('button');
  button.textContent = 'Carry over';
  button.title = 'Compact this conversation and copy it, to paste into a new chat';

  // ponytail: a heart, not a "Donate" button. Visible while you use the thing,
  // low-contrast enough to ignore forever. Warms on hover so it reads clickable.
  const tip = document.createElement('a');
  tip.className = 'tip';
  tip.href = KOFI_URL;
  tip.target = '_blank';
  tip.rel = 'noopener noreferrer';
  tip.textContent = '♥';
  tip.title = 'Carryover is free. Buy me a coffee if it helped.';

  pill.appendChild(count);
  pill.appendChild(bar);
  pill.appendChild(button);
  pill.appendChild(tip);

  const wrap = document.createElement('div');
  wrap.appendChild(panel);
  wrap.appendChild(toast);
  wrap.appendChild(pill);
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.documentElement.appendChild(host);

  const NUDGE_AT = 80;
  let nudged = false;
  let toastTimer;
  function say(message) {
    // textContent, never innerHTML — page content must never become markup here.
    toast.textContent = message;
    toast.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.add('hide'); }, 4200);
  }

  function refresh() {
    const msgs = readConversation();
    if (!msgs.length) {
      count.textContent = '—';
      fill.style.width = '0';
      button.disabled = true;
      return;
    }
    button.disabled = false;
    const tokens = msgs.reduce(function (n, m) { return n + E.estimateTokens(m.text); }, 0);
    const pct = Math.min(100, Math.round((tokens / adapter.ceiling) * 100));
    count.textContent = '~' + E.formatTokens(tokens) + ' · ' + pct + '%';
    fill.style.width = Math.max(2, pct) + '%';
    fill.style.background = pct >= 80 ? '#ef4444' : pct >= 55 ? '#f59e0b' : '#22c55e';

    /*
     * Say something once, at the point where it is still cheap to act. A gauge
     * only helps if you happen to look at it, and nobody watches a progress bar
     * while they are working. Below the threshold the flag resets, so a fresh
     * conversation gets its own single nudge and this never becomes nagging.
     *
     * Deliberately in-memory: chrome.storage would mean declaring the "storage"
     * permission, and the whole pitch is that this extension declares none.
     */
    if (pct >= NUDGE_AT && !nudged) {
      nudged = true;
      say('This chat is ' + pct + '% full. Carry it over now and the next one starts clean.');
    } else if (pct < NUDGE_AT - 10) {
      nudged = false;
    }
  }

  /*
   * Copy without a clipboard permission: the write has to happen inside the
   * user's own click. `navigator.clipboard` is the good path; selecting the
   * textarea and running execCommand is the fallback for the cases where it is
   * refused (an unfocused page, a locked-down profile). Nothing is lost either
   * way — the text is on screen and selectable.
   */
  function copyDoc(doc) {
    const done = function () {
      say('Copied ~' + E.formatTokens(E.estimateTokens(doc)) +
          ' tokens. Open a new chat and paste.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(doc).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      preview.focus();
      preview.select();
      const ok = document.execCommand && document.execCommand('copy');
      if (ok) done();
      else say('Could not reach the clipboard — the text is selected, press Ctrl+C.');
    }
  }

  function openPanel() {
    const msgs = readConversation();
    const doc = E.compact(msgs, { source: adapter.name });
    if (!doc) { say('Nothing to carry over yet.'); return; }
    preview.value = doc;
    panelTitle.textContent = msgs.length + ' messages · ~' +
      E.formatTokens(E.estimateTokens(doc)) + ' tokens in the handoff';
    panel.classList.remove('hide');
    copyDoc(doc);
  }

  button.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', function () { panel.classList.add('hide'); });
  copyBtn.addEventListener('click', function () { copyDoc(preview.value); });

  // Saving uses a blob URL built in the page — no downloads permission, and the
  // file never leaves the machine.
  /*
   * The last step of the job was always manual: copy, then go find a new chat.
   * Opening it in a new tab keeps this one intact, so if the paste goes wrong
   * the original conversation is still sitting there.
   */
  freshBtn.addEventListener('click', function () {
    if (!adapter.fresh) return;
    open(adapter.fresh, '_blank', 'noopener');
    say('Opened a new chat in the next tab. Paste there.');
  });

  saveBtn.addEventListener('click', function () {

    const url = URL.createObjectURL(new Blob([preview.value], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carryover-' + adapter.id + '.md';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  });

addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.classList.contains('hide')) {
      panel.classList.add('hide');
      return;
    }
    // Alt+C, chosen because it needs no manifest "commands" entry and so no
    // extra permission. Ignored while a modifier combo the page owns is held.
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      openPanel();
    }
  });

  let debounce;
  const observer = new MutationObserver(function () {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 900);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  refresh();
})();
