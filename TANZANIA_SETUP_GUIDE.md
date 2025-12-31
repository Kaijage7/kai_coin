# 🇹🇿 TANZANIA M-PESA INTEGRATION & TESTING GUIDE

## 🎯 QUICK START FOR TANZANIA

Tanzania uses **Vodacom M-Pesa** (similar to Kenya's Safaricom M-Pesa). Here's how to integrate and test with real accounts.

---

## 📱 STEP 1: GET VODACOM M-PESA BUSINESS ACCOUNT (2-3 Days)

### **Option A: M-Pesa for Business (Recommended)**

**Requirements:**
- Business registration certificate (TIN number)
- Business license
- ID of business owner
- Business bank account

**Application Process:**
1. Visit any Vodacom shop in Tanzania
2. Ask for "M-Pesa for Business" or "Lipa Kwa M-Pesa" account
3. Fill application form
4. Submit documents
5. Wait 2-3 days for approval
6. Get: Business Number (like 123456), Till Number, API credentials

**Cost:**
- Application: FREE
- Transaction fees: 0% for first 3 months (promotion)
- After that: 3% of transaction value

---

### **Option B: M-Pesa API Sandbox (For Testing First)**

**For immediate testing without business account:**

1. **Visit Vodacom M-Pesa Developer Portal:**
   - URL: [developer.mpesa.vm.co.tz](https://developer.mpesa.vm.co.tz)
   - Sign up for free account
   - Access sandbox environment

2. **Get Sandbox Credentials:**
```bash
# Sandbox credentials (example - get yours from portal)
API_ENVIRONMENT=sandbox
MPESA_PUBLIC_KEY=your_sandbox_public_key
MPESA_API_KEY=your_sandbox_api_key
MPESA_SESSION_KEY=your_sandbox_session_key
```

3. **Test Numbers for Sandbox:**
```
Test Customer Phone: 255712345678
Test Business Short Code: 000000
Test Amount: Any amount (no real money)
Test Result: Always success in sandbox
```

---

## 💻 STEP 2: CONFIGURE BACKEND FOR TANZANIA

### **Update `.env` File:**

```bash
# ==============================================
# TANZANIA M-PESA CONFIGURATION
# ==============================================

# Environment: 'sandbox' for testing, 'production' for real
MPESA_ENVIRONMENT=sandbox

# Vodacom M-Pesa Tanzania API
MPESA_ENABLED=true
MPESA_COUNTRY=TZ
MPESA_API_URL=https://openapi.m-pesa.com  # Production
# MPESA_API_URL=https://sandbox.m-pesa.com  # Sandbox

# Your credentials (from Vodacom)
MPESA_PUBLIC_KEY=your_public_key_here
MPESA_API_KEY=your_api_key_here
MPESA_SERVICE_PROVIDER_CODE=your_business_number  # e.g., 123456

# Callback URL (must be publicly accessible)
API_URL=https://your-domain.com
# For local testing, use ngrok: https://abc123.ngrok.io

# Currency
DEFAULT_CURRENCY=TZS

# ==============================================
# TANZANIA PRICING
# ==============================================

# Exchange rate (1 USD = X TZS)
TZS_EXCHANGE_RATE=2300

# Sample pricing in Tanzanian Shillings
# Flood alert: $20 = 46,000 TZS
# Drought alert: $15 = 34,500 TZS
# Premium subscription: $150 = 345,000 TZS
```

---

## 🔧 STEP 3: MODIFY PAYMENT PROCESSOR FOR TANZANIA

### **Create Tanzania M-Pesa Integration:**

**File:** `backend/payments-tanzania.js`

```javascript
/**
 * 🇹🇿 Tanzania M-Pesa Payment Integration
 * Uses Vodacom M-Pesa API (different from Kenya's Safaricom)
 */

const axios = require('axios');
const crypto = require('crypto');

class TanzaniaPaymentProcessor {
  constructor() {
    this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    this.apiUrl = process.env.MPESA_API_URL || 'https://openapi.m-pesa.com';
    this.publicKey = process.env.MPESA_PUBLIC_KEY;
    this.apiKey = process.env.MPESA_API_KEY;
    this.serviceProviderCode = process.env.MPESA_SERVICE_PROVIDER_CODE;
  }

  /**
   * @dev Get M-Pesa session key (similar to access token in Kenya)
   */
  async getSessionKey() {
    try {
      const response = await axios.get(
        `${this.apiUrl}/sandbox/ipg/v2/vodacomTZN/getSession/`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.output_SessionID;
    } catch (error) {
      console.error('Tanzania M-Pesa session error:', error.message);
      throw new Error('Failed to get M-Pesa session');
    }
  }

  /**
   * @dev Charge customer via Tanzania M-Pesa
   * @param phone Customer phone (255712345678)
   * @param amount Amount in TZS
   * @param reference Transaction reference
   */
  async chargeMpesa(phone, amount, reference) {
    try {
      // Clean phone number (remove +, spaces)
      const cleanPhone = phone.replace(/[\s+]/g, '');

      // Ensure phone starts with 255 (Tanzania country code)
      const formattedPhone = cleanPhone.startsWith('255')
        ? cleanPhone
        : '255' + cleanPhone.replace(/^0/, '');

      // Get session key
      const sessionKey = await this.getSessionKey();

      // Customer to Business (C2B) payment request
      const payload = {
        input_Amount: amount.toString(),
        input_CustomerMSISDN: formattedPhone,
        input_Country: 'TZN',
        input_Currency: 'TZS',
        input_ServiceProviderCode: this.serviceProviderCode,
        input_ThirdPartyConversationID: reference,
        input_TransactionReference: reference,
        input_PurchasedItemsDesc: 'KAI Climate Intelligence Service'
      };

      const response = await axios.post(
        `${this.apiUrl}/sandbox/ipg/v2/vodacomTZN/c2bPayment/singleStage/`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${sessionKey}`,
            'Content-Type': 'application/json',
            'Origin': '*'
          }
        }
      );

      // Check response
      if (response.data.output_ResponseCode === 'INS-0') {
        return {
          success: true,
          provider: 'mpesa_tz',
          reference: response.data.output_ConversationID,
          transactionId: response.data.output_TransactionID,
          message: 'Payment initiated. Customer will receive M-Pesa prompt.',
          amount: amount,
          currency: 'TZS'
        };
      } else {
        return {
          success: false,
          error: response.data.output_ResponseDesc || 'Payment failed'
        };
      }

    } catch (error) {
      console.error('Tanzania M-Pesa charge error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.output_ResponseDesc || error.message
      };
    }
  }

  /**
   * @dev Handle M-Pesa callback (payment confirmation)
   */
  async handleMpesaCallback(callbackData) {
    try {
      const { output_ResponseCode, output_TransactionID, output_ConversationID } = callbackData;

      if (output_ResponseCode === 'INS-0') {
        // Payment successful
        return {
          success: true,
          transactionId: output_TransactionID,
          conversationId: output_ConversationID,
          provider: 'mpesa_tz'
        };
      } else {
        // Payment failed
        return {
          success: false,
          error: callbackData.output_ResponseDesc || 'Payment failed'
        };
      }
    } catch (error) {
      console.error('Callback error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * @dev Calculate price in Tanzanian Shillings
   */
  calculateTZSPrice(usdAmount) {
    const rate = parseInt(process.env.TZS_EXCHANGE_RATE) || 2300;
    return Math.round(usdAmount * rate);
  }

  /**
   * @dev Get pricing for Tanzania
   */
  getPricing(product) {
    const usdPrices = {
      'alert_flood': 20,
      'alert_drought': 15,
      'alert_cyclone': 30,
      'subscription_basic': 50,
      'subscription_premium': 150,
      'subscription_enterprise': 500
    };

    const usdPrice = usdPrices[product] || 20;
    const tzsPrice = this.calculateTZSPrice(usdPrice);

    return {
      product: product,
      price: tzsPrice,
      currency: 'TZS',
      usdEquivalent: usdPrice,
      displayPrice: `TZS ${tzsPrice.toLocaleString()}`
    };
  }
}

module.exports = new TanzaniaPaymentProcessor();
```

---

## 🧪 STEP 4: TEST WITH SANDBOX (NO REAL MONEY)

### **Test Script:**

Create `backend/test-tanzania-payment.js`:

```javascript
const TanzaniaPayment = require('./payments-tanzania');

async function testPayment() {
  console.log('🇹🇿 Testing Tanzania M-Pesa Payment...\n');

  // Test data
  const testData = {
    phone: '255712345678',  // Sandbox test number
    amount: 46000,          // 46,000 TZS ($20)
    reference: `TEST-${Date.now()}`
  };

  console.log('Test Data:', testData);
  console.log('\nInitiating payment...\n');

  try {
    const result = await TanzaniaPayment.chargeMpesa(
      testData.phone,
      testData.amount,
      testData.reference
    );

    console.log('Payment Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ SUCCESS! Payment initiated.');
      console.log('Transaction ID:', result.transactionId);
      console.log('Reference:', result.reference);
      console.log('\nIn production, customer would receive M-Pesa prompt on their phone.');
    } else {
      console.log('\n❌ FAILED:', result.error);
    }

  } catch (error) {
    console.error('\n💥 ERROR:', error.message);
  }
}

// Run test
testPayment();
```

### **Run Test:**

```bash
cd backend
node test-tanzania-payment.js
```

**Expected Output (Sandbox):**
```
🇹🇿 Testing Tanzania M-Pesa Payment...

Test Data: {
  phone: '255712345678',
  amount: 46000,
  reference: 'TEST-1735567890123'
}

Initiating payment...

Payment Result: {
  "success": true,
  "provider": "mpesa_tz",
  "reference": "AG_20251230_123456789",
  "transactionId": "TX12345678",
  "message": "Payment initiated. Customer will receive M-Pesa prompt.",
  "amount": 46000,
  "currency": "TZS"
}

✅ SUCCESS! Payment initiated.
Transaction ID: TX12345678
Reference: AG_20251230_123456789

In production, customer would receive M-Pesa prompt on their phone.
```

---

## 📲 STEP 5: TEST WITH REAL ACCOUNT (SMALL AMOUNT)

### **Once You Have Business Account:**

**Test with Real Money (Small Amount First):**

```javascript
// Use your real phone number
const realTest = {
  phone: '255754123456',  // Your real Vodacom number
  amount: 1000,           // 1,000 TZS (~$0.43) - small test
  reference: 'REAL-TEST-001'
};

// Switch to production mode in .env
MPESA_ENVIRONMENT=production
MPESA_API_URL=https://openapi.m-pesa.com

// Run payment
const result = await TanzaniaPayment.chargeMpesa(
  realTest.phone,
  realTest.amount,
  realTest.reference
);
```

**What Happens:**
1. API call sent to Vodacom M-Pesa
2. You receive SMS on your phone: "M-Pesa request from KAI. Pay TZS 1,000? Reply with PIN"
3. You enter your M-Pesa PIN
4. Payment confirmed!
5. Money deducted from your M-Pesa balance
6. Money arrives in your M-Pesa business account

**Check Balance:**
- Dial: *150*00#
- Select: My Account → Account Balance
- You should see +1,000 TZS!

---

## 🌐 STEP 6: SET UP NGROK FOR LOCAL TESTING

M-Pesa needs a public URL for callbacks. Use ngrok to expose your local server:

### **Install ngrok:**
```bash
# Download from https://ngrok.com
# Or install via package manager
brew install ngrok  # Mac
choco install ngrok  # Windows
sudo snap install ngrok  # Linux

# Authenticate (free account)
ngrok authtoken your_auth_token
```

### **Start ngrok:**
```bash
# Expose port 3333 (your backend server)
ngrok http 3333
```

**Output:**
```
ngrok

Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.0.0
Region                        United States (us)
Latency                       45ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok.io -> http://localhost:3333

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

### **Update .env with ngrok URL:**
```bash
API_URL=https://abc123.ngrok.io
```

**Now M-Pesa can send callbacks to:**
```
https://abc123.ngrok.io/api/payments/mpesa/callback
```

---

## 💡 TANZANIA-SPECIFIC PRICING

### **Local Market Pricing (in TZS):**

```javascript
// Competitive pricing for Tanzania market
const tanzaniaPricing = {
  // Pay-per-alert
  'flood_alert': {
    usd: 20,
    tzs: 46000,
    display: 'TZS 46,000'
  },
  'drought_alert': {
    usd: 15,
    tzs: 34500,
    display: 'TZS 34,500'
  },

  // Subscriptions (more affordable for local market)
  'basic_monthly': {
    usd: 30,      // Reduced from $50 for TZ market
    tzs: 69000,
    display: 'TZS 69,000/mwezi'  // "per month" in Swahili
  },
  'premium_monthly': {
    usd: 80,      // Reduced from $150
    tzs: 184000,
    display: 'TZS 184,000/mwezi'
  },

  // Comparison with local competition
  'competitor_weather_service': 100000,  // TZS/month
  'kai_advantage': 'Lower price + AI intelligence!'
};
```

### **Value Proposition for Tanzania:**

**In Swahili:**
```
🌾 LINDA MAZAO YAKO!

Pata tahadhari za mafuriko kabla haijatokea!
💰 Bei: TZS 46,000 tu
📱 Lipa kwa M-Pesa
⏰ Tahadhari saa 48 kabla ya mafuriko

✅ Okoa mazao yako
✅ Pata taarifa kwa SMS
✅ Inafanya kazi kwa simu zote

Bonyeza kulipia: https://kai.io/tz
```

**English Translation:**
```
🌾 PROTECT YOUR CROPS!

Get flood warnings before they happen!
💰 Price: Just TZS 46,000
📱 Pay via M-Pesa
⏰ 48-hour advance warning

✅ Save your harvest
✅ SMS notifications
✅ Works on all phones

Click to pay: https://kai.io/tz
```

---

## 📊 TANZANIA MARKET SIZE

### **Total Addressable Market:**

**Agriculture:**
- Total farmers in Tanzania: ~10 million
- Smartphone penetration: ~40%
- M-Pesa users: ~15 million (65% of adult population)

**Target Segment (Year 1):**
- Commercial farmers with >5 acres: ~500,000
- M-Pesa users in flood-prone areas: ~200,000
- **Realistic target: 10,000 farmers (2% conversion)**

**Revenue Potential:**
- 10,000 farmers × TZS 184,000/month average = TZS 1.84B/month
- **= TZS 22B/year = $9.6M USD/year from Tanzania alone!**

---

## ✅ LAUNCH CHECKLIST FOR TANZANIA

### **Week 1: Setup**
- [ ] Apply for Vodacom M-Pesa business account
- [ ] Get API credentials (sandbox first)
- [ ] Deploy Tanzania payment integration
- [ ] Test in sandbox with test numbers
- [ ] Set up ngrok for callbacks

### **Week 2: Testing**
- [ ] Test with real M-Pesa account (small amounts)
- [ ] Verify callbacks work correctly
- [ ] Test edge cases (insufficient balance, wrong PIN, etc.)
- [ ] Create Swahili translations for SMS/messages

### **Week 3: Soft Launch**
- [ ] Find 10 pilot farmers (friends, family, cooperative)
- [ ] Offer free trial for first week
- [ ] Collect feedback in Swahili
- [ ] Fix any issues

### **Week 4: Go Live**
- [ ] Launch marketing campaign (radio, SMS, WhatsApp)
- [ ] Target: 100 paying customers
- [ ] Revenue goal: TZS 18.4M (~$8,000)
- [ ] Celebrate first real revenue! 🎉

---

## 🚨 COMMON ISSUES & SOLUTIONS

### **Issue: "Customer not receiving M-Pesa prompt"**
**Solutions:**
- Check phone number format (must start with 255)
- Ensure customer has Vodacom (not Tigo/Airtel)
- Verify M-Pesa service is active on customer phone
- Check if customer has sufficient balance

### **Issue: "Callback not received"**
**Solutions:**
- Verify ngrok is running
- Check callback URL is publicly accessible
- Look at ngrok web interface (http://127.0.0.1:4040) for incoming requests
- Ensure API_URL in .env matches ngrok URL

### **Issue: "Payment fails with 'INS-2001'"**
**Solutions:**
- This means insufficient balance
- Ask customer to check M-Pesa balance
- Retry with smaller amount for testing

### **Issue: "Invalid API key"**
**Solutions:**
- Check credentials from Vodacom portal
- Ensure using correct environment (sandbox vs production)
- Regenerate API key if needed

---

## 💰 WITHDRAWAL TO BANK

### **How to Get Money from M-Pesa to Bank:**

1. **Link M-Pesa to Bank Account:**
   - Dial: *150*00#
   - Select: Send Money → To Bank Account
   - Enter bank details
   - Link account (one-time setup)

2. **Transfer Money:**
   - Dial: *150*00#
   - Select: Send Money → To Bank Account
   - Enter amount
   - Enter PIN
   - Money arrives in bank within 24 hours

3. **Fees:**
   - TZS 0 - 10,000: No fee
   - TZS 10,001 - 100,000: 1% fee
   - Above 100,000: Contact Vodacom for bulk rates

---

## 🎯 NEXT STEPS

### **Today:**
1. ✅ Set up Vodacom M-Pesa developer account
2. ✅ Get sandbox credentials
3. ✅ Test payment integration
4. ✅ Verify callbacks work

### **This Week:**
1. ⏳ Apply for M-Pesa business account
2. ⏳ Test with real phone (small amount)
3. ⏳ Create Swahili marketing materials
4. ⏳ Find 10 pilot customers

### **Next Week:**
1. ⏳ Launch soft test with 10 farmers
2. ⏳ Collect first real revenue!
3. ⏳ Get testimonials
4. ⏳ Scale to 100 customers

---

## 🏆 SUCCESS METRICS

**Target for Tanzania (Year 1):**
- Month 1: 100 farmers × TZS 100,000 = TZS 10M ($4.3k)
- Month 3: 500 farmers × TZS 150,000 = TZS 75M ($32.6k)
- Month 6: 2,000 farmers × TZS 150,000 = TZS 300M ($130k)
- Month 12: 10,000 farmers × TZS 180,000 = **TZS 1.8B ($782k)**

**By Year 3:**
- 100,000 farmers in Tanzania
- TZS 18B/year revenue
- **= $7.8M USD from Tanzania market alone!**

---

**KARIBU TANZANIA! LET'S START TESTING! 🇹🇿💰**

**Whatsapp/Call:** Your number here
**Email:** support@kaicoin.io
**Website:** kaicoin.io/tz

**TUTAANZA KUKUSANYA PESA!** (Let's start collecting money!) 🚀
