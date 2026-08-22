# Chrome Web Store listing

Carryover uses one listing and one package for ChatGPT, DeepSeek and Grok. The
folders under this directory are screenshot sets from each supported site, not
separate extension releases.

## Copy

Title: `Carryover: AI chat context handoff`

Short description: `For free ChatGPT, DeepSeek, and Grok users: estimate chat size and carry context into a fresh conversation. Runs locally.`

Detailed description:

> Carryover is built for people using the free tiers of ChatGPT, DeepSeek and
> Grok. It shows an estimated token count beside the open conversation. When the
> chat gets long, press Carry over to build an editable handoff you can copy into
> a fresh chat without starting your work over.
>
> One install works on ChatGPT, DeepSeek and Grok. The extension reads only the
> conversation rendered in the current tab. It does not send chat text to a
> server, call a model, run analytics or press send for you.
>
> The handoff keeps the original goal, decisions, code blocks and recent turns.
> Extraction is mechanical, so the result may be blunt. You can edit it before
> copying, save it as Markdown or place it in a new conversation on the same
> site.
>
> Carryover is an independent project. It is not affiliated with or endorsed by
> OpenAI, DeepSeek or xAI.

> Paid-plan users can use Carryover too, but its percentage is a conservative
> free-plan planning hint. It is not a measurement of an account's actual model
> limit, which the page does not expose.

## Screenshots

Use these five images for the single listing:

1. `chatgpt/01-pill.png`
2. `deepseek/01-pill.png`
3. `grok/01-pill.png`
4. `chatgpt/02-handoff.png`
5. `chatgpt/03-privacy.png`

`chatgpt/promo-440x280.png` is the small promotional tile. The promo files in
the other two folders are byte-identical and kept so the asset generator stays
simple.

## Store disclosures

Single purpose: estimate the size of the open AI conversation and create a
handoff for a new conversation.

Site access: the content script matches only `chatgpt.com`,
`chat.deepseek.com` and `grok.com`. It reads rendered conversation text, adds
the Carryover controls and inserts a handoff after the user presses New chat.

Data use: chat text is processed locally. A pending handoff may be held in the
current site's `sessionStorage` until the fresh chat opens, then it is removed.
The selected theme is stored in that site's `localStorage`. Nothing is sent to
the developer or another service.

Privacy dashboard: disclose website content, personal communications and
user-generated content because Carryover reads chat text locally. Certify the
Chrome Web Store Limited Use requirements. Do not mark this as collecting or
selling data, because no data is transferred off the user's device.

AI service boundaries: Carryover does not bypass safety controls, usage or rate
limits, account rules or plan restrictions. It never presses Send.

Remote code: none. The package has no dependencies and makes no automatic
network requests. Links to the project page, GitHub and Ko-fi open only after a
user clicks them.

Privacy policy: `https://cig13zs.github.io/carryover/privacy.html`
