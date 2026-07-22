# Carryover

See how full an AI chat is getting, then carry its context into a new one.

**The manifest has no `permissions` key.** Not a reduced set — none. It cannot
read your other tabs, your history, your cookies, or anything outside the one
chat page it runs on. Every other tool in this category needs broad host access
to work, because they move context *between* different AI sites. This one
doesn't, so it doesn't ask.

Long chats get slow, expensive, and forgetful. Starting a fresh one costs you
everything the model learned about your problem. Carryover reads the conversation
already on your screen, shows you roughly how big it has grown, and — on one click —
builds a compact handoff document you can paste into a new chat.

**It never talks to a server. There is nothing to sign up for.**

Works on ChatGPT, DeepSeek, and Grok. One build per site.

**[cig13zs.github.io/carryover](https://cig13zs.github.io/carryover/)**

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/carryover/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/carryover/actions)

---

## How it works

A small pill sits in the corner of the chat page:

```
~38.2k · 39%   [ Carry over ]
```

- **`~38.2k`** — estimated tokens in the conversation so far
- **`39%`** — how far along a conservative context budget for that site
- **`Carry over`** — compacts the conversation, copies it, and shows you what it copied

Open a new chat, paste, keep working.

The panel that opens is an editable text box, not a preview image. Delete the
half of the handoff you don't need before you paste it, or hit **Save .md** to
keep it as a file. Escape closes the panel. Nothing is sent anywhere at any
point in this.

The pill matches the page it sits on, light or dark, and stays out of the way at
about 70% opacity until you hover it. **Alt+C** does the same thing as clicking
it. At 80% full it says so once, then shuts up, because a gauge only helps if you
happen to be looking at it.

**New chat** starts a fresh conversation in the same tab and drops the handoff
straight into the message box, so the whole loop is one click. Nothing is ever
sent for you: the text is placed in the box and left there for you to read and
send yourself.

By default the handoff covers the whole conversation. The two small boxes in the
panel header narrow it, so you can take messages 1 to 6 and leave the rest behind
when only the early part mattered.

Clicking the extension icon in the toolbar opens a small panel with links to the
project and the tip jar.

The handoff document contains what you actually lose when you start over:

| Section | What goes in it |
|---|---|
| What we were working on | your first real message |
| Decisions and constraints | lines stating a choice, a rule, or a correction |
| Code and artifacts | code blocks, deduplicated, newest kept first |
| Where we left off | the last few turns, verbatim |

## The summary is extracted, not generated

There is no model call. Carryover does not summarize your chat with an AI — it
pulls out the lines that are already there, using plain pattern matching.

That matters for two reasons: it works instantly and offline, and **it cannot
invent anything**. Every line in the handoff is a line you or the model actually
wrote. A generated summary can quietly hallucinate a decision you never made and
carry that fiction into your next chat. This can't.

The tradeoff is that it's blunt. It keeps more than a human would and phrases
nothing gracefully. You see the whole document before you paste it.

## Security

- **No network requests.** No server, no API key, no analytics, no telemetry. The
  extension cannot leak your conversations because it never opens a connection.
- **No declared permissions.** Check `manifest.json` — there is no `permissions`
  key and no `host_permissions` key. It runs only on the one chat domain it was
  built for, and can do nothing else.
- **No remote code, no dependencies.** Two files, both readable in a few minutes.
  Nothing to supply-chain.
- **Rendered with `textContent`, never `innerHTML`** — your chat text can never
  become markup inside the extension's own UI.
- **UI lives in a closed shadow root**, so the host page can neither read nor
  restyle it.
- **Clipboard writes happen inside your click** and nowhere else.
- **Two things are stored locally, nothing else.** The pending handoff goes into
  `sessionStorage` for the moment it takes to navigate to a new chat, and is
  deleted as soon as it is read. Your theme choice goes into `localStorage` as
  one of three words. Neither uses the `storage` permission, and neither leaves
  the browser. Values read back from storage are checked against a whitelist
  before use, because storage on a chat site is writable by that site.

## Legal

- Read-only. It never sends messages, clicks buttons, automates your account, or
  works around any rate limit. It reads what is already rendered in your browser,
  the same way a reader-mode or ad-blocking extension does.
- Not affiliated with, endorsed by, or connected to OpenAI, DeepSeek, or xAI. No logos
  or brand assets are used; the product names appear only to describe which site
  each build works with.
- Collects no user data, so there is nothing to disclose and nothing to breach.
- Written from scratch. No code was taken from any other usage-tracking extension.

## Known limits

These are real, and listing them here is cheaper than a one-star review:

- **The token number is an estimate**, from a character heuristic rather than the
  real tokenizer. Expect it to be within ~15%. It's a fuel gauge, not a receipt.
- **The percentage is measured against a fixed assumed budget** per site, because
  the page never says which model or plan you're on. Treat it as a hint.
- **Images don't carry over.** A turn that was an uploaded screenshot is marked
  `[image attachment — not carried over]` so you know something visual is missing.
- **Long chats may be partly virtualized** by the host page — if messages far up
  the history aren't in the DOM, they can't be counted or carried.

## Install

Grab a zip from [Releases](https://github.com/cig13zs/carryover/releases), unzip
it, then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → pick the folder.

Or build it yourself, which takes about a second and needs nothing installed but
Node:

```bash
node build.js       # writes dist/chatgpt, dist/deepseek, dist/grok
node engine.test.js # the engine's self-check
```

## Development

```
src/engine.js      pure text logic — token estimate, extraction, compaction
src/content.js     site adapters, the pill UI, clipboard
build.js           emits dist/<target>/ for each store listing
engine.test.js     node engine.test.js
```

One codebase, one build per store listing. Separate listings keep a breakage on
one site from dragging down the reviews of the other.

**Adapters are verified against the live sites, with the date recorded in the
code.** ChatGPT keys off `data-turn`, not `data-message-author-role` — the latter
still exists but is now emitted on only some turns, so it silently returns half
the conversation. Sites whose class names are build-hashed (DeepSeek ships classes
like `_3098d02`, regenerated on every deploy) are read structurally instead, by
finding the container holding the stack of message siblings, so a redesign doesn't
break them.

---

If this saved you some retyping, you can
[buy me a coffee on Ko-fi](https://ko-fi.com/jju1s). It's free either way,
and it stays free. There is no paid tier waiting behind this.

MIT licensed. Do what you like with it.
