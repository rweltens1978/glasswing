# Contributing

Thanks for helping improve Glasswing.

## Development

```bash
npm run check
./bin/glasswing.js doctor
```

Glasswing intentionally has no runtime npm dependencies. Prefer small, auditable changes that keep the CLI useful from SSH and tmux.

## Security

Keep Chrome's DevTools port bound to `127.0.0.1`. Do not expose it on a public interface or VPN address.
