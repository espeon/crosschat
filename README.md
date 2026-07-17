# crosschat

A multichat OBS overlay that merges Twitch chat and Streamplace chat into one transparent browser source.

## Quick start

```bash
pnpm install
pnpm dev
```

Then open:

```
http://localhost:5173/chat?streamplace=zeu.dev&twitch=zeu_dev
```

Paste that URL into an OBS Browser Source (set width/height to your canvas size, custom CSS can stay empty — the page is already transparent).

## How it works

```
OBS browser source
  ├── wss://irc-ws.chat.twitch.tv   (anonymous IRC, PASS SCHMOOPIIE)
  ├── wss://stream.place/api/websocket/{stream}   (Streamplace JSON)
  │
  └── client-side normalize + merge + render
```

No server required. Both upstreams connect directly from the browser:

- **Twitch** connects via anonymous IRC over WebSocket (`justinfan<random>`). No OAuth token, no credentials. Read-only — can see chat but not send.
- **Streamplace** connects to the node's `/api/websocket/{stream}` endpoint. Read-only — receives live messages, pins, and moderation events.

Both adapters normalize their payloads into a shared `ChatEvent` model, the aggregator dedupes and orders them, and the renderer displays a unified timeline.

## URL parameters

| Parameter     | Default     | Values                                           |
|---------------|-------------|--------------------------------------------------|
| `streamplace` | (none)      | Streamplace handle or DID, e.g. `zeu.dev`        |
| `twitch`      | (none)      | Lowercase Twitch login, e.g. `zeu_dev`           |
| `layout`      | `merged`    | `merged` or `columns`                            |
| `direction`   | `down`      | `down` (newest at bottom) or `up`                |
| `hideAfter`   | `60`        | Seconds before a message fades out. `0` = never  |
| `max`         | `100`       | Maximum rendered messages (10–500)                |
| `theme`       | `transparent`| `transparent`, `dark`, or `light`              |
| `fontSize`    | `14`        | CSS pixel size (10–32)                           |
| `showPlatform`| `true`      | `false` to hide platform logos                   |
| `showBadges`  | `true`      | `false` to hide badges                           |
| `debug`       | `false`     | `true` to show connection status overlay         |

Either source can be omitted for single-platform use:

```
/chat?twitch=zeu_dev           # Twitch only
/chat?streamplace=zeu.dev      # Streamplace only
```

## Features

- **Transparent by default** — no background, no scrollbars, no page chrome
- **Platform logos** — inline SVG, no external image dependencies
- **Badges** — Twitch badges resolved from the Twitch badges API; Streamplace badges from the message view
- **Emotes** — Twitch emotes rendered as images from `static-cdn.jtvnw.net`
- **Replies** — both Twitch and Streamplace reply context shown
- **Moderation** — Twitch CLEARMSG/CLEARCHAT and Streamplace deleted/gate/block events remove messages
- **Pins** — Streamplace pinned messages shown in a dedicated region
- **Reconnect** — each source reconnects independently with exponential backoff
- **Keepalive** — sends IRC PING every 3.5 minutes to prevent idle disconnects
- **Dedup** — bounded LRU cache prevents duplicate messages on reconnect
- **Fade-out** — messages fade after 60s by default (configurable via `hideAfter`)
- **Reduced motion** — respects `prefers-reduced-motion`
- **Content-Security-Policy** — restrictive CSP, no inline scripts, allowlisted origins only

## Architecture

```
src/
├── types/chat.ts                  # Normalized ChatEvent union (the contract)
├── adapters/
│   ├── twitch-parser.ts           # IRC line parser, tag unescaping, emote/badge conversion
│   ├── twitch-adapter.ts          # WebSocket connection, anonymous auth, keepalive, reconnect
│   ├── twitch-badges.ts           # Twitch badges API resolver (global + channel)
│   ├── streamplace-parser.ts      # $type dispatch, facet conversion, badge normalization
│   └── streamplace-adapter.ts     # WebSocket connection, history skipping, reconnect
├── aggregator/
│   └── chat-aggregator.ts         # Merge, dedup, deletion memory, reorder buffer, bounded store
├── renderer/
│   ├── ChatOverlay.tsx            # Main overlay component
│   ├── overlay.css                # Transparent OBS-friendly styles
│   ├── params.ts                  # Query parameter parsing and validation
│   └── PlatformLogos.tsx          # Inline SVG logos (Twitch + Streamplace)
├── fixtures/
│   ├── twitch.ts                  # Representative IRC lines with expected output
│   └── streamplace.ts             # Representative JSON payloads with expected output
├── App.tsx                        # Routes /chat → ChatOverlay, everything else → Landing
└── main.tsx                       # React root
```

## Anonymous Twitch IRC

Twitch's official documentation says IRC clients must use an OAuth token, but the `SCHMOOPIIE` / `justinfan<digits>` anonymous login is historically established and still works. It's read-only — you can join channels and receive messages but not send.

This could stop working without being treated as a breaking API change. If it does, the adapter reports `authentication-required` and the Streamplace feed keeps working independently. An OAuth/EventSub adapter can be added later.

## Development

```bash
pnpm dev      # Start Vite dev server
pnpm build    # Type-check and build for production
pnpm preview  # Preview the production build
pnpm lint     # Run Oxlint
```

## Notes

- Streamplace initial history (~100 messages) is skipped by default. Only live messages are shown. Set `skipHistory=false` in the adapter to change this.
- The Streamplace node URL defaults to `https://stream.place`. If you need a proxy or different node, pass `streamplaceBaseUrl` in the aggregator config.
- No secrets, tokens, or credentials appear in the HTML, query string, or browser bundle.

## License

MIT
