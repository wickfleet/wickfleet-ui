# Wickfleet UI

The browser UI for [Wickfleet](https://github.com/wickfleet/wickfleet), one web
front end for a fleet of [Freqtrade](https://www.freqtrade.io) bots. It adds a
fleet overview, replays, a block-based strategy editor and bot management on
top of FreqUI. The bots come from the Wickfleet hub, which logs the browser in
to each bot, so nobody types a bot API password.

This is a fork of [FreqUI](https://github.com/freqtrade/frequi) by Matthias
Voppichler and contributors, GPL-3.0. All credit for the trading views goes to
them and to the [Freqtrade](https://github.com/freqtrade/freqtrade) project.
Without a hub on the same origin the UI behaves like stock FreqUI. Built with
[Vue.js](https://vuejs.org/) and [Nuxt UI](https://ui.nuxt.com/), like upstream.

| Page | Does |
|---|---|
| Fleet | totals per stake currency (dry and live apart), per-bot table, watchlist signals |
| Replay | backtest a bot over a chosen range: summary with fees and buy-and-hold, trades |
| Strategies | rules as Blockly blocks, settings form, live hub check with readback and generated code |
| Bots | create, edit, delete. Each save is a commit to the hub's registry |
| Everything else | FreqUI as upstream ships it |

Fork details and the files each change lives in: [WICKFLEET.md](WICKFLEET.md).

## Build

Needs Node and make. `make` lists the targets.

| Command | Does |
|---|---|
| `make setup` | install dependencies from the lockfile |
| `make lint` | eslint and the type check |
| `make test` | unit tests |
| `make build` | static UI into `dist/` |
| `make image` | nginx image `wickfleet-ui` (needs Docker) |
| `make e2e` | Playwright against a mocked hub API |

Released images: `ghcr.io/wickfleet/wickfleet-ui:<version>` and `:latest`,
linux/amd64 and linux/arm64.

## Pairing with the hub

The UI expects the hub on the same origin under `/hub`. The quick start in the
[hub repository](https://github.com/wickfleet/wickfleet#quick-start) runs both
behind Traefik with `make quickstart`. That is the easiest way to see it work.

For UI development against a local hub (`make run` in the hub checkout):

```sh
WICKFLEET_HUB=http://127.0.0.1:8090 make run
```

The Vite dev server proxies `/hub` to that hub as an admin.
`WICKFLEET_DEV_USER` and `WICKFLEET_DEV_GROUPS` override the identity.

To run your own build in the quick start, build the image here and point the
hub at it:

```sh
docker build -t wickfleet-ui:local .
WICKFLEET_UI_IMAGE=wickfleet-ui:local make quickstart
```

## Licence

GPL-3.0, the same as upstream FreqUI. See [LICENSE](LICENSE). Blockly is
Apache-2.0.

Not financial advice. Bots run as dry runs unless the hub is set up for real
money on purpose.
