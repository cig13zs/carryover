/*
 * Carryover — pure text logic. No DOM, no network, no dependencies.
 * Shared by the extension (content.js) and the tests (engine.test.js).
 */
(function (root) {
  'use strict';

  // ponytail: character heuristic, not a real tokenizer. Lands within ~15% on
  // mixed English/CJK. Bundling a multi-megabyte BPE table to win a few percent
  // on a number we display rounded ("~38k") is not worth the download.
  function estimateTokens(text) {
    if (!text) return 0;
    const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ]/g) || []).length;
    return Math.round(cjk * 0.7 + (text.length - cjk) / 3.8);
  }

  function formatTokens(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  // Lines that carry a decision, a constraint, or a correction — the things you
  // lose when you open a new chat and the model starts suggesting the approach
  // you already rejected two hours ago.
  const DECISION_RE = new RegExp([
    '\\b(?:',
    'decided?|instead of|rather than|going with|switch(?:ed|ing)? to|',
    "don'?t|do not|never|always|must|should not|avoid|",
    'the (?:problem|issue|bug) (?:was|is)|root cause|turned out|fixed by|',
    'requires?|needs? to be|make sure|note that|important:|constraint',
    ')\\b'
  ].join(''), 'i');

  const NOISE_RE = /^(?:ok(?:ay)?|thanks?|thank you|got it|sure|yes|no|nice|cool|perfect|great)\b[\s.!]*$/i;

  function stripCode(text) {
    return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]+`/g, ' ');
  }

  function extractCodeBlocks(messages) {
    const seen = new Set();
    const blocks = [];
    messages.forEach((m, i) => {
      const re = /```([\w+-]*)\n?([\s\S]*?)```/g;
      let match;
      while ((match = re.exec(m.text)) !== null) {
        const body = match[2].trim();
        if (body.length < 20) continue;          // inline noise, not an artifact
        const key = body.replace(/\s+/g, '');
        if (seen.has(key)) continue;             // same block quoted repeatedly
        seen.add(key);
        blocks.push({ lang: match[1] || '', body: body, at: i });
      }
    });
    return blocks;
  }

  function extractDecisions(messages, limit) {
    const seen = new Set();
    const out = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const lines = stripCode(messages[i].text).split(/\n+|(?<=[.!?])\s+/);
      for (const raw of lines) {
        const line = raw.trim().replace(/^[-*>\d.)\s]+/, '');
        if (line.length < 25 || line.length > 300) continue;
        if (!DECISION_RE.test(line)) continue;
        const key = line.toLowerCase().replace(/\W+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
        if (out.length >= limit) return out.reverse();
      }
    }
    return out.reverse();
  }

  function firstRealUserMessage(messages) {
    for (const m of messages) {
      if (m.role !== 'user') continue;
      const t = stripCode(m.text).trim();
      if (t.length >= 15 && !NOISE_RE.test(t)) return t;
    }
    return '';
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, '') + '\n…[trimmed]';
  }

  function label(role) {
    return role === 'user' ? 'You' : 'Assistant';
  }

  /*
   * Build a handoff document from a conversation.
   * Everything here is mechanical extraction — no model call, so nothing can be
   * invented that was not literally in the conversation.
   */
  function compact(messages, opts) {
    opts = opts || {};
    const keepLast = opts.keepLast || 4;
    const codeBudget = opts.codeBudget || 6000;
    const tailBudget = opts.tailBudget || 5000;
    const source = opts.source || 'chat';

    const clean = (messages || []).filter(function (m) {
      return m && m.text && m.text.trim() && (m.role === 'user' || m.role === 'assistant');
    });
    if (!clean.length) return null;

    const tail = clean.slice(-keepLast);
    const head = clean.slice(0, Math.max(0, clean.length - keepLast));
    const total = clean.reduce(function (n, m) { return n + estimateTokens(m.text); }, 0);

    const parts = [];
    parts.push('# Context handoff');
    parts.push('');
    parts.push('Source: ' + source + ' · ' + clean.length + ' messages · ~' +
               formatTokens(total) + ' tokens (estimated)');
    parts.push('');
    parts.push('This is a compacted summary of an earlier conversation, assembled ' +
               'mechanically from its text. Pick up where it left off.');

    const goal = firstRealUserMessage(clean);
    if (goal) {
      parts.push('');
      parts.push('## What we were working on');
      parts.push('');
      parts.push(truncate(goal, 700));
    }

    // Decisions are drawn from the earlier messages only — the tail is included
    // verbatim below, so repeating it here would just burn context twice.
    const decisions = extractDecisions(head.length ? head : clean, 20);
    if (decisions.length) {
      parts.push('');
      parts.push('## Decisions and constraints');
      parts.push('');
      decisions.forEach(function (d) { parts.push('- ' + d); });
    }

    // Newest code first: later versions supersede earlier ones, so when the
    // budget runs out it is the stale drafts that get dropped.
    const blocks = extractCodeBlocks(clean).reverse();
    const kept = [];
    let used = 0;
    for (const b of blocks) {
      if (used + b.body.length > codeBudget) continue;
      used += b.body.length;
      kept.push(b);
      if (kept.length >= 8) break;
    }
    if (kept.length) {
      parts.push('');
      parts.push('## Code and artifacts');
      kept.reverse().forEach(function (b) {
        parts.push('');
        parts.push('```' + b.lang);
        parts.push(b.body);
        parts.push('```');
      });
    }

    if (tail.length) {
      parts.push('');
      parts.push('## Where we left off (verbatim)');
      const per = Math.floor(tailBudget / tail.length);
      tail.forEach(function (m) {
        parts.push('');
        parts.push('**' + label(m.role) + ':** ' + truncate(m.text.trim(), per));
      });
    }

    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push('Continue from here.');

    return parts.join('\n');
  }

  root.CarryoverEngine = {
    estimateTokens: estimateTokens,
    formatTokens: formatTokens,
    extractCodeBlocks: extractCodeBlocks,
    extractDecisions: extractDecisions,
    compact: compact
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
