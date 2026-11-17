# Strategy

The sealed snapshot has 758 protocols and 40 watchlist entries. All 40 are included; 60 additional eligible records below the floor are selected by implied value. Recorded tokens are displayed separately, not ranked with candidates. A missing token record is not proof that no token exists. Versioned pools and CEXes are excluded from early candidates; parent relationships are not available.

## Signal and weights

Implied value = round(TVL × 0.25 × growth multiplier × maturity multiplier), bounded to $1–$100 trillion. Growth multiplier = 1 + 0.8 × clamp(7-day TVL change, -60%, +80%); missing change is neutral. Maturity multiplier = 0.7 + 0.3 × min(days since tracking began, 1,095) / 1,095; unknown age uses 365 days. These heuristic weights favor current capital and positive trajectory while capping short-term spikes, and discount young records without treating missing age as zero. Tracking age is not protocol age or time since funding. Value is neither a market price nor a prediction.

Liquidity per holder, buy/sell pressure, holder concentration, 30-day unlocks, funding and audits are not present in the snapshot. They are unknown, not zero; do not invent them. A single 7-day observation cannot establish a multi-period trend.

## Farm plan and invalidation

Plans use category and chain for the proposed action, TVL tiers for $50–$250 illustrative exposure, and tracking age for a 30–60 day review horizon. They show snapshot TVL and growth and a row-specific 20% TVL decline threshold. Stop new deposits and consider exit after that threshold, an exploit or depeg; verify exit liquidity and fees first. Check official app, contracts, audits, eligibility and current data independently. Gas varies; loss of principal, smart contract failure and absent rewards are possible. No eligibility or return is guaranteed.
