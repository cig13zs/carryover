# Carryover

Carryover is a Chrome extension for free ChatGPT, DeepSeek and Grok chats. It reads the rendered current-tab conversation, estimates size, and builds a compact handoff for a fresh chat when free-tier chats slow down or hit practical context limits. A new chat otherwise loses the model's work.

One install covers all three sites. Paid users can run it, but its percentage is a conservative free-plan hint, not an account limit. Its content script matches only those domains; Chrome may show access. No extension API or host permissions are needed, and it cannot access other tabs, history, or cookies.

**[cig13zs.github.io/carryover](https://cig13zs.github.io/carryover/)**

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/carryover/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/carryover/actions)

## How it works

On a real exchange, a pill shows the estimate:

```
~38.2k · 39%   [ Carry over ]
```

The number is an estimated token count. The percentage is progress against a fixed, conservative free-tier planning budget, not the platform's current limit or your account quota. Carry over compacts the conversation, copies the handoff, and shows what it copied.

The panel is editable. Remove text, use `Save .md`, press Escape to close, or `Alt+C` to open. `New chat` starts a fresh conversation in the same tab and puts the handoff in the composer without sending it. Range fields narrow included messages; the default is everything.

The handoff contains the first real user message, decision or constraint lines, deduplicated code with newer blocks kept first, and the last few turns verbatim.

## Extraction

No model call is used. Pattern matching selects existing text, so it runs instantly offline and cannot invent; each line comes from you or the model. It may keep extra text, but you can edit it before pasting.

## Security and privacy

No automatic network requests, server, API key, analytics endpoint, remote code, or dependencies exist. Text stays in the current tab. Exact domain matches are in `content_scripts.matches`; there are no `permissions` or `host_permissions` keys. Behavior is in two JavaScript files.

It uses `textContent`, not `innerHTML`, and a closed shadow root. Clipboard writes occur only on a user click. `sessionStorage` holds the pending handoff through navigation, then deletes it after reading. The theme uses `localStorage` values `auto`, `light`, or `dark`; no storage permission is needed, and values are whitelisted because the host can write its storage.

Carryover never sends, clicks, automates, or bypasses safety, usage, rate, account, or plan limits. `New chat` fills the composer only. It collects or transmits no user data. The [privacy policy](https://cig13zs.github.io/carryover/privacy.html) covers access and storage. It is not affiliated with OpenAI, DeepSeek, or xAI and uses no logos or brand assets.

## Limits

The token count uses a character heuristic, not the real tokenizer, and should be within about 15%. The percentage is a fixed conservative per-site budget for free-tier sessions. Because the page does not reveal the model, rollout, plan, or actual context limit, use it to prepare a handoff, not as a quota meter. Images become `[image attachment, not carried over]`; virtualized messages missing from the DOM cannot be counted or carried.

## Install

Download the single zip from [Releases](https://github.com/cig13zs/carryover/releases), unzip it, open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the folder.

To build it, install Node and run:

```bash
node build.js        # writes dist/carryover and carryover-<version>.zip
node engine.test.js  # engine self-check
node boot.test.js    # boots the content script on all three hostnames
node build.test.js   # checks manifest scope and reproducible package bytes
```

## Development

```
src/engine.js      token estimate, extraction, compaction
src/content.js     site adapters, pill UI, clipboard
build.js           unpacked extension and deterministic zip
```

`content.js` selects by hostname. All adapters ship together, but each site's code runs only on its site. ChatGPT uses `data-turn`; `data-message-author-role` appears on some turns and can return half the chat. DeepSeek and Grok use structural reading because hashed classes such as `_3098d02` change between deploys. The pill requires one long real turn, avoiding new-chat greetings, suggestions, mode chips, and disclaimers.

It has no paid tier.
