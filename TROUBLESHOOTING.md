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

## The agent says Chrome needs an escalated GUI path

Usually it does not. On macOS with an unlocked desktop user session, Glasswing can launch Chrome directly from tmux:

```bash
glasswing launch --port 9333 --profile /tmp/glasswing-chrome --url about:blank
```

If macOS refuses to launch a GUI app from SSH/tmux, log into the desktop once through Screen Sharing or a physical display, then rerun the command.

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
