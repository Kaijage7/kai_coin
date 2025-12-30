# Polygon Amoy Testnet Deployment Guide

**Network:** Polygon Amoy (formerly Mumbai)
**Chain ID:** 80002
**Explorer:** https://amoy.polygonscan.com/

---

## Step 1: Get Testnet MATIC

1. **Create/Import Wallet in MetaMask**
   - Install MetaMask: https://metamask.io/
   - Create new wallet OR import existing wallet

2. **Add Polygon Amoy Network to MetaMask**
   - Network Name: Polygon Amoy Testnet
   - RPC URL: https://rpc-amoy.polygon.technology/
   - Chain ID: 80002
   - Currency Symbol: MATIC
   - Block Explorer: https://amoy.polygonscan.com/

3. **Get Free Testnet MATIC**
   - Visit: https://faucet.polygon.technology/
   - Select "Polygon Amoy"
   - Paste your wallet address
   - Click "Submit"
   - Wait 1-2 minutes for MATIC to arrive
   - **You need ~2 MATIC for deployment**

---

## Step 2: Configure Environment

1. **Export Private Key from MetaMask**
   ⚠️ **SECURITY WARNING:** Never share your private key or commit it to GitHub!

   - Open MetaMask
   - Click three dots (⋮) on account
   - Select "Account Details"
   - Click "Export Private Key"
   - Enter password
   - Copy private key (starts with "0x...")

2. **Create .env File**
   ```bash
   cd /home/kaijage/model/kai_coin/contracts
   cp .env.example .env
   nano .env  # or use any text editor
   ```

3. **Add Your Private Key**
   ```env
   POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology/
   PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
   POLYGONSCAN_API_KEY=  # Optional, for verification
   ```

   **Save and exit** (Ctrl+O, Enter, Ctrl+X in nano)

4. **Verify .env is NOT tracked by git**
   ```bash
   git status  # Should NOT show .env file
   ```

---

## Step 3: Install Dependencies

```bash
cd /home/kaijage/model/kai_coin/contracts
npm install
```

Expected packages:
- @nomicfoundation/hardhat-toolbox@^4.0.0
- @openzeppelin/contracts@^5.0.1
- hardhat@^2.19.4
- dotenv@^16.3.1

---

## Step 4: Deploy Contracts

```bash
npm run deploy:testnet
```

**Expected Output:**
```
🚀 Deploying KAI Coin Contracts to polygonAmoy
=========================================

Deploying with account: 0xYourAddress
Account balance: 2000000000000000000 wei

📝 Deploying KAI Token...
✅ KAI Token deployed to: 0x1234...
   - Initial Supply: 400,000,000 KAI (40%)
   - Treasury: 0xYourAddress
   - Max Supply: 1,000,000,000 KAI

🌍 Deploying Climate Alert Staking...
✅ Climate Alert Staking deployed to: 0x5678...
   - Min Stake: 100 KAI
   - Burn Rate: 10% per alert

🏛️  Deploying KAI DAO Governance...
✅ KAI DAO deployed to: 0x9abc...
   - Guardians: 1
   - Proposal Threshold: 10,000 KAI
   - Voting Period: 7 days
   - Timelock: 48 hours

🔮 Deploying KAI Oracle (AI Alert Bridge)...
✅ KAI Oracle deployed to: 0xdef0...
   - Min Confidence: 80%
   - Oracle Reward: 3% of burns
   - Alert Cooldown: 6 hours

🔐 Granting Roles & Linking Contracts...
✅ BURNER_ROLE granted to Climate Staking contract
✅ MINTER_ROLE granted to DAO contract
✅ MINTER_ROLE granted to Oracle contract
✅ ORACLE_ROLE granted to Oracle contract (for triggering alerts)

=========================================
🎉 DEPLOYMENT COMPLETE!
=========================================

📋 Contract Addresses:
--------------------
KAI Token:              0x1234...
Climate Alert Staking:  0x5678...
KAI DAO Governance:     0x9abc...
KAI Oracle (AI Bridge): 0xdef0...

🔗 Verify on PolygonScan:
https://amoy.polygonscan.com/address/0x1234...
https://amoy.polygonscan.com/address/0x5678...
https://amoy.polygonscan.com/address/0x9abc...
https://amoy.polygonscan.com/address/0xdef0...

📄 Deployment info saved to: deployment-polygonAmoy.json
```

**Deployment Time:** ~5-10 minutes
**Gas Cost:** ~1.5 MATIC (testnet, free)

---

## Step 5: Verify Contract Addresses

1. **Check deployment-polygonAmoy.json**
   ```bash
   cat contracts/deployment-polygonAmoy.json
   ```

   Expected format:
   ```json
   {
     "network": "polygonAmoy",
     "chainId": 80002,
     "deployer": "0xYourAddress",
     "timestamp": "2025-12-30T...",
     "contracts": {
       "KAIToken": {
         "address": "0x1234...",
         "maxSupply": "1000000000",
         "initialMint": "400000000",
         "roles": {
           "BURNER_ROLE": "0x5678...",
           "MINTER_ROLE": "0x9abc..."
         }
       },
       ...
     },
     "componentLinkage": {
       "KAIToken → ClimateStaking": "BURNER_ROLE granted",
       ...
     }
   }
   ```

2. **Verify on PolygonScan**
   - Open each contract address in browser
   - Check "Contract" tab shows bytecode
   - Verify "Read Contract" and "Write Contract" tabs work

---

## Step 6: Verify Contract Source Code (Optional)

Get PolygonScan API key:
1. Visit https://polygonscan.com/register
2. Create account
3. Go to https://polygonscan.com/myapikey
4. Create new API key
5. Add to .env: `POLYGONSCAN_API_KEY=your_key`

Verify each contract:
```bash
npx hardhat verify --network polygonAmoy <KAIToken_address> <admin_address> <treasury_address>
npx hardhat verify --network polygonAmoy <Staking_address> <KAIToken_address> <admin> <oracle>
npx hardhat verify --network polygonAmoy <DAO_address> <KAIToken_address> "[<guardian1>, <guardian2>]"
npx hardhat verify --network polygonAmoy <Oracle_address> <KAIToken> <Staking> <admin> <operator> "[<guardians>]"
```

---

## Step 7: Test on Testnet

### Test 1: Check Token Balance
```bash
npx hardhat run scripts/check-balance.js --network polygonAmoy
```

Expected: 400,000,000 KAI in your wallet

### Test 2: Approve & Stake KAI
Use PolygonScan "Write Contract" interface:

1. **Approve Staking Contract**
   - Go to KAI Token contract on PolygonScan
   - Click "Write Contract" → "Connect to Web3"
   - Find `approve(spender, amount)` function
   - spender: `<Staking_contract_address>`
   - amount: `100000000000000000000` (100 KAI in wei)
   - Click "Write"

2. **Stake 100 KAI**
   - Go to Climate Staking contract
   - Click "Write Contract" → "Connect to Web3"
   - Find `stake(amount)` function
   - amount: `100000000000000000000` (100 KAI)
   - Click "Write"

3. **Check Stake Status**
   - Go to "Read Contract" tab
   - Find `getStake(address)` function
   - Enter your wallet address
   - Click "Query"
   - Should show: amount=100 KAI, active=true

### Test 3: Trigger Alert (Oracle Role Required)
```bash
# This requires oracle operator role
# Skip for now, will test after backend integration
```

---

## Step 8: Update Frontend

Add contract addresses to frontend:
```javascript
// frontend/src/App.jsx
const CONTRACTS = {
  network: 'polygonAmoy',
  chainId: 80002,
  KAIToken: '0x1234...', // From deployment-polygonAmoy.json
  ClimateStaking: '0x5678...',
  DAO: '0x9abc...',
  Oracle: '0xdef0...'
};
```

---

## Troubleshooting

### Error: "Insufficient funds for gas"
- **Solution:** Get more testnet MATIC from faucet
- **URL:** https://faucet.polygon.technology/

### Error: "PRIVATE_KEY not found"
- **Solution:** Check .env file exists and has correct format
- **Verify:** `cat contracts/.env` should show PRIVATE_KEY=0x...

### Error: "Nonce too high"
- **Solution:** Reset MetaMask account
- **Steps:** MetaMask → Settings → Advanced → Clear Activity Tab Data

### Error: "Contract deployment failed"
- **Check:** Gas price not too low (use default)
- **Check:** Account has enough MATIC (~2 MATIC needed)
- **Check:** Network is Polygon Amoy (chainId: 80002)

### Contract not verified on PolygonScan
- **Wait:** Can take 5-10 minutes to appear
- **Refresh:** Clear browser cache and reload
- **Manual verify:** Use "Verify & Publish" button on PolygonScan

---

## Next Steps After Deployment

1. **Save Contract Addresses**
   - Copy from deployment-polygonAmoy.json
   - Add to frontend configuration
   - Add to backend environment variables

2. **Test Wallet Connection**
   - Update frontend with contract addresses
   - Test MetaMask connection
   - Test approve + stake flow

3. **Build Backend API**
   - Connect to Oracle contract
   - Implement alert triggering
   - Add Weather API integration

4. **Prepare for Mainnet**
   - Audit contracts (Certik/OpenZeppelin)
   - Get mainnet MATIC (~$50 for deployment)
   - Update PRIVATE_KEY in .env to mainnet wallet
   - Change network to `polygon` in deploy command

---

## Security Checklist

- [ ] .env file NOT committed to git
- [ ] Private key kept secure (never shared)
- [ ] Testnet only for now (no real money)
- [ ] Guardian addresses configured (3+ recommended)
- [ ] Oracle operator address set correctly
- [ ] All roles granted successfully
- [ ] Contract addresses saved in multiple places
- [ ] Source code verified on PolygonScan

---

**Ready to Deploy?**

Run these commands:
```bash
cd /home/kaijage/model/kai_coin/contracts
npm install  # Install dependencies
cp .env.example .env  # Create environment file
nano .env  # Add your private key
npm run deploy:testnet  # Deploy!
```

**Deployment Cost:** FREE (testnet MATIC)
**Deployment Time:** 5-10 minutes
**Contracts Deployed:** 4 (KAI Token, Staking, DAO, Oracle)

🚀 Let's go to production!
