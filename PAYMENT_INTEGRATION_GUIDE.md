# 💳 PAYMENT INTEGRATION GUIDE - HOW TO START COLLECTING MONEY

## 🎯 QUICK START: FROM CODE TO CASH IN 3 STEPS

### **Step 1: Set Up Payment Provider Accounts (1 Day)**

#### **M-Pesa (Required for Kenya/Tanzania - Our Primary Market):**

1. **Apply for M-Pesa Paybill/Till Number:**
   - Go to [Safaricom M-Pesa Portal](https://developer.safaricom.co.ke/)
   - Create account → Apply for API access
   - Get: Business Shortcode, Consumer Key, Consumer Secret, Passkey

2. **Add to `.env`:**
```bash
# M-Pesa Configuration
MPESA_ENABLED=true
MPESA_SHORTCODE=174379
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_PASSKEY=your_passkey_here
API_URL=https://api.kaicoin.io
```

3. **Test in Sandbox:**
```bash
# M-Pesa provides sandbox for testing
# Test phone: 254708374149
# Test amount: Any amount
# Result: Simulated payment without real money
```

---

#### **Stripe (For International Cards):**

1. **Create Stripe Account:**
   - Go to [stripe.com](https://stripe.com)
   - Sign up → Verify business
   - Get API keys from Dashboard

2. **Add to `.env`:**
```bash
# Stripe Configuration
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_your_key_here  # Use sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

---

#### **Paystack (For Nigeria/Ghana):**

1. **Create Paystack Account:**
   - Go to [paystack.com](https://paystack.com)
   - Sign up → Complete verification
   - Get API keys

2. **Add to `.env`:**
```bash
# Paystack Configuration
PAYSTACK_ENABLED=true
PAYSTACK_SECRET_KEY=sk_test_your_key_here
```

---

### **Step 2: Deploy Backend API (30 Minutes)**

#### **1. Install Dependencies:**
```bash
cd backend
npm install express axios uuid
```

#### **2. Start Backend Server:**
```bash
npm start
# Or for development:
npm run dev
```

#### **3. Verify Server is Running:**
```bash
curl http://localhost:3333/health
# Should return: {"status":"healthy"}
```

#### **4. Test Payment Endpoint:**
```bash
# Test M-Pesa payment
curl -X POST http://localhost:3333/api/climate/alert/buy \
  -H "Content-Type: application/json" \
  -d '{
    "alertType": "flood",
    "phone": "254712345678",
    "country": "KE",
    "paymentMethod": "mpesa"
  }'

# Expected response:
# {
#   "success": true,
#   "message": "Payment initiated successfully",
#   "alertType": "flood",
#   "price": 2600,
#   "currency": "KES",
#   "reference": "ALERT-FLOOD-abc123"
# }
```

---

### **Step 3: Start Collecting Real Money (Immediately)**

#### **Share Payment Link with Customers:**

**Example 1: WhatsApp Link**
```
Hi John! 👋

Get flood alerts to save your crops!

Price: KES 2,600 ($20) per alert
Payment: M-Pesa

Click to pay: https://api.kaicoin.io/pay/flood-alert

You'll receive M-Pesa prompt on your phone.
Enter PIN to confirm payment.

✅ Instant alert activation
✅ 48hr advance warning
✅ Save your harvest!

Questions? Reply to this message.
```

**Example 2: SMS Link**
```
KAI ALERT: Protect your farm from floods!
Pay KES 2,600 via M-Pesa
Dial *384*55*12345# OR
Click: kai.io/pay
```

**Example 3: USSD (For Basic Phones)**
```
Dial: *384*55*FLOOD#
Follow prompts to pay via M-Pesa
Alert activates instantly
```

---

## 💰 MONEY FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                     CUSTOMER PAYMENT JOURNEY                     │
└─────────────────────────────────────────────────────────────────┘

1. Customer Wants Alert
   ↓
   Farmer: "I need flood alert"

2. Initiates Payment
   ↓
   Opens link / Dials USSD / Scans QR code

3. Selects Payment Method
   ↓
   ┌──────────┬───────────┬──────────┐
   │  M-Pesa  │  Card     │  USSD    │
   └──────────┴───────────┴──────────┘

4. M-Pesa (Most Common in Kenya)
   ↓
   ┌─────────────────────────┐
   │ [Customer's Phone]       │
   │                         │
   │ Pay KES 2,600           │
   │ to KAI Intelligence     │
   │                         │
   │ [Enter M-Pesa PIN]      │
   │ [ * * * * ]            │
   │                         │
   │ [Cancel]  [OK]          │
   └─────────────────────────┘

5. Payment Processing
   ↓
   Customer enters PIN → M-Pesa verifies → Money deducted

6. Callback to Our Server
   ↓
   POST /api/payments/mpesa/callback
   {
     "ResultCode": 0,  // Success!
     "Amount": 2600,
     "MpesaReceiptNumber": "QEX7Y8Z9"
   }

7. We Record Revenue
   ↓
   Database: revenue table
   + Amount: 2,600 KES
   + USD equivalent: $20
   + Customer: 254712345678
   + Product: climate_alert_flood
   + Timestamp: 2025-12-30 14:30:00

8. Money Lands in Our Account
   ↓
   ┌───────────────────────────────┐
   │ M-Pesa Business Account       │
   │ KAI INTELLIGENCE LTD          │
   │                               │
   │ Balance: +2,600 KES           │
   │ Today: 156,000 KES            │
   │ This Month: 4,680,000 KES     │
   │                               │
   │ [Withdraw to Bank] [Send]     │
   └───────────────────────────────┘

9. Service Delivered
   ↓
   - Send flood alert to customer
   - SMS confirmation sent
   - Alert monitoring activated

10. Customer Happy = Repeat Business
    ↓
    Customer saves $2,000 crop
    Tells 10 friends
    Each friend subscribes
    = Network effects!
```

---

## 🔄 COMPLETE API USAGE EXAMPLES

### **Example 1: Farmer Buys Single Flood Alert (M-Pesa)**

**Frontend/App Code:**
```javascript
async function buyFloodAlert(phone) {
  const response = await fetch('https://api.kaicoin.io/api/climate/alert/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alertType: 'flood',
      phone: phone,
      country: 'KE',
      paymentMethod: 'mpesa'
    })
  });

  const result = await response.json();

  if (result.success) {
    alert(`Payment initiated! Check your phone for M-Pesa prompt.`);
    // Show: "Enter your M-Pesa PIN to complete payment"
    // Wait for callback confirmation...
  } else {
    alert(`Payment failed: ${result.error}`);
  }
}

// Usage:
buyFloodAlert('254712345678');
```

**What Customer Sees:**
1. Clicks "Buy Flood Alert" button
2. Popup: "Check your phone for payment prompt"
3. Phone vibrates → M-Pesa notification
4. Enters PIN
5. SMS: "Payment received! Flood alert activated ✅"

**What We Get:**
- ✅ +2,600 KES in M-Pesa account
- ✅ Revenue recorded in database
- ✅ Customer added to alert monitoring system

---

### **Example 2: Enterprise Subscribes to Premium Plan (Card Payment)**

**Frontend Code:**
```javascript
async function subscribeToPremium(email, cardToken) {
  const response = await fetch('https://api.kaicoin.io/api/climate/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: 'enterprise',
      email: email,
      country: 'US',
      paymentMethod: 'card',
      cardToken: cardToken  // From Stripe.js
    })
  });

  const result = await response.json();

  if (result.success) {
    console.log('Subscription activated!', result.subscription);
    // Store API key for customer
    localStorage.setItem('kai_api_key', result.apiKey);
  }
}
```

**What Enterprise Gets:**
- ✅ API key for programmatic access
- ✅ Unlimited alerts for 30 days
- ✅ Historical data access
- ✅ Priority support

**What We Get:**
- ✅ +$500 revenue (charged to card)
- ✅ Recurring revenue (auto-renews monthly)
- ✅ High-value customer

---

### **Example 3: Government Agency Pays for Disaster Response (Bank Transfer)**

**Manual Process (For Large Contracts):**
```javascript
// Agency requests quote
POST /api/disaster/quote
{
  "organizationType": "government",
  "region": "Coastal Kenya",
  "population": 500000,
  "duration": 12 // months
}

// We send invoice
Invoice #KAI-2025-001
Amount: $50,000
Services: 24/7 disaster monitoring for 500k people
Payment: Bank transfer to KAI Intelligence Ltd

// Agency pays via bank
Bank transfer received → Finance team confirms → Service activated
```

**What Agency Gets:**
- ✅ Real-time disaster monitoring
- ✅ Early warning system for 500k people
- ✅ Emergency coordination platform
- ✅ Monthly reports

**What We Get:**
- ✅ +$50,000 revenue
- ✅ Government contract (credibility boost)
- ✅ Case study for marketing

---

## 📊 REVENUE DASHBOARD (How to Track Money)

### **Database Schema for Revenue Tracking:**

```sql
CREATE TABLE revenue (
  id SERIAL PRIMARY KEY,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  usd_equivalent DECIMAL(12, 2) NOT NULL,
  provider VARCHAR(20) NOT NULL, -- 'mpesa', 'stripe', 'paystack'
  reference VARCHAR(100) UNIQUE NOT NULL,
  customer VARCHAR(100) NOT NULL, -- phone or email
  product VARCHAR(100) NOT NULL,
  pillar INT NOT NULL, -- 1-7
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_revenue_date ON revenue(created_at);
CREATE INDEX idx_revenue_pillar ON revenue(pillar);
CREATE INDEX idx_revenue_customer ON revenue(customer);
```

### **Query Revenue Stats:**

```javascript
// Get today's revenue
const todayRevenue = await db.query(`
  SELECT
    SUM(usd_equivalent) as total,
    COUNT(*) as transactions,
    COUNT(DISTINCT customer) as unique_customers
  FROM revenue
  WHERE DATE(created_at) = CURRENT_DATE
`);

// Get revenue by pillar
const byPillar = await db.query(`
  SELECT
    pillar,
    SUM(usd_equivalent) as revenue,
    COUNT(*) as transactions
  FROM revenue
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY pillar
  ORDER BY revenue DESC
`);

// Get top customers
const topCustomers = await db.query(`
  SELECT
    customer,
    SUM(usd_equivalent) as lifetime_value,
    COUNT(*) as transactions,
    MAX(created_at) as last_purchase
  FROM revenue
  GROUP BY customer
  ORDER BY lifetime_value DESC
  LIMIT 100
`);
```

### **Real-Time Revenue Display:**

```javascript
// API endpoint: GET /api/revenue/stats
{
  "today": {
    "revenue": 15640.50,
    "transactions": 782,
    "customers": 634
  },
  "month": {
    "revenue": 234567.89,
    "transactions": 12456,
    "customers": 8932
  },
  "byPillar": {
    "climate": 150000,
    "agriculture": 45000,
    "ai": 30000,
    "health": 6000,
    "disaster": 2000,
    "governance": 1000,
    "law": 567.89
  },
  "byProvider": {
    "mpesa": 180000,
    "stripe": 45000,
    "paystack": 9567.89
  }
}
```

---

## 🚀 GO-TO-MARKET: HOW TO GET FIRST 100 CUSTOMERS

### **Week 1: Soft Launch (Friends & Family)**

**Day 1-2: Set Up Accounts**
- ✅ Create M-Pesa business account
- ✅ Get Stripe account approved
- ✅ Deploy backend to production server

**Day 3-4: Test with 10 Friends**
```
Message to friends:
"Hi! I'm testing a new flood alert service.
FREE for first 10 people.
Can you try it and give feedback?
Link: [your-link]"
```

**Day 5-7: Fix Issues**
- Debug payment flows
- Improve UX based on feedback
- Add requested features

### **Week 2: Pilot Launch (100 Farmers)**

**Target: Farmer cooperatives in flood-prone areas**

**Messaging:**
```
Attention Farmers! 🌾

FLOOD ALERT SYSTEM NOW AVAILABLE

Get warned 48 hours before floods
Save your harvest!

💰 SPECIAL LAUNCH PRICE:
First month: KES 500 (90% off!)
Regular price: KES 6,500/month

✅ SMS alerts to your phone
✅ Works on any phone (even basic)
✅ Pay via M-Pesa

To join:
1. Dial *384*55#
2. Select "Flood Alerts"
3. Enter M-Pesa PIN
4. Done!

Questions? WhatsApp: +254123456789
```

**Distribution Channels:**
- Agricultural extension officers
- Farmer cooperative leaders
- SMS campaigns (buy bulk SMS credits)
- Community radio ads
- Church announcements
- Market day demos

### **Week 3: Scale to 1,000 Customers**

**Referral Program:**
```
Refer a friend → Get 1 free alert!

Your referral code: JOHN-KAI-2025
Share: https://kai.io/ref/JOHN-KAI-2025

For every friend who subscribes:
- They get 10% off
- You get 1 free alert
```

**Results:**
- 100 pilot customers
- 30% conversion rate
- 50% refer at least 1 friend
- = 150 customers by end of week

---

## 💡 PRICING STRATEGY (Maximize Revenue)

### **Psychological Pricing:**

**❌ Don't:** "Alert costs $20"
**✅ Do:** "Save $2,000 crop for only $20"

**❌ Don't:** "Subscribe for KES 6,500/month"
**✅ Do:** "Just KES 217/day to protect your farm"

### **Tiered Pricing (Good, Better, Best):**

```
┌─────────────┬──────────────┬──────────────┐
│   BASIC     │   PREMIUM    │  ENTERPRISE  │
├─────────────┼──────────────┼──────────────┤
│ KES 500/mo  │ KES 1,500/mo │  KES 5,000/mo│
│             │              │              │
│ 10 alerts   │ Unlimited    │ Unlimited +  │
│ Drought only│ All types    │ API access   │
│ SMS only    │ SMS + Email  │ Custom reports│
│             │              │              │
│ [Select]    │ [Select] ⭐  │ [Select]     │
└─────────────┴──────────────┴──────────────┘
                    ↑
            Most people choose this
```

**Result:**
- 70% choose Premium (most revenue)
- 20% choose Basic (still profitable)
- 10% choose Enterprise (highest LTV)

### **Seasonal Pricing:**

```javascript
// Flood season (March-May): Higher urgency → Higher prices
const floodSeasonPrice = 3000; // KES 3,000 vs 2,600 regular

// Drought season (July-Sept): Different alerts needed
const droughtSeasonPrice = 2000;

// Dynamic pricing based on risk score
if (riskScore > 80) {
  price = ALERT_URGENT; // 30 KAI
} else if (riskScore > 60) {
  price = ALERT_PREMIUM; // 20 KAI
} else {
  price = ALERT_BASIC; // 10 KAI
}
```

---

## 📞 CUSTOMER SUPPORT (Reduce Refunds, Increase Retention)

### **Common Issues & Solutions:**

**Issue 1: "Payment failed"**
```
Solution:
1. Check M-Pesa balance
2. Try again
3. If still fails, use USSD: *384*55#
4. Still failing? Contact support: +254123456789
```

**Issue 2: "Didn't receive alert"**
```
Solution:
1. Check SMS inbox (might be in spam)
2. Verify phone number is correct
3. Re-send alert manually
4. Refund if service failure on our end
```

**Issue 3: "Want refund"**
```
Policy:
- Full refund within 24 hours if no alerts sent
- Partial refund if service didn't work
- No refund if alerts were sent successfully

Process:
1. Customer requests refund via WhatsApp
2. Verify transaction in database
3. Process M-Pesa reversal (if eligible)
4. Confirm via SMS
```

---

## 🎯 SUCCESS METRICS

### **Track These KPIs:**

```javascript
// Daily tracking
const metrics = {
  revenue: {
    today: 15640.50,
    target: 20000,
    achievement: '78%'
  },
  customers: {
    new: 45,
    target: 50,
    churn: 2, // Lost customers
    retention: '96%'
  },
  transactions: {
    successful: 780,
    failed: 23,
    successRate: '97.1%'
  },
  averageOrderValue: 20.05,
  conversionRate: '12%', // Visitors to paying customers
  ltv: 1850, // Average lifetime value
  cac: 15 // Customer acquisition cost
};

// Target ratios
const healthMetrics = {
  ltvCacRatio: metrics.ltv / metrics.cac, // Should be > 3
  // 1850 / 15 = 123 ✅ Excellent!

  grossMargin: 0.995, // 99.5% (digital service)

  revenuePerCustomer: 20.05,
  targetRPC: 50 // Upsell opportunity
};
```

---

## ✅ DEPLOYMENT CHECKLIST

### **Before Going Live:**

- [ ] M-Pesa account approved and tested
- [ ] Stripe account verified (if targeting international)
- [ ] Backend deployed to production server (AWS/DigitalOcean)
- [ ] Database set up with revenue tables
- [ ] SSL certificate installed (HTTPS required for payments)
- [ ] Payment callback URLs publicly accessible
- [ ] Test transaction completed successfully
- [ ] Customer support phone/WhatsApp ready
- [ ] Refund policy documented
- [ ] Terms of service published
- [ ] Privacy policy published
- [ ] Monitoring/alerting set up (Sentry, etc.)

### **Production Environment Variables:**

```bash
# .env.production
NODE_ENV=production
PORT=3333

# M-Pesa Production
MPESA_ENABLED=true
MPESA_SHORTCODE=[YOUR_PRODUCTION_SHORTCODE]
MPESA_CONSUMER_KEY=[PRODUCTION_KEY]
MPESA_CONSUMER_SECRET=[PRODUCTION_SECRET]
MPESA_PASSKEY=[PRODUCTION_PASSKEY]

# Stripe Production
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_live_[YOUR_LIVE_KEY]

# Public URL
API_URL=https://api.kaicoin.io

# Database
DATABASE_URL=postgresql://user:pass@host:5432/kai_production

# Redis
REDIS_URL=redis://host:6379
```

---

## 🏆 THE BOTTOM LINE

**From Zero to Revenue in 3 Steps:**
1. ✅ Set up payment accounts (1 day)
2. ✅ Deploy backend API (30 minutes)
3. ✅ Share payment link (instant)

**First Transaction:**
- Farmer clicks link
- Enters M-Pesa PIN
- **Money in your account!** 💰

**Scale:**
- 10 customers/day × $20 = $200/day
- $200/day × 30 days = **$6,000/month**
- By month 3: 100 customers/day = **$60,000/month**

**This is REAL revenue from REAL customers solving REAL problems.**

**No speculation. No token pumping. Just pure profit.** 🚀

---

**READY TO LAUNCH? LET'S GO!** 💪
