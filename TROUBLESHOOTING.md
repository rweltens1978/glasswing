# Troubleshooting

## Codex says `sandboxCwd must be an absolute file URI`

That error is from Codex's Node REPL/tool metadata layer. It happens before any Chrome, CDP, or Playwright code can run.

Glasswing does not use the Node REPL path. Run it through a shell command:

```bash
glasswing doctor
glasswing launch --port 9333 --profile /tmp/glasswing-chrome --url about:blank
glasswing goto http://localhost:3000/sign-in --port 9333
```

If the command is not on PATH:

```bash
cd /path/to/glasswing
npm link
```

Or use the script directly:

```bash
/path/to/glasswing/bin/glasswing.js doctor
```

## The agent says Playwright is not installed

Playwright is not required. Glasswing speaks Chrome DevTools Protocol directly using Node's built-in `fetch` and `WebSocket`.

## `glasswing open` or `glasswing pages` says `fetch failed`

First check whether Chrome's DevTools HTTP endpoint is actually reachable:

```bash
curl -sS http://127.0.0.1:9333/json/version
curl -sS http://127.0.0.1:9333/json/list
```

If curl works but Glasswing fails, make sure you are running the current CLI:

```bash
which glasswing
glasswing doctor --port 9333
```

Recent Glasswing versions include clearer fetch error messages and fall back to the browser WebSocket for target creation/listing when Chrome's `/json/new` or `/json/list` HTTP endpoints are temporarily unreliable.

If the detailed error contains `connect EPERM 127.0.0.1:<port>`, the current agent sandbox is blocking local TCP sockets for Node. Run Glasswing through the normal shell command path with local-network permission, or approve the command in that agent session.

## The agent says Chrome needs an escalated GUI path

Usually it does not. On macOS with an unlocked desktop user session, Glasswing can launch Chrome directly from tmux:

```bash
glasswing launch --port 9333 --profile /tmp/glasswing-chrome --url about:blank
```

If macOS refuses to launch a GUI app from SSH/tmux, log into the desktop once through Screen Sharing or a physical display, then rerun the command.

## Can Glasswing use my normal Chrome profile?

Not reliably. Chrome 136+ ignores remote-debugging switches when they target the default Chrome data directory, and driving the same profile that your normal Chrome app is already using can corrupt browser state.

Use a named persistent Glasswing profile instead:

```bash
glasswing launch --port 9333 --profile-name personal --url https://admin.shopify.com
```

Log in once in that window. Future launches with `--profile-name personal` reuse those cookies.

## Can Playwright use the Glasswing browser?

Yes. Start Glasswing, then connect Playwright over CDP:

```ts
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();
```

## Check the local setup

```bash
glasswing doctor
```

`doctor` verifies:

- Node has built-in `WebSocket`
- Chrome exists at the configured path
- the current console user
- whether the DevTools port is reachable
- how many Chrome page targets are available
