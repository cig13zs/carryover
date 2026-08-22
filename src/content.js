/* Reads the conversation from the page and builds a handoff doc. No network. */
(function () {
  'use strict';

  const E = globalThis.CarryoverEngine;
  if (!E) return;

  const KOFI_URL = 'https://ko-fi.com/jju1s';

  // sessionStorage survives the nav to a new chat and needs no permission.
  const HANDOFF_KEY = 'carryover:pending';
  const THEME_KEY = 'carryover:theme';

  // Whitelisted: this value comes back from localStorage, which the host page
  // can write, and ends up in a DOM attribute.
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };

  // Must stay above every function that reads it. A `let` in the temporal dead
  // zone throws, and that kills the whole script before any UI exists.
  let theme = 'auto';
  let current = [];

  function readTheme() {
    let v = null;
    try { v = localStorage.getItem(THEME_KEY); } catch (err) { return 'auto'; }
    return THEMES.indexOf(v) >= 0 ? v : 'auto';
  }

  /* Carryover is designed around free-tier sessions. These are conservative
     planning budgets, not advertised service limits: the page never reveals
     the user's model, plan or actual context window. The bar is only a hint;
     the estimated token count is the useful number. */
  const ADAPTERS = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      host: /(^|\.)chatgpt\.com$/,
      planningBudget: 32000,
      fresh: 'https://chatgpt.com/',
      // Monochrome to match the rest of the UI.
      accent: '#0d0d0d',
      accentDark: '#ececf1',
      // Don't swap this for [data-message-author-role]. That one still exists
      // but only lands on some turns, so you silently get half the chat.
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
      planningBudget: 128000,
      fresh: 'https://chat.deepseek.com/',
      // Same blue as the DeepThink/Search chips.
      accent: '#4d6bfe',
      accentDark: '#8fa4ff',
      read: readStructural
    },
    {
      id: 'grok',
      name: 'Grok',
      host: /(^|\.)grok\.com$/,
      planningBudget: 128000,
      fresh: 'https://grok.com/',
      accent: '#111111',
      accentDark: '#e8e8e8',
      read: readStructural
    }
  ];

  function text(el) {
    return (el.innerText || el.textContent || '').trim();
  }

  // innerText forces a layout. On a long chat, calling it on every div on the
  // page froze the tab for most of a second on each pass. textContent is free
  // and is never shorter than innerText, so it is safe as a prefilter.
  function tooShort(el, min) {
    return (el.textContent || '').length < min;
  }

  // innerText: textContent drags in screen-reader labels like "You said:".
  // An image-only turn still counts, so the ordering stays right.
  function turnText(el) {
    const t = text(el);
    if (t) return t;
    return el.querySelector('img') ? '[image attachment, not carried over]' : '';
  }

  /* For sites with build-hashed class names (DeepSeek ships things like
     `_3098d02`, which change every deploy). Finds the container holding a stack
     of sibling text blocks in the main column instead of naming a selector. */
  function readStructural() {
    const minX = innerWidth * 0.25;
    const scored = new Map();

    // Every text-bearing element votes for its parent.
    document.querySelectorAll('div, article, section').forEach(function (el) {
      if (tooShort(el, 20)) return;
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

    // Winner = most text across the most siblings.
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

  // Most chat UIs put the user in a filled bubble and let the assistant run
  // full width. Falls back to alternation when that is ambiguous.
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

  /* A new-chat screen is not empty: it has greeting text, prompt suggestions,
     mode chips and a disclaimer. The structural reader scores all of that and
     reports a conversation where nothing has been said.

     Chips and placeholders are short and roughly equal in length. A real
     exchange always has at least one long turn, so require one. */
  const MIN_TURNS = 2;
  const MIN_TOKENS = 120;
  const MIN_LONGEST = 200;

  /* These sites are single-page apps, so settings, the model gallery, project
     lists and shared-link pages all run this script without a reload. The
     structural reader happily scored those as conversations and the pill turned
     up on pages you can't chat on.

     Every page you can actually talk on has a message box, and none of the
     others do. That is the difference, not the route name, which changes
     whenever they ship. findComposer already looks for it by shape. */
  function isChatPage() {
    return !!findComposer();
  }

  function readConversation() {
    if (!isChatPage()) return [];
    let msgs;
    try {
      msgs = adapter.read() || [];
    } catch (err) {
      return [];
    }
    const clean = msgs.filter(function (m) {
      return m && m.text && (m.role === 'user' || m.role === 'assistant');
    });
    if (clean.length < MIN_TURNS) return [];
    const longest = clean.reduce(function (n, m) { return Math.max(n, m.text.length); }, 0);
    if (longest < MIN_LONGEST) return [];
    const total = clean.reduce(function (n, m) { return n + E.estimateTokens(m.text); }, 0);
    return total < MIN_TOKENS ? [] : clean;
  }

  /* UI. Closed shadow root so the host page can't style or read it. */

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483646;bottom:16px;right:16px;';
  const shadow = host.attachShadow({ mode: 'closed' });

  // Dark rules are written once and emitted twice, under [data-theme="dark"]
  // and inside a prefers-color-scheme query, so the two can't drift.
  const BASE = [
    ':host,*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.pill{display:flex;align-items:center;gap:9px;padding:4px 5px 4px 11px;border-radius:999px;',
    'background:rgba(255,255,255,.86);color:#52525b;font-size:12px;line-height:1;',
    'border:1px solid rgba(9,9,11,.08);box-shadow:0 1px 2px rgba(9,9,11,.05);',
    '-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);',
    'opacity:.72;transition:opacity .2s ease,box-shadow .2s ease}',
    '.pill:hover{opacity:1;box-shadow:0 3px 12px rgba(9,9,11,.09)}',
    '.count{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.bar{position:relative;width:34px;height:3px;border-radius:2px;background:rgba(9,9,11,.11);overflow:hidden}',
    '.fill{position:absolute;inset:0 auto 0 0;width:0;background:#22c55e;transition:width .3s ease,background .3s ease}',
    'button{border:0;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;',
    'background:transparent;color:var(--accent);cursor:pointer;transition:background .15s ease}',
    'button:hover{background:color-mix(in srgb,var(--accent) 11%,transparent)}',
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
    '.phead{display:flex;align-items:center;gap:10px}',
    '.ptitle{font-size:12px;opacity:.6;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.range{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:11px;opacity:.65}',
    '.range input{width:44px;padding:3px 4px;border-radius:6px;font:inherit;text-align:center;',
    'border:1px solid rgba(9,9,11,.16);background:transparent;color:inherit;',
    'font-variant-numeric:tabular-nums;-moz-appearance:textfield}',
    '.range input::-webkit-outer-spin-button,.range input::-webkit-inner-spin-button{',
    '-webkit-appearance:none;margin:0}',
    '.range input:focus{outline:1px solid var(--accent);opacity:1}',
    '.preview{width:100%;height:min(46vh,340px);resize:vertical;padding:10px;border-radius:9px;',
    'border:1px solid rgba(9,9,11,.12);background:rgba(9,9,11,.03);color:#3f3f46;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5}',
    '.preview:focus{outline:1px solid var(--accent)}',
    '.pfoot{display:flex;align-items:center;gap:8px}',
    'button.ghost{color:inherit;opacity:.8;box-shadow:inset 0 0 0 1px rgba(9,9,11,.14)}',
    'button.ghost:hover{background:rgba(9,9,11,.05);opacity:1}',
    '.kofi{margin-left:auto;font-size:11px;color:#a1a1aa;text-decoration:none}',
    '.kofi:hover{color:#fb7185}',
    '.hide{display:none}'
  ].join('');

  const DARK = [
    '.pill{background:rgba(30,30,34,.84);color:#d4d4d8;border-color:rgba(255,255,255,.09);box-shadow:0 1px 2px rgba(0,0,0,.4)}',
    '.pill:hover{box-shadow:0 3px 14px rgba(0,0,0,.5)}',
    '.bar{background:rgba(255,255,255,.14)}',
    'button{color:var(--accent-dark)}',
    'button:hover{background:color-mix(in srgb,var(--accent-dark) 15%,transparent)}',
    '.tip{color:rgba(255,255,255,.24)}',
    '.toast{background:rgba(28,28,32,.96);border-color:rgba(255,255,255,.1);color:#e4e4e7}',
    '.panel{background:rgba(24,24,28,.97);border-color:rgba(255,255,255,.1);color:#e4e4e7;box-shadow:0 12px 38px rgba(0,0,0,.6)}',
    '.preview{background:rgba(0,0,0,.3);border-color:rgba(255,255,255,.12);color:#d4d4d8}',
    '.range input{border-color:rgba(255,255,255,.18)}',
    'button.ghost{box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
    'button.ghost:hover{background:rgba(255,255,255,.07)}'
  ];

  function scoped(prefix) {
    return DARK.map(function (rule) { return prefix + ' ' + rule; }).join('');
  }

  const style = document.createElement('style');
  style.textContent = BASE +
    scoped('[data-theme="dark"]') +
    '@media (prefers-color-scheme:dark){' + scoped('[data-theme="auto"]') + '}';

  const panel = document.createElement('div');
  panel.className = 'panel hide';

  const panelHead = document.createElement('div');
  panelHead.className = 'phead';
  const panelTitle = document.createElement('span');
  panelTitle.className = 'ptitle';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ghost';
  closeBtn.textContent = 'Close';

  // Whole conversation by default; the inputs narrow it.
  const range = document.createElement('div');
  range.className = 'range';
  const fromIn = document.createElement('input');
  const toIn = document.createElement('input');
  [fromIn, toIn].forEach(function (el) {
    el.type = 'number';
    el.min = '1';
    el.title = 'Which messages to include';
  });
  const dash = document.createElement('span');
  dash.textContent = 'to';
  const ofN = document.createElement('span');
  range.appendChild(fromIn);
  range.appendChild(dash);
  range.appendChild(toIn);
  range.appendChild(ofN);

  panelHead.appendChild(panelTitle);
  panelHead.appendChild(range);
  panelHead.appendChild(closeBtn);

  // textarea so the preview is editable and can never render as markup.
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
  const themeBtn = document.createElement('button');
  themeBtn.className = 'ghost';
  themeBtn.title = 'Theme: follow the system, or force light or dark';
  freshBtn.title = 'Go to a fresh conversation and drop this in the box';
  const kofi = document.createElement('a');
  kofi.className = 'kofi';
  kofi.href = KOFI_URL;
  kofi.target = '_blank';
  kofi.rel = 'noopener noreferrer';
  kofi.textContent = 'Ko-fi';
  panelFoot.appendChild(copyBtn);
  panelFoot.appendChild(saveBtn);
  panelFoot.appendChild(freshBtn);
  panelFoot.appendChild(themeBtn);
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
  count.textContent = '...';
  count.title = 'Rough share of a conservative free-plan planning budget, not your account limit';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.appendChild(fill);

  const button = document.createElement('button');
  button.textContent = 'Carry over';
  button.title = 'Compact this conversation and copy it, to paste into a new chat';

  // Low-contrast on purpose. Warms on hover so it still reads as clickable.
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
  wrap.style.setProperty('--accent', adapter.accent || '#4d6bfe');
  wrap.style.setProperty('--accent-dark', adapter.accentDark || '#8fa4ff');
  theme = readTheme();
  applyTheme();
  document.documentElement.appendChild(host);

  const NUDGE_AT = 80;
  let nudged = false;

  function applyTheme() {
    wrap.setAttribute('data-theme', theme);          // already whitelisted
    themeBtn.textContent = THEME_LABEL[theme];
  }

  themeBtn.addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
    applyTheme();
  });

  let toastTimer;
  function say(message) {
    // The host is hidden whenever there is nothing to carry over, and Alt+C
    // still works there, so a toast written into a hidden host was invisible.
    host.style.display = '';
    // textContent, never innerHTML. Page text must not become markup.
    toast.textContent = message;
    toast.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add('hide');
      if (panel.classList.contains('hide') && !current.length) host.style.display = 'none';
    }, 4200);
  }

  function refresh() {
    const msgs = readConversation();
    if (!msgs.length) {
      // An open panel holds text the user may have edited. A reader that
      // momentarily comes back empty mid-render must not throw that away.
      if (!panel.classList.contains('hide')) return;
      // No conversation yet. Stay out of the way instead of sitting there
      // greyed out on the new-chat screen.
      host.style.display = 'none';
      return;
    }
    host.style.display = '';
    button.disabled = false;
    const tokens = msgs.reduce(function (n, m) { return n + E.estimateTokens(m.text); }, 0);
    const pct = Math.min(100, Math.round((tokens / adapter.planningBudget) * 100));
    count.textContent = '~' + E.formatTokens(tokens) + ' · ' + pct + '%';
    fill.style.width = Math.max(2, pct) + '%';
    fill.style.background = pct >= 80 ? '#ef4444' : pct >= 55 ? '#f59e0b' : '#22c55e';

    /* Nobody watches a progress bar, so nudge once when it still helps. The
       flag resets below the threshold, so a new chat gets its own nudge.
       In-memory: chrome.storage would mean declaring a permission. */
    if (pct >= NUDGE_AT && !nudged) {
      nudged = true;
      say('This free-plan estimate is at ' + pct + '%. Carry it over now and the next chat starts clean.');
    } else if (pct < NUDGE_AT - 10) {
      nudged = false;
    }
  }

  /* Copying without a clipboard permission only works inside the user's own
     click. execCommand is the fallback when navigator.clipboard is refused,
     which happens on an unfocused page or a locked-down profile. */
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
      else say('Could not reach the clipboard. The text is selected, press Ctrl+C.');
    }
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, isFinite(n) ? n : lo));
  }

  // Range selection is just a slice before the engine call, so there is no
  // separate code path for it.
  function render() {
    const n = current.length;
    const from = clamp(parseInt(fromIn.value, 10), 1, n);
    const to = clamp(parseInt(toIn.value, 10), from, n);
    if (String(from) !== fromIn.value) fromIn.value = from;
    if (String(to) !== toIn.value) toIn.value = to;

    const doc = E.compact(current.slice(from - 1, to), { source: adapter.name }) || '';
    preview.value = doc;
    const picked = to - from + 1;
    panelTitle.textContent = (picked === n ? 'All ' + n : picked + ' of ' + n) +
      ' messages · ~' + E.formatTokens(E.estimateTokens(doc));
    ofN.textContent = 'of ' + n;
    return doc;
  }

  function openPanel() {
    current = readConversation();
    if (!current.length) { say('Nothing to carry over yet.'); return; }
    fromIn.value = '1';
    toIn.value = String(current.length);
    fromIn.max = toIn.max = String(current.length);
    const doc = render();
    panel.classList.remove('hide');
    copyDoc(doc);
  }

  [fromIn, toIn].forEach(function (el) {
    el.addEventListener('input', render);
  });

  button.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', function () { panel.classList.add('hide'); });
  copyBtn.addEventListener('click', function () { copyDoc(preview.value); });

  // Blob URL built in the page, so no downloads permission is needed.
  freshBtn.addEventListener('click', function () {
    if (!adapter.fresh) return;
    let stashed = false;
    try {
      sessionStorage.setItem(HANDOFF_KEY, preview.value);
      stashed = true;
    } catch (err) {
      // Private mode or storage full. The text is already on the clipboard.
    }
    if (!stashed) say('Could not hand it over automatically. It is on your clipboard, paste it.');
    location.href = adapter.fresh;
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
    // Alt+C needs no "commands" entry in the manifest, so no extra permission.
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

  /* Landing in the new chat. */

  // Found by shape, not class name: the widest text entry in the lower part of
  // the viewport. Same reason as the message reader.
  function findComposer() {
    const nodes = document.querySelectorAll('textarea,[contenteditable="true"]');
    let best = null, bestW = 0;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 16) continue;
      if (r.top < innerHeight * 0.35) continue;
      if (r.width > bestW) { bestW = r.width; best = el; }
    }
    return best;
  }

  /* Setting .value does nothing on a React-controlled input: React keeps its
     own copy and overwrites it on the next render. The native prototype setter
     plus a bubbling input event is what makes it stick. */
  function insertText(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } catch (err) {
        el.textContent = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // Dropped in the box and left there. Sending is up to you.
  function restorePending() {
    let doc = null;
    try { doc = sessionStorage.getItem(HANDOFF_KEY); } catch (err) { return; }
    if (!doc) return;
    try { sessionStorage.removeItem(HANDOFF_KEY); } catch (err) {}

    let tries = 0;
    (function attempt() {
      const el = findComposer();
      if (el) {
        insertText(el, doc);
        say('Handoff dropped into the box. Read it, then send when you are ready.');
        return;
      }
      if (tries++ < 40) setTimeout(attempt, 250);   // composer mounts late
      else say('New chat is ready but the box was not found. Paste from your clipboard.');
    })();
  }

  refresh();
  restorePending();
})();
