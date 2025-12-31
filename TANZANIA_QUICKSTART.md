# 🇹🇿 TANZANIA M-PESA - QUICK START GUIDE

## 🚀 START TESTING IN 5 MINUTES!

### **Step 1: Get Vodacom M-Pesa Sandbox Credentials (2 minutes)**

1. Visit: [developer.mpesa.vm.co.tz](https://developer.mpesa.vm.co.tz/)
2. Click "Sign Up" → Create free account
3. Go to "My Apps" → "Create New App"
4. Fill in app details:
   - App Name: KAI Intelligence
   - Description: Climate intelligence payment system
   - Environment: Sandbox
5. Click "Create" → Copy your credentials:
   - **API Key** (starts with something like: `j4hdig2ks8j...`)
   - **Public Key** (long RSA key)

---

### **Step 2: Configure Backend (1 minute)**

```bash
cd backend

# Copy environment template
cp .env.tanzania.example .env

# Edit .env file
nano .env  # or use your favorite editor
```

**Add your credentials from Step 1:**
```bash
MPESA_ENVIRONMENT=sandbox
MPESA_API_KEY=your_api_key_from_vodacom_portal
MPESA_PUBLIC_KEY=your_public_key_from_vodacom_portal
MPESA_SERVICE_PROVIDER_CODE=000000
```

Save and close.

---

### **Step 3: Install Dependencies (1 minute)**

```bash
# Install Node packages
npm install

# Should see:
# ✓ express installed
# ✓ axios installed
# ✓ dotenv installed
```

---

### **Step 4: Run Test! (1 minute)**

```bash
node test-tanzania-payment.js
```

**Expected Output:**
```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🇹🇿 TANZANIA M-PESA PAYMENT INTEGRATION TEST 🇹🇿      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Environment Configuration:
─────────────────────────────────────────
Environment: sandbox
API Key: ✅ Set
Service Provider: 000000


═══════════════════════════════════════
TEST 1: GET PRICING FOR TANZANIA
═══════════════════════════════════════

alert_flood:
  - USD: $20
  - TZS: TZS 46,000
  - Swahili: Shilingi 46,000

alert_drought:
  - USD: $15
  - TZS: TZS 34,500
  - Swahili: Shilingi 34,500

✅ Pricing test complete


═══════════════════════════════════════
TEST 2: SANDBOX PAYMENT (NO REAL MONEY)
═══════════════════════════════════════

🇹🇿 Tanzania M-Pesa Payment Request
=====================================
📱 Phone: 255000000000
💰 Amount: TZS 46,000
📝 Reference: TEST-SANDBOX-1735567890123
🏢 Service Provider: 000000
🌐 Environment: SANDBOX

⏳ Getting session key...
✅ Tanzania M-Pesa session key obtained

📤 Sending payment request...

📥 Response received

✅ Payment initiated successfully!
Customer will receive M-Pesa prompt on their phone.


✅ SANDBOX TEST PASSED!
Transaction ID: TX12345678
Reference: AG_20251230_123456789

ℹ️  In production, customer would receive M-Pesa prompt


═══════════════════════════════════════
✅ ALL TESTS COMPLETE!
═══════════════════════════════════════
```

**If you see ✅ ALL TESTS COMPLETE, you're ready!**

---

## 💰 TEST WITH REAL MONEY (After Sandbox Works)

### **Step 1: Get Production Credentials**

**Option A: Visit Vodacom Shop (Recommended)**
- Bring: Business certificate, TIN, ID, bank details
- Ask for: "M-Pesa for Business" account
- Wait: 2-3 days for approval
- Get: Production API credentials

**Option B: Apply Online**
- Visit: [m-pesa.vodacom.co.tz](https://m-pesa.vodacom.co.tz)
- Click "Business" → "Register"
- Fill application online
- Wait for approval

---

### **Step 2: Update .env for Production**

```bash
nano .env
```

**Change these lines:**
```bash
# Switch to production
MPESA_ENVIRONMENT=production

# Add production credentials
MPESA_API_KEY=your_production_api_key
MPESA_PUBLIC_KEY=your_production_public_key
MPESA_SERVICE_PROVIDER_CODE=your_business_number  # e.g., 123456

# Update test phone (your real Vodacom number)
TEST_PHONE_NUMBER=255712345678  # Change this!
```

---

### **Step 3: Test with Small Amount (1,000 TZS = ~$0.43)**

```bash
node test-tanzania-payment.js --real
```

**What happens:**
1. Script sends payment request to Vodacom M-Pesa
2. **Your phone vibrates** 📱
3. You see M-Pesa prompt:
   ```
   Lipa kwa M-Pesa

   Lipia KAI Intelligence
   Kiasi: TZS 1,000

   Weka PIN yako
   [ * * * * ]

   [Ghairi]  [Sawa]
   ```
4. Enter your M-Pesa PIN
5. SMS confirmation: "Umefanikiwa kulipa TZS 1,000..."
6. **Money appears in your M-Pesa business account!** 💰

**Check balance:**
```bash
# Dial on your phone:
*150*00#

# Select:
1. Akaunti yangu
2. Angalia salio

# Should see +1,000 TZS!
```

---

## 🎉 YOU'RE NOW COLLECTING REAL MONEY!

### **Next Steps:**

#### **1. Start Backend Server**
```bash
cd backend
npm start

# Server running on http://localhost:3333
# API ready at: http://localhost:3333/api/
```

#### **2. Test Climate Alert Purchase**
```bash
curl -X POST http://localhost:3333/api/climate/alert/buy \
  -H "Content-Type: application/json" \
  -d '{
    "alertType": "flood",
    "phone": "255712345678",
    "country": "TZ",
    "paymentMethod": "mpesa"
  }'
```

**Customer flow:**
1. Customer enters phone number on your app/website
2. They click "Buy Flood Alert"
3. They receive M-Pesa prompt on phone
4. They enter PIN
5. **You get money! They get alert!** ✅

---

## 📱 SHARE WITH CUSTOMERS

### **WhatsApp Message (Swahili):**
```
Habari! 👋

LINDA SHAMBA LAKO!

Pata tahadhari za mafuriko kabla haijatokea!

💰 Bei: Shilingi 46,000 tu ($20)
📱 Lipa: M-Pesa
⏰ Tahadhari: Saa 48 kabla

✅ Okoa mazao yako
✅ Taarifa kwa SMS
✅ Inafanya kazi simu zote

Bonyeza kulipia: https://kai.io/tz

Maswali? Tuma ujumbe hapa.
```

### **SMS Message (Short):**
```
KAI ALERT: Linda shamba lako!
Lipa TZS 46,000 kwa M-Pesa
Bonyeza: kai.io/tz
```

### **USSD (For Basic Phones):**
```
Bonyeza: *384*55#
Chagua: Tahadhari ya Mafuriko
Lipa: M-Pesa
Maliza!
```

---

## 💡 PRICING FOR TANZANIA MARKET

### **Current Pricing:**
| Product | USD | TZS | Per |
|---------|-----|-----|-----|
| Flood Alert | $20 | 46,000 | Alert |
| Drought Alert | $15 | 34,500 | Alert |
| Basic Plan | $30 | 69,000 | Month |
| Premium Plan | $80 | 184,000 | Month |

### **Market Analysis:**
- Competitor weather services: ~100,000 TZS/month
- **Our advantage:** Lower price + AI intelligence!
- Average farmer income: 500,000 TZS/month
- Our pricing: ~15% of monthly income (affordable!)

---

## 📊 REVENUE PROJECTIONS (TANZANIA ONLY)

### **Conservative (Year 1):**
- **Target:** 1,000 farmers
- **Average:** 100,000 TZS/month per farmer
- **Monthly:** 100M TZS = **$43k**
- **Yearly:** 1.2B TZS = **$520k**

### **Aggressive (Year 2):**
- **Target:** 10,000 farmers
- **Average:** 150,000 TZS/month
- **Monthly:** 1.5B TZS = **$650k**
- **Yearly:** 18B TZS = **$7.8M**

### **Market Leader (Year 3):**
- **Target:** 100,000 farmers
- **Average:** 180,000 TZS/month
- **Monthly:** 18B TZS = **$7.8M**
- **Yearly:** 216B TZS = **$94M**

**FROM TANZANIA ALONE!** 🇹🇿💰

---

## 🚨 TROUBLESHOOTING

### **Problem: "Invalid API Key"**
**Solution:**
- Check you're using sandbox key in sandbox mode
- Check you're using production key in production mode
- Regenerate API key from Vodacom portal if needed

### **Problem: "Phone not receiving prompt"**
**Solution:**
- Verify phone number format: 255712345678 ✅
- Wrong formats: 0712345678 ❌, +255 712 345 678 ❌
- Ensure customer has Vodacom (not Tigo/Airtel)
- Check customer's phone has M-Pesa activated

### **Problem: "INS-2001 Insufficient Balance"**
**Solution:**
- Customer doesn't have enough money in M-Pesa
- Ask them to check: *150*00#
- They need to add money first

### **Problem: "Callback not received"**
**Solution:**
- Make sure API_URL is publicly accessible
- For local testing, use ngrok: `ngrok http 3333`
- Update .env with ngrok URL: `API_URL=https://abc123.ngrok.io`
- Check ngrok dashboard: http://127.0.0.1:4040

---

## 📞 SUPPORT

**Vodacom M-Pesa:**
- Call: 0753 000 000
- Visit: Any Vodacom shop
- Web: [m-pesa.vodacom.co.tz](https://m-pesa.vodacom.co.tz)

**Developer Portal:**
- Login: [developer.mpesa.vm.co.tz](https://developer.mpesa.vm.co.tz/)
- Docs: [developer.mpesa.vm.co.tz/apis](https://developer.mpesa.vm.co.tz/apis/)
- Support: Create ticket on portal

---

## ✅ CHECKLIST

**Before Launch:**
- [ ] Sandbox test passes ✅
- [ ] Real payment test works (small amount) ✅
- [ ] M-Pesa business account approved
- [ ] Production API credentials obtained
- [ ] Backend server deployed (AWS/DigitalOcean)
- [ ] Public URL configured for callbacks
- [ ] Database set up for revenue tracking
- [ ] Customer support phone/WhatsApp ready
- [ ] Marketing materials prepared (Swahili + English)
- [ ] First 10 pilot customers identified

**Launch Day:**
- [ ] Server running in production mode
- [ ] Monitoring/alerts configured
- [ ] Customer support team ready
- [ ] Social media posts scheduled
- [ ] Payment confirmation SMS working
- [ ] Revenue tracking live

---

## 🎯 LAUNCH PLAN (4 WEEKS)

### **Week 1: Setup & Testing**
- Day 1: Get sandbox credentials
- Day 2: Test sandbox integration
- Day 3-5: Apply for production account
- Day 6-7: Test with real money (small amounts)

### **Week 2: Pilot**
- Find 10 farmers (friends, family, cooperative)
- Offer: FREE first alert + 50% off first month
- Collect: Feedback, testimonials, screenshots
- Fix: Any bugs or issues

### **Week 3: Soft Launch**
- Target: 50 paying customers
- Marketing: WhatsApp groups, farmer cooperatives
- Pricing: Launch special (30% off)
- Revenue goal: 5M TZS (~$2,200)

### **Week 4: Scale**
- Target: 200 paying customers
- Marketing: Radio ads, SMS campaigns
- Partnership: Farmer cooperatives (10% commission)
- Revenue goal: 20M TZS (~$8,700)

---

## 🏆 SUCCESS METRICS

### **Week 1:**
- ✅ Sandbox test passes
- ✅ Real payment works
- **Milestone:** First TZS 1,000 collected!

### **Week 2:**
- ✅ 10 pilot customers
- ✅ Positive feedback
- **Milestone:** First testimonial!

### **Week 3:**
- ✅ 50 paying customers
- ✅ 5M TZS revenue
- **Milestone:** First profitable week!

### **Week 4:**
- ✅ 200 paying customers
- ✅ 20M TZS revenue
- **Milestone:** Break-even achieved!

---

## 🚀 LET'S GO!

**You now have everything you need to:**
1. ✅ Accept M-Pesa payments in Tanzania
2. ✅ Test with real accounts
3. ✅ Start collecting real money
4. ✅ Scale to thousands of customers

**Timeline to First Dollar:**
- Today: Set up sandbox (5 minutes)
- This week: Get production account (2-3 days)
- Next week: First real payment! 💰

**TUTAANZA KUKUSANYA PESA!** (Let's start collecting money!)

**READY? RUN THIS NOW:**
```bash
cd backend
cp .env.tanzania.example .env
# Add your Vodacom API credentials
node test-tanzania-payment.js
```

**KARIBU! 🇹🇿🚀💰**
