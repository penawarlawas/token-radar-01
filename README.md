# Token Radar

[![make.fun competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/penawarlawas/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/penawarlawas/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

Offline launch radar for the sealed DefiLlama snapshot. Rankings are heuristic estimates, not prices or assurances of an airdrop. See [STRATEGY.md](STRATEGY.md) for assumptions and risks.

Run with Node 22.18 or later:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json

Open `out/dashboard/index.html` locally. No runtime network or dependencies.
