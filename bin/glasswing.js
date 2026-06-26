#!/usr/bin/env node
import {
  click,
  doctor,
  ensureRunning,
  evalCommand,
  fill,
  launch,
  navigate,
  openUrl,
  pages,
  parseArgs,
  ping,
  screenshot,
  state,
  text,
  waitText
} from "../lib/commands.js";

const help = `Glasswing - tmux-safe Chrome verification for Codex

Usage:
  glasswing doctor [--port 9223]
  glasswing launch [--port 9223] [--profile /tmp/glasswing-chrome] [--url about:blank]
  glasswing ensure [--port 9223]
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
  glasswing ping

Environment:
  GLASSWING_PORT      default Chrome DevTools port, defaults to 9223
  GLASSWING_PROFILE   separate Chrome profile, defaults to /tmp/glasswing-chrome
  GLASSWING_CHROME    Chrome executable path
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";

  switch (command) {
    case "doctor":
      return doctor(args);
    case "launch":
      return launch(args);
    case "ensure":
      return ensureRunning(args);
    case "pages":
      return pages(args);
    case "open":
      return openUrl(args);
    case "goto":
    case "navigate":
      return navigate(args);
    case "state":
      return state(args);
    case "text":
      return text(args);
    case "wait-text":
      return waitText(args);
    case "fill":
      return fill(args);
    case "click":
      return click(args);
    case "eval":
      return evalCommand(args);
    case "screenshot":
      return screenshot(args);
    case "ping":
      return ping(args);
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(help);
      return;
    default:
      process.stderr.write(`${help}\nUnknown command: ${command}\n`);
      process.exitCode = 2;
  }
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch((error) => {
  process.stderr.write(`glasswing: ${error.message}\n`);
  if (process.env.GLASSWING_DEBUG && error.details) {
    process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
  }
  process.exit(1);
});
