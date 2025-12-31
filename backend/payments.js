/**
 * 💰 KAI Payment Integration - Real Money Collection
 *
 * Integrates with multiple payment providers to accept real money from customers
 * Converts fiat → revenue → optional crypto settlement
 *
 * Supported:
 * - M-Pesa (Kenya, Tanzania) - Primary for farmers
 * - Stripe (Global cards)
 * - Paystack (Nigeria, Ghana)
 * - USSD (Feature phones)
 */

const axios = require('axios');

class PaymentProcessor {
    constructor() {
        this.providers = {
            mpesa: process.env.MPESA_ENABLED === 'true',
            stripe: process.env.STRIPE_ENABLED === 'true',
            paystack: process.env.PAYSTACK_ENABLED === 'true',
        };
    }

    // ============================================
    // M-PESA INTEGRATION (Primary for Africa)
    // ============================================

    /**
     * @dev Charge via M-Pesa (Kenya's mobile money - used by 99% of farmers)
     * @param phone Customer phone number (254712345678)
     * @param amount Amount in KES
     * @param reference Transaction reference
     */
    async chargeMpesa(phone, amount, reference) {
        try {
            // Get M-Pesa access token
            const token = await this.getMpesaToken();

            // Initiate STK Push (customer gets popup on phone to approve)
            const response = await axios.post(
                'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
                {
                    BusinessShortCode: process.env.MPESA_SHORTCODE,
                    Password: this.generateMpesaPassword(),
                    Timestamp: this.getTimestamp(),
                    TransactionType: 'CustomerPayBillOnline',
                    Amount: amount,
                    PartyA: phone, // Customer phone
                    PartyB: process.env.MPESA_SHORTCODE, // Your business number
                    PhoneNumber: phone,
                    CallBackURL: `${process.env.API_URL}/api/payments/mpesa/callback`,
                    AccountReference: reference,
                    TransactionDesc: 'KAI Intelligence Service'
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            return {
                success: true,
                provider: 'mpesa',
                reference: response.data.CheckoutRequestID,
                message: 'Payment prompt sent to customer phone',
                amount: amount,
                currency: 'KES'
            };

        } catch (error) {
            console.error('M-Pesa charge failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @dev M-Pesa callback - called when customer completes payment
     */
    async handleMpesaCallback(callbackData) {
        const { Body } = callbackData;
        const { stkCallback } = Body;

        if (stkCallback.ResultCode === 0) {
            // Payment successful!
            const amount = stkCallback.CallbackMetadata.Item.find(
                item => item.Name === 'Amount'
            ).Value;

            const phone = stkCallback.CallbackMetadata.Item.find(
                item => item.Name === 'PhoneNumber'
            ).Value;

            const mpesaReference = stkCallback.CallbackMetadata.Item.find(
                item => item.Name === 'MpesaReceiptNumber'
            ).Value;

            return {
                success: true,
                amount: amount,
                currency: 'KES',
                phone: phone,
                reference: mpesaReference,
                provider: 'mpesa'
            };
        } else {
            // Payment failed or cancelled
            return {
                success: false,
                error: stkCallback.ResultDesc
            };
        }
    }

    // ============================================
    // STRIPE INTEGRATION (Cards - Global)
    // ============================================

    /**
     * @dev Charge credit/debit card via Stripe
     */
    async chargeStripe(customerId, amount, currency = 'USD') {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount * 100, // Convert to cents
                currency: currency.toLowerCase(),
                customer: customerId,
                description: 'KAI Intelligence Service',
                metadata: {
                    service: 'kai-intelligence'
                }
            });

            return {
                success: true,
                provider: 'stripe',
                reference: paymentIntent.id,
                amount: amount,
                currency: currency.toUpperCase(),
                clientSecret: paymentIntent.client_secret
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============================================
    // PAYSTACK INTEGRATION (Nigeria, Ghana)
    // ============================================

    /**
     * @dev Charge via Paystack (Nigeria's leading payment gateway)
     */
    async chargePaystack(email, amount, currency = 'NGN') {
        try {
            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email: email,
                    amount: amount * 100, // Convert to kobo
                    currency: currency,
                    callback_url: `${process.env.API_URL}/api/payments/paystack/callback`
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                    }
                }
            );

            return {
                success: true,
                provider: 'paystack',
                reference: response.data.data.reference,
                authorizationUrl: response.data.data.authorization_url,
                amount: amount,
                currency: currency
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============================================
    // USSD INTEGRATION (Feature Phones)
    // ============================================

    /**
     * @dev Generate USSD code for payment (works on basic phones)
     * Example: *384*55*12345# to pay
     */
    generateUSSDCode(amount, reference) {
        // Africa's Talking USSD implementation
        const shortcode = process.env.USSD_SHORTCODE || '384';
        const serviceCode = process.env.USSD_SERVICE_CODE || '55';

        return {
            ussdCode: `*${shortcode}*${serviceCode}*${reference}#`,
            instructions: `Dial *${shortcode}*${serviceCode}*${reference}# on your phone to pay ${amount} KES`,
            amount: amount,
            reference: reference
        };
    }

    // ============================================
    // UNIFIED PAYMENT INTERFACE
    // ============================================

    /**
     * @dev Smart payment router - automatically selects best method
     */
    async processPayment(paymentData) {
        const { method, amount, customer } = paymentData;

        // Route to appropriate provider
        switch (method) {
            case 'mpesa':
                return await this.chargeMpesa(
                    customer.phone,
                    amount,
                    paymentData.reference
                );

            case 'card':
                return await this.chargeStripe(
                    customer.id,
                    amount,
                    customer.currency || 'USD'
                );

            case 'paystack':
                return await this.chargePaystack(
                    customer.email,
                    amount,
                    'NGN'
                );

            case 'ussd':
                return this.generateUSSDCode(amount, paymentData.reference);

            default:
                return {
                    success: false,
                    error: 'Unsupported payment method'
                };
        }
    }

    // ============================================
    // PRICING CALCULATOR
    // ============================================

    /**
     * @dev Calculate price in local currency
     */
    calculateLocalPrice(usdAmount, currency) {
        const rates = {
            'KES': 130,  // 1 USD = 130 KES (Kenya Shilling)
            'NGN': 750,  // 1 USD = 750 NGN (Nigerian Naira)
            'TZS': 2300, // 1 USD = 2300 TZS (Tanzanian Shilling)
            'UGX': 3700, // 1 USD = 3700 UGX (Ugandan Shilling)
            'GHS': 12,   // 1 USD = 12 GHS (Ghanaian Cedi)
            'USD': 1
        };

        const rate = rates[currency] || 1;
        return Math.round(usdAmount * rate);
    }

    /**
     * @dev Get pricing for a product in customer's local currency
     */
    getPricing(product, country) {
        const basePrices = {
            'alert': 20,        // $20 per alert
            'subscription_basic': 50,
            'subscription_premium': 150,
            'subscription_enterprise': 500,
            'api_call': 5,
            'data_access': 100
        };

        const currencyMap = {
            'KE': 'KES', 'TZ': 'TZS', 'UG': 'UGX',
            'NG': 'NGN', 'GH': 'GHS', 'US': 'USD'
        };

        const currency = currencyMap[country] || 'USD';
        const basePrice = basePrices[product] || 20;
        const localPrice = this.calculateLocalPrice(basePrice, currency);

        return {
            product: product,
            price: localPrice,
            currency: currency,
            usdEquivalent: basePrice,
            displayPrice: `${currency} ${localPrice.toLocaleString()}`
        };
    }

    // ============================================
    // REVENUE TRACKING
    // ============================================

    /**
     * @dev Record successful payment
     */
    async recordRevenue(paymentData) {
        const db = require('./database');

        const revenue = {
            amount: paymentData.amount,
            currency: paymentData.currency,
            usdEquivalent: this.convertToUSD(paymentData.amount, paymentData.currency),
            provider: paymentData.provider,
            reference: paymentData.reference,
            customer: paymentData.customer,
            product: paymentData.product,
            timestamp: new Date(),
            status: 'completed'
        };

        await db.revenue.insert(revenue);

        // Update metrics
        await this.updateMetrics(revenue);

        return revenue;
    }

    /**
     * @dev Convert any currency to USD for metrics
     */
    convertToUSD(amount, currency) {
        const rates = {
            'KES': 0.0077,  // 1 KES = 0.0077 USD
            'NGN': 0.0013,  // 1 NGN = 0.0013 USD
            'TZS': 0.00043, // 1 TZS = 0.00043 USD
            'USD': 1
        };

        return amount * (rates[currency] || 1);
    }

    /**
     * @dev Update revenue metrics
     */
    async updateMetrics(revenue) {
        const db = require('./database');
        const usdAmount = revenue.usdEquivalent;

        await db.metrics.increment('total_revenue', usdAmount);
        await db.metrics.increment('monthly_revenue', usdAmount);
        await db.metrics.increment('daily_revenue', usdAmount);
        await db.metrics.increment(`revenue_${revenue.provider}`, usdAmount);
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    async getMpesaToken() {
        const auth = Buffer.from(
            `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
        ).toString('base64');

        const response = await axios.get(
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    Authorization: `Basic ${auth}`
                }
            }
        );

        return response.data.access_token;
    }

    generateMpesaPassword() {
        const timestamp = this.getTimestamp();
        const passkey = process.env.MPESA_PASSKEY;
        const shortcode = process.env.MPESA_SHORTCODE;

        return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    }

    getTimestamp() {
        const date = new Date();
        return date.getFullYear() +
            ('0' + (date.getMonth() + 1)).slice(-2) +
            ('0' + date.getDate()).slice(-2) +
            ('0' + date.getHours()).slice(-2) +
            ('0' + date.getMinutes()).slice(-2) +
            ('0' + date.getSeconds()).slice(-2);
    }
}

module.exports = new PaymentProcessor();

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Farmer pays for flood alert via M-Pesa
const payment = await PaymentProcessor.processPayment({
    method: 'mpesa',
    amount: 2000, // 2000 KES
    reference: 'ALERT-12345',
    customer: {
        phone: '254712345678',
        name: 'John Farmer'
    }
});

// Customer gets popup on phone to approve
// When approved, you receive money in M-Pesa business account


// Example 2: Enterprise customer pays via card
const payment = await PaymentProcessor.processPayment({
    method: 'card',
    amount: 500, // $500 USD
    customer: {
        id: 'cus_123',
        email: 'company@example.com',
        currency: 'USD'
    }
});


// Example 3: Get pricing for Nigerian farmer
const pricing = PaymentProcessor.getPricing('alert', 'NG');
// Returns: { price: 15000, currency: 'NGN', displayPrice: 'NGN 15,000' }


// Example 4: Record revenue
await PaymentProcessor.recordRevenue({
    amount: 2000,
    currency: 'KES',
    provider: 'mpesa',
    reference: 'MPesa-ABC123',
    customer: 'user_456',
    product: 'flood_alert'
});
*/
