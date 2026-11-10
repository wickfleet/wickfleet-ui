# Wickfleet fork of FreqUI

Branch `wickfleet`, based on upstream tag `3.1.3`. GPL-3.0 like upstream. The
changes stay small so upstream releases merge cleanly.

| Change | Where |
|---|---|
| Bots come from the hub (`/hub/api/bots`) and log in on their own; the hub injects each bot's key | `src/composables/useWickfleet.ts`, `src/router/index.ts` |
| Fleet page: totals per stake currency (dry and live apart), per-bot table, watchlist signals (admins edit the list) | `src/pages/fleet.vue` |
| Replay page: backtest a bot over a chosen range, summary with fees and buy-and-hold, trades | `src/pages/replay.vue` |
| Strategies page: rules as Blockly blocks (Blockly 13.3, Apache-2.0), settings form, live hub check with readback and generated code, save | `src/pages/strategies.vue`, `src/composables/strategy*.ts` |
| Bots page: create, edit, delete; each save is a commit to the registry | `src/pages/bots.vue` |
| Fleet and Bots in the nav, only when a hub answers | `src/components/layout/NavBar.vue` |

Without a hub on the same origin the UI behaves like stock FreqUI. `WICKFLEET_HUB=http://127.0.0.1:8090 make run`
proxies `/hub` to a local hub (`make run` in wickfleet) as an admin; `WICKFLEET_DEV_USER` and
`WICKFLEET_DEV_GROUPS` override the identity.

`make` lists the targets; CI runs `make setup lint test build` and `make setup e2e`
(Playwright, Chromium; `e2e/wickfleet.spec.ts` mocks the hub API).

## Live smoke test

`make e2e-live` logs in through the real login (password plus TOTP), creates a
bot, waits for its container to answer `/api/v1/ping`, deletes it and waits
until it is gone. About three minutes. The bot's data dir stays on the host.

| Variable | Value |
|---|---|
| `WICKFLEET_URL` | the deployed UI, e.g. `https://trade.example.org` |
| `WICKFLEET_E2E_USER` | an operator-role login |
| `WICKFLEET_E2E_PASSWORD` | its password |
| `WICKFLEET_E2E_TOTP` | its `otpauth://totp/...` URI |

Traces are off: they would record the typed password and code.

## Updating from upstream

```
git fetch https://github.com/freqtrade/frequi.git --tags
git merge <new tag>
make setup lint test build
```
