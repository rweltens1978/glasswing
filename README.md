# Glasswing

Glasswing gives coding agents a reliable browser-verification path from SSH and tmux on macOS. It controls a real Google Chrome window through the Chrome DevTools Protocol (CDP), using a separate Chrome profile and a local debugging port.

It is intentionally small:

- no paid service
- no bundled browser
- no dependency on any embedded browser
- no npm packages required
- works from SSH/tmux as long as the Mac has an unlocked Aqua user session
- keeps cookies in a named persistent Glasswing profile by default

## Why this exists

When an agent runs inside tmux, embedded browser verification can be unavailable or blocked. A separately launched Chrome with CDP stays reachable from terminal sessions, so agents can still navigate, inspect DOM text, fill fields, click buttons, and capture screenshots.

Chrome's current security model requires remote debugging to use a non-default `--user-data-dir`, so Glasswing launches with a dedicated profile directory. That profile is persistent, so you can log in once and reuse the cookies in later tmux sessions.

## Quick Start

```bash
git clone https://github.com/rweltens1978/glasswing.git
cd glasswing
npm run check
npm link
glasswing launch --port 9223 --url about:blank
glasswing goto http://localhost:3000/sign-in
glasswing fill email user@example.com
glasswing screenshot screenshots/login.png
```

Optional local install:

```bash
npm link
glasswing doctor
```

## Using Glasswing from Codex or Other Agents

Use Glasswing through the normal shell/terminal command runner, not through a Node REPL, Playwright, MCP browser bridge, or embedded browser tool.

Good:

```bash
glasswing doctor
glasswing launch --port 9333 --profile /tmp/glasswing-chrome --url about:blank
glasswing goto http://localhost:3000/sign-in --port 9333
```

If an agent reports an error like this, it is diagnosing the wrong path:

```text
codex/sandbox-state-meta: sandboxCwd must be an absolute file URI
```

That error comes from the agent's Node REPL/tool metadata before browser automation runs. Glasswing does not use that path. Run `glasswing ...` via the shell instead.

Glasswing also does not require Playwright. It uses Node's built-in `fetch` and `WebSocket` APIs to speak CDP directly.

## Commands

```bash
glasswing doctor
glasswing launch --port 9223 --profile-name default --url about:blank
glasswing profile-path [name]
glasswing ensure
glasswing pages
glasswing open <url>
glasswing goto <url> [--match title-or-url]
glasswing state [--match title-or-url]
glasswing text [--match title-or-url]
glasswing wait-text <text> [--timeout 15000]
glasswing fill <selector-or-field> <value>
glasswing click <selector-or-text>
glasswing eval <javascript>
glasswing screenshot [output.png]
```

## Examples

Start a dedicated Chrome session:

```bash
glasswing launch --port 9333 --profile-name work --url about:blank
```

Open a local app, fill an email field, and capture proof:

```bash
glasswing goto http://localhost:3000/sign-in --port 9333
glasswing wait-text "Sign in" --port 9333
glasswing fill email user@example.com --port 9333
glasswing state --port 9333
glasswing screenshot screenshots/login.png --port 9333
```

Use the same logged-in browser profile later:

```bash
glasswing launch --port 9333 --profile-name work --url about:blank
glasswing open https://admin.shopify.com --port 9333
```

Show where a named profile lives:

```bash
glasswing profile-path work
```

## Standard Chrome Profile and Playwright

Glasswing cannot reliably attach to Chrome's normal day-to-day profile. Chrome 136+ intentionally ignores `--remote-debugging-port` and `--remote-debugging-pipe` when they target the default Chrome data directory, and sharing a live profile with automation can corrupt state.

Use a persistent Glasswing profile instead:

```bash
glasswing launch --port 9333 --profile-name personal --url https://admin.shopify.com
```

Log in once in that Chrome window. Future sessions using `--profile-name personal` reuse those cookies.

Playwright can attach to Glasswing's Chrome endpoint:

```ts
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();
await page.goto("http://localhost:3000");
```

That gives Playwright automation over the same persistent Glasswing profile.

## Notes

- Keep the debugging port bound to `127.0.0.1`; do not expose it on the tailnet.
- The separate profile is deliberate. It avoids Chrome's default-profile remote-debugging restrictions while still keeping cookies between sessions.
- If Chrome cannot launch from SSH, log into the Mac mini's desktop once via Screen Sharing or the physical display, then rerun `glasswing launch` from tmux.
- If `glasswing` is not found, use the absolute path to the script or run `npm link` from the repo checkout.

## References

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Chrome remote-debugging profile requirement: https://developer.chrome.com/blog/remote-debugging-port
- Playwright's CDP attach concept, used here only as design validation: https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- GitHub ecosystem check: https://github.com/ChromeDevTools/chrome-devtools-mcp
- GitHub ecosystem check: https://github.com/rainmen-xia/chrome-debug-mcp

## License

MIT
