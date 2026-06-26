# Glasswing

Glasswing gives coding agents a reliable browser-verification path from SSH and tmux on macOS. It controls a real Google Chrome window through the Chrome DevTools Protocol (CDP), using a separate Chrome profile and a local debugging port.

It is intentionally small:

- no paid service
- no bundled browser
- no dependency on any embedded browser
- no npm packages required
- works from SSH/tmux as long as the Mac has an unlocked Aqua user session

## Why this exists

When an agent runs inside tmux, embedded browser verification can be unavailable or blocked. A separately launched Chrome with CDP stays reachable from terminal sessions, so agents can still navigate, inspect DOM text, fill fields, click buttons, and capture screenshots.

Chrome's current security model requires remote debugging to use a non-default `--user-data-dir`, so Glasswing always launches with a dedicated profile directory.

## Quick Start

```bash
git clone https://github.com/rweltens1978/glasswing.git
cd glasswing
npm run check
./bin/glasswing.js launch --port 9223 --url about:blank
./bin/glasswing.js goto http://localhost:3000/sign-in
./bin/glasswing.js fill email user@example.com
./bin/glasswing.js screenshot screenshots/login.png
```

Optional local install:

```bash
npm link
glasswing doctor
```

## Commands

```bash
glasswing doctor
glasswing launch --port 9223 --profile /tmp/glasswing-chrome --url about:blank
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
glasswing launch --port 9333 --profile /tmp/glasswing-chrome --url about:blank
```

Open a local app, fill an email field, and capture proof:

```bash
glasswing goto http://localhost:3000/sign-in --port 9333
glasswing wait-text "Sign in" --port 9333
glasswing fill email user@example.com --port 9333
glasswing state --port 9333
glasswing screenshot screenshots/login.png --port 9333
```

## Notes

- Keep the debugging port bound to `127.0.0.1`; do not expose it on the tailnet.
- The separate profile is deliberate. It avoids Chrome's default-profile remote-debugging restrictions and keeps automation cookies isolated.
- If Chrome cannot launch from SSH, log into the Mac mini's desktop once via Screen Sharing or the physical display, then rerun `glasswing launch` from tmux.

## References

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Chrome remote-debugging profile requirement: https://developer.chrome.com/blog/remote-debugging-port
- Playwright's CDP attach concept, used here only as design validation: https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- GitHub ecosystem check: https://github.com/ChromeDevTools/chrome-devtools-mcp
- GitHub ecosystem check: https://github.com/rainmen-xia/chrome-debug-mcp

## License

MIT
