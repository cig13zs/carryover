# Carryover

See how full an AI chat is getting, then carry its context into a new one.

Long chats get slow and forgetful, and starting a fresh one throws away
everything the model worked out about your problem. Carryover reads the
conversation already on your screen, shows you roughly how big it has grown, and
builds a compact handoff document you can paste into a new chat.

The manifest has no `permissions` key at all. It can't read your other tabs,
your history or your cookies. Most tools in this category need broad host access
because they move context between different AI sites. This one doesn't do that,
so it doesn't ask for it.

Works on ChatGPT, DeepSeek and Grok. One build per site.

**[cig13zs.github.io/carryover](https://cig13zs.github.io/carryover/)**

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/carryover/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/carryover/actions)

## How it works

A small pill sits in the corner of the chat page once there's a conversation to
measure:

```
~38.2k · 39%   [ Carry over ]
```

`~38.2k` is the estimated token count, `39%` is how far along a conservative
context budget for that site, and the button compacts everything, copies it, and
shows you what it copied. Open a new chat, paste, keep working.

The panel that opens is an editable text box. Delete the half of the handoff you
don't need before pasting, or hit Save .md to keep it as a file. Escape closes
it. Alt+C opens it.

The pill follows the page theme and sits at about 70% opacity until you hover
it. At 80% full it says so once and then stays quiet.

**New chat** starts a fresh conversation in the same tab and drops the handoff
into the message box for you. It never presses send. The text is placed there
and left alone so you read it first.

By default the handoff covers everything. The two boxes in the panel header
narrow the range, so you can take messages 1 to 6 and leave the rest when only
the early part mattered.

What ends up in the document:

| Section | Contents |
|---|---|
| What we were working on | your first real message |
| Decisions and constraints | lines stating a choice, a rule, or a correction |
| Code and artifacts | code blocks, deduplicated, newest kept first |
| Where we left off | the last few turns, verbatim |

## The summary is extracted, not generated

There's no model call anywhere in this. Carryover pulls out lines that are
already in the conversation using plain pattern matching.

Two things follow from that. It runs instantly and offline, and it can't invent
anything. Every line in the handoff is a line you or the model actually wrote. A
generated summary can hallucinate a decision you never made and carry that into
your next chat.

The cost is that it's blunt. It keeps more than a person would and phrases
nothing gracefully. You see the whole document before you paste it.

## Security

No network requests. No server, no API key, no analytics. The extension can't
leak your conversations because it never opens a connection.

No declared permissions. Check `manifest.json`: there's no `permissions` key and
no `host_permissions` key. It runs on the one chat domain it was built for.

No remote code and no dependencies. Two files, both readable in a few minutes.

Chat text is rendered with `textContent`, never `innerHTML`, so it can't become
markup inside the extension's own UI. The UI lives in a closed shadow root, so
the host page can't read or restyle it. Clipboard writes happen inside your own
click and nowhere else.

Two things get stored locally. The pending handoff goes into `sessionStorage`
for the moment it takes to navigate to a new chat, then gets deleted as soon as
it's read. Your theme choice goes into `localStorage` as one of three words.
Neither needs the `storage` permission. Values read back from storage are
checked against a whitelist first, since storage on a chat site is writable by
that site.

## Legal

Read-only. It never sends messages, clicks buttons, automates your account or
works around a rate limit. It reads what's already rendered in your browser, the
same way a reader-mode extension does.

Not affiliated with or endorsed by OpenAI, DeepSeek or xAI. No logos or brand
assets are used. The product names appear only to say which site each build
works with.

Collects no user data, so there's nothing to disclose.

## Known limits

The token number is an estimate from a character heuristic rather than the real
tokenizer. Expect it within about 15%.

The percentage runs against a fixed assumed budget per site, because the page
never says which model or plan you're on. Treat it as a hint.

Images don't carry over. A turn that was an uploaded screenshot gets marked
`[image attachment, not carried over]` so you can see something is missing.

Long chats may be partly virtualized by the host page. If messages far up the
history aren't in the DOM, they can't be counted or carried.

## Install

Grab a zip from [Releases](https://github.com/cig13zs/carryover/releases), unzip
it, then in Chrome: `chrome://extensions` → enable Developer mode → Load
unpacked → pick the folder.

Or build it, which needs nothing but Node:

```bash
node build.js        # writes dist/chatgpt, dist/deepseek, dist/grok
node engine.test.js  # engine self-check
node boot.test.js    # loads content.js against a stub DOM
```

## Development

```
src/engine.js      token estimate, extraction, compaction
src/content.js     site adapters, pill UI, clipboard
build.js           emits dist/<target>/ per store listing
engine.test.js     node engine.test.js
boot.test.js       node boot.test.js
```

One codebase, one build per store listing, so a breakage on one site doesn't
drag down the reviews of another.

ChatGPT keys off `data-turn`. Don't swap that for `data-message-author-role`:
the old attribute still exists but only lands on some turns now, so it silently
returns half the conversation. Sites with build-hashed class names (DeepSeek
ships things like `_3098d02`, regenerated every deploy) get read structurally
instead, by finding the container holding the stack of message siblings.

The pill only appears once a real exchange exists. A new-chat screen is full of
greeting text, prompt suggestions and mode chips, and the structural reader has
no way to know those aren't messages, so `readConversation()` requires at least
one long turn before anything mounts.

## More tools

- [Invisibles](https://github.com/cig13zs/invisibles), reveal and strip hidden Unicode from text
- [Rinse](https://github.com/cig13zs/rinse), see the GPS in a photo and wash it off
- [Return Google Cache](https://github.com/cig13zs/return-google-cache), put the Cached link back on Google results
- [Return 100 Results](https://github.com/cig13zs/return-100-results), browse ~100 Google results as one page

If this saved you some retyping you can [buy me a coffee](https://ko-fi.com/jju1s).
It's free either way and there's no paid tier behind it.

MIT licensed.
