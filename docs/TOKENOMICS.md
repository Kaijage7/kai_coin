# KAI Token Economics Specification

## Token Overview

| Property | Value |
|----------|-------|
| **Name** | KAI |
| **Symbol** | KAI |
| **Standard** | ERC-20 (with extensions) |
| **Decimals** | 18 |
| **Total Supply** | 1,000,000,000 (1 Billion) |
| **Initial Circulating** | 100,000,000 (10%) |
| **Network** | Polygon (Primary), Ethereum (Bridge) |

## Supply Distribution

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          KAI TOKEN DISTRIBUTION                                  │
│                            Total: 1,000,000,000 KAI                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ████████████████████████████████████████                                       │
│  Community & Ecosystem                                    400,000,000 (40%)     │
│  ├── Airdrop to African Users                            100,000,000 (10%)     │
│  ├── Pillar Rewards Pool                                 150,000,000 (15%)     │
│  ├── Developer Grants                                     50,000,000 (5%)      │
│  └── Strategic Airdrops                                  100,000,000 (10%)     │
│                                                                                  │
│  ████████████████████                                                           │
│  Treasury (DAO Controlled)                               200,000,000 (20%)     │
│  ├── Operational Reserve                                  80,000,000 (8%)      │
│  ├── Insurance Fund                                       60,000,000 (6%)      │
│  ├── Emergency Fund                                       40,000,000 (4%)      │
│  └── Partnership Allocation                               20,000,000 (2%)      │
│                                                                                  │
│  ███████████████                                                                │
│  Founders & Team                                         150,000,000 (15%)     │
│  ├── Founders (3)                                         60,000,000 (6%)      │
│  ├── Core Team                                            60,000,000 (6%)      │
│  └── Future Hires Reserve                                 30,000,000 (3%)      │
│                                                                                  │
│  ███████████████                                                                │
│  Strategic Partners                                      150,000,000 (15%)     │
│  ├── African Union Partnership                            50,000,000 (5%)      │
│  ├── NGO Partners                                         50,000,000 (5%)      │
│  └── Institutional Pilots                                 50,000,000 (5%)      │
│                                                                                  │
│  ██████████                                                                     │
│  Liquidity Provision                                     100,000,000 (10%)     │
│  ├── DEX Liquidity                                        60,000,000 (6%)      │
│  ├── CEX Listings                                         30,000,000 (3%)      │
│  └── Market Making                                        10,000,000 (1%)      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Vesting Schedules

### Founders & Team (15%)

```
Timeline: 5 Years Total
├── Cliff: 12 months (no tokens)
├── Year 2: 20% unlocked (30M KAI)
├── Year 3: 20% unlocked (30M KAI)
├── Year 4: 30% unlocked (45M KAI)
└── Year 5: 30% unlocked (45M KAI)

Monthly Release After Cliff: ~2.5M KAI
```

### Strategic Partners (15%)

```
Timeline: 3 Years Total
├── Cliff: 6 months
├── Year 1: 25% unlocked (37.5M KAI)
├── Year 2: 35% unlocked (52.5M KAI)
└── Year 3: 40% unlocked (60M KAI)

Monthly Release After Cliff: ~4.2M KAI
```

### Community & Ecosystem (40%)

```
Timeline: Milestone-Based Release
├── Launch: 10% (100M KAI - Initial Airdrop)
├── MVP Complete: 15% (150M KAI - Pillar Rewards)
├── 100K Users: 10% (100M KAI)
└── 1M Users: 5% (50M KAI - Developer Grants)

Remaining distributed via:
- Pillar rewards (ongoing)
- DAO governance decisions
- Impact-verified metrics
```

## Token Utility by Pillar

### Pillar 1: Governance

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Create Proposal | 10,000 KAI stake | Returned if passed |
| Vote (Quadratic) | N² KAI per N votes | Locked during voting |
| Delegate Power | Any amount | Transferable |
| Council Seat | 100,000 KAI stake | 1-year lock |

### Pillar 2: Law & Enforcement

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Submit Evidence | 10 KAI | 100% to enforcement fund |
| Request Audit | 100 KAI | 100% to fund |
| Whistleblower Report | Free | Rewards up to 5,000 KAI |
| Penalty Payment | Variable | 70% fund, 30% burned |

### Pillar 3: Agriculture

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Insurance Premium | Variable | 80% pool, 20% burned |
| Compliance Cert | 50 KAI | Verifier fee |
| Claim Payout | Automatic | From insurance pool |
| Farmer Registration | Free | Verification required |

**Insurance Premium Calculation:**
```
Premium = Coverage × BaseRate × DurationFactor × RiskFactor - ComplianceDiscount

Where:
- BaseRate = 5% (500 basis points)
- DurationFactor = Duration/365
- RiskFactor = 1 + (Risks × 0.1)
- ComplianceDiscount = Premium × (ComplianceScore/500)
```

### Pillar 4: Health & Food Safety

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Producer Registration | Free | - |
| Request Inspection | 20 KAI | 70% fund, 30% burned |
| Certification | 100 KAI | 70% fund, 30% burned |
| Product Traceability | 5 KAI/product | 100% to fund |

### Pillar 5: AI & Compute

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Publish Model | 500 KAI | 50% fund, 50% burned |
| Request Inference | Variable | 70% publisher, 20% provider, 10% fund |
| Contribute Data | Free | Rewards up to 50 KAI |
| Compute Job | Variable | 90% provider, 10% fund |

### Pillar 6: Disaster Response

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Basic Subscription | 10 KAI/month | 60% fund, 20% burned, 20% emergency |
| Premium Subscription | 50 KAI/month | 60% fund, 20% burned, 20% emergency |
| Response Verification | Free | Rewards from emergency fund |
| Emergency Payout | Up to 1,000 KAI | From emergency fund |

### Pillar 7: Climate Adaptation

| Function | KAI Required | Mechanism |
|----------|--------------|-----------|
| Access Risk Model | 25 KAI | 60% creator, 30% fund, 10% burned |
| Propose Project | 200 KAI | 100% to adaptation fund |
| Fund Project | Variable | 100% to project |
| Purchase Carbon Credit | 10 KAI/ton | 100% to fund |

## Fee Distribution Summary

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FEE DISTRIBUTION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                              ALL FEES COLLECTED                                  │
│                                     │                                            │
│              ┌──────────────────────┼──────────────────────┐                    │
│              │                      │                      │                    │
│              ▼                      ▼                      ▼                    │
│     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐           │
│     │   BURN (20%)    │   │  PILLAR FUNDS   │   │   REWARDS       │           │
│     │                 │   │    (50-70%)     │   │   (10-30%)      │           │
│     │  Deflationary   │   │                 │   │                 │           │
│     │   Pressure      │   │  • Insurance    │   │  • Publishers   │           │
│     │                 │   │  • Emergency    │   │  • Providers    │           │
│     │                 │   │  • Enforcement  │   │  • Responders   │           │
│     │                 │   │  • Adaptation   │   │  • Validators   │           │
│     │                 │   │  • AI Dev       │   │                 │           │
│     │                 │   │  • Health       │   │                 │           │
│     └─────────────────┘   └─────────────────┘   └─────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Inflation & Deflation Mechanics

### Impact-Tied Inflation

New KAI tokens are minted **only** when verifiable positive impact is achieved:

| Impact Metric | Threshold | Inflation Rate |
|---------------|-----------|----------------|
| Disaster Alerts Acted Upon | >10,000 | +1% |
| Verified Farmers | >100,000 | +1% |
| Health Certifications | >50,000 | +1% |
| Governance Participation | >25% tokens voting | +1% |
| Climate Projects Funded | >$10M | +1% |

**Maximum Annual Inflation: 5%** (requires all 5 thresholds)

### Deflationary Mechanisms

| Source | Burn Rate | Estimated Annual |
|--------|-----------|------------------|
| Transaction Fees | 20% of fees | ~10M KAI |
| False Insurance Claims | 100% of stake | Variable |
| Compliance Penalties | 50-100% | Variable |
| Governance Spam | 100% of deposit | Variable |
| Model Publishing | 50% of fee | ~1M KAI |

**Estimated Net Effect**: Deflationary in early years (burns > mints)

## Price Discovery Phases

### Phase 1: Initial DEX Offering (IDO)

```
Initial Liquidity: 60M KAI + $3M USDC
Starting Price: $0.05/KAI
Initial Market Cap: $50M (circulating)
Fully Diluted Value: $50M
```

### Phase 2: Growth (Year 1)

```
Target Circulating: 200M KAI
Target Price Range: $0.10 - $0.50/KAI
Market Cap Target: $20M - $100M
```

### Phase 3: Maturity (Year 2+)

```
Target Circulating: 400M KAI
Price determined by:
- Utility demand (pillar usage)
- Staking participation
- Impact achievements
```

## Staking Mechanics

### Governance Staking

| Lock Period | APY Boost | Voting Power |
|-------------|-----------|--------------|
| No lock | 0% | 1x |
| 30 days | 5% | 1.2x |
| 90 days | 12% | 1.5x |
| 180 days | 20% | 2x |
| 365 days | 30% | 3x |

### Pillar-Specific Staking

| Pillar | Stake Purpose | Min Stake | APY |
|--------|---------------|-----------|-----|
| Disaster | Alert Subscription | 10 KAI | N/A |
| Agriculture | Insurance Access | 50 KAI | 8% |
| AI | Model Publishing | 500 KAI | 15% |
| Governance | Proposal Creation | 10,000 KAI | 12% |

## Economic Security

### Anti-Dump Mechanisms

1. **Vesting Schedules**: Long-term alignment for team/partners
2. **Staking Incentives**: Rewards for holding
3. **Quadratic Voting**: Prevents whale manipulation
4. **Utility Lock**: Tokens must be staked for service access
5. **Burn Pressure**: Consistent deflationary burns

### Sybil Resistance

1. **KYC for Large Stakes**: >$10,000 requires verification
2. **Geographic Verification**: Phone/mobile money integration
3. **Proof of Humanity**: For airdrop eligibility
4. **Quadratic Mechanisms**: Diminishing returns for large holders

### Treasury Security

1. **Multisig Requirement**: 4-of-7 signatures
2. **Timelock**: 48-hour delay on execution
3. **Spending Limits**: DAO vote required for >1% treasury
4. **Quarterly Audits**: Public financial reports

## Token Contract Parameters

```solidity
// KaiToken.sol Configuration

MAX_SUPPLY = 1,000,000,000 * 10**18;      // 1 billion KAI
INITIAL_SUPPLY = 100,000,000 * 10**18;     // 100 million KAI
MAX_INFLATION_BP = 500;                     // 5% max annual
SECONDS_PER_YEAR = 365 days;

// Role-based minting
MINTER_ROLE = keccak256("MINTER_ROLE");    // Treasury/Governance
PILLAR_ROLE = keccak256("PILLAR_ROLE");    // Pillar contracts
PAUSER_ROLE = keccak256("PAUSER_ROLE");    // Emergency pause
```

## Revenue Projections

### Year 1 (MVP)

| Source | Monthly Revenue | Annual Revenue |
|--------|-----------------|----------------|
| Disaster Subscriptions | 50,000 KAI | 600,000 KAI |
| Insurance Premiums | 100,000 KAI | 1,200,000 KAI |
| AI Inference Fees | 20,000 KAI | 240,000 KAI |
| Health Inspections | 30,000 KAI | 360,000 KAI |
| Climate Model Access | 10,000 KAI | 120,000 KAI |
| **Total** | **210,000 KAI** | **2,520,000 KAI** |

### Year 3 (Scale)

| Source | Monthly Revenue | Annual Revenue |
|--------|-----------------|----------------|
| Disaster Subscriptions | 2,000,000 KAI | 24,000,000 KAI |
| Insurance Premiums | 5,000,000 KAI | 60,000,000 KAI |
| AI Inference Fees | 1,000,000 KAI | 12,000,000 KAI |
| Health Inspections | 500,000 KAI | 6,000,000 KAI |
| Climate Model Access | 500,000 KAI | 6,000,000 KAI |
| **Total** | **9,000,000 KAI** | **108,000,000 KAI** |

## Governance Over Tokenomics

The DAO can modify the following parameters with sufficient votes:

| Parameter | Modifiable | Governance Requirement |
|-----------|------------|------------------------|
| Fee Rates | Yes | 60% approval |
| Burn Rates | Yes | 60% approval |
| Inflation Rate | Yes | 75% approval |
| Max Supply | No | Constitutional (immutable) |
| Vesting Schedules | No | Constitutional |
| Treasury Spending | Yes | Per-proposal vote |

---

**Document Version**: 1.0
**Last Updated**: December 2025
**Audited By**: [Pending - 3 independent audits scheduled]
