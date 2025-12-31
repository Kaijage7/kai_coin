/**
 * 🇹🇿 Tanzania M-Pesa Payment Integration
 *
 * Vodacom M-Pesa API for Tanzania
 * Different from Kenya's Safaricom M-Pesa
 *
 * Docs: https://developer.mpesa.vm.co.tz/
 */

const axios = require('axios');
const crypto = require('crypto');

class TanzaniaPaymentProcessor {
    constructor() {
        this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
        this.apiUrl = this.environment === 'sandbox'
            ? 'https://openapi.m-pesa.com/sandbox'
            : 'https://openapi.m-pesa.com';

        this.publicKey = process.env.MPESA_PUBLIC_KEY;
        this.apiKey = process.env.MPESA_API_KEY;
        this.serviceProviderCode = process.env.MPESA_SERVICE_PROVIDER_CODE || '000000';
    }

    /**
     * @dev Get M-Pesa session key (valid for ~20 minutes)
     */
    async getSessionKey() {
        try {
            const response = await axios.get(
                `${this.apiUrl}/ipg/v2/vodacomTZN/getSession/`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'Origin': '*'
                    }
                }
            );

            if (response.data && response.data.output_SessionID) {
                console.log('✅ Tanzania M-Pesa session key obtained');
                return response.data.output_SessionID;
            } else {
                throw new Error('No session ID in response');
            }

        } catch (error) {
            console.error('❌ Tanzania M-Pesa session error:', error.response?.data || error.message);
            throw new Error('Failed to get M-Pesa session: ' + (error.response?.data?.output_ResponseDesc || error.message));
        }
    }

    /**
     * @dev Encrypt API key using public key (Tanzania M-Pesa requirement)
     */
    encryptAPIKey() {
        if (!this.publicKey) {
            console.warn('⚠️  No public key configured, using API key directly (sandbox mode)');
            return this.apiKey;
        }

        try {
            const buffer = Buffer.from(this.apiKey);
            const encrypted = crypto.publicEncrypt(
                {
                    key: this.publicKey,
                    padding: crypto.constants.RSA_PKCS1_PADDING
                },
                buffer
            );
            return encrypted.toString('base64');
        } catch (error) {
            console.warn('⚠️  Encryption failed, using API key directly:', error.message);
            return this.apiKey;
        }
    }

    /**
     * @dev Format phone number for Tanzania
     * Accepts: 0712345678, 712345678, 255712345678, +255712345678
     * Returns: 255712345678
     */
    formatPhoneNumber(phone) {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // Handle different formats
        if (cleaned.startsWith('255')) {
            return cleaned; // Already correct format
        } else if (cleaned.startsWith('0')) {
            return '255' + cleaned.substring(1); // 0712... → 255712...
        } else if (cleaned.length === 9) {
            return '255' + cleaned; // 712... → 255712...
        } else {
            throw new Error(`Invalid phone number format: ${phone}. Use 255712345678 or 0712345678`);
        }
    }

    /**
     * @dev Charge customer via Tanzania M-Pesa (C2B Payment)
     * @param phone Customer phone number (any format)
     * @param amount Amount in TZS (Tanzanian Shillings)
     * @param reference Unique transaction reference
     */
    async chargeMpesa(phone, amount, reference) {
        try {
            console.log('\n🇹🇿 Tanzania M-Pesa Payment Request');
            console.log('=====================================');

            // Format phone number
            const formattedPhone = this.formatPhoneNumber(phone);
            console.log(`📱 Phone: ${phone} → ${formattedPhone}`);
            console.log(`💰 Amount: TZS ${amount.toLocaleString()}`);
            console.log(`📝 Reference: ${reference}`);
            console.log(`🏢 Service Provider: ${this.serviceProviderCode}`);
            console.log(`🌐 Environment: ${this.environment.toUpperCase()}`);

            // Get session key
            console.log('\n⏳ Getting session key...');
            const sessionKey = await this.getSessionKey();

            // Prepare payment request
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

            console.log('\n📤 Sending payment request...');
            console.log('Payload:', JSON.stringify(payload, null, 2));

            // Send payment request
            const response = await axios.post(
                `${this.apiUrl}/ipg/v2/vodacomTZN/c2bPayment/singleStage/`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${sessionKey}`,
                        'Content-Type': 'application/json',
                        'Origin': '*'
                    },
                    timeout: 60000 // 60 second timeout
                }
            );

            console.log('\n📥 Response received:', JSON.stringify(response.data, null, 2));

            // Check response code
            if (response.data.output_ResponseCode === 'INS-0') {
                // Success!
                console.log('\n✅ Payment initiated successfully!');
                console.log('Customer will receive M-Pesa prompt on their phone.');

                return {
                    success: true,
                    provider: 'mpesa_tanzania',
                    reference: response.data.output_ConversationID || reference,
                    transactionId: response.data.output_TransactionID,
                    message: 'Payment prompt sent to customer phone',
                    amount: amount,
                    currency: 'TZS',
                    phone: formattedPhone,
                    responseCode: response.data.output_ResponseCode,
                    responseDesc: response.data.output_ResponseDesc
                };

            } else {
                // Failed
                console.log('\n❌ Payment failed');
                console.log('Response code:', response.data.output_ResponseCode);
                console.log('Response desc:', response.data.output_ResponseDesc);

                return {
                    success: false,
                    error: response.data.output_ResponseDesc || 'Payment request failed',
                    errorCode: response.data.output_ResponseCode,
                    provider: 'mpesa_tanzania'
                };
            }

        } catch (error) {
            console.error('\n💥 Payment error:', error.response?.data || error.message);

            return {
                success: false,
                error: error.response?.data?.output_ResponseDesc || error.message,
                errorCode: error.response?.data?.output_ResponseCode || 'NETWORK_ERROR',
                provider: 'mpesa_tanzania'
            };
        }
    }

    /**
     * @dev Handle M-Pesa callback (called when customer completes payment)
     */
    async handleMpesaCallback(callbackData) {
        console.log('\n📲 M-Pesa Callback Received');
        console.log('============================');
        console.log('Data:', JSON.stringify(callbackData, null, 2));

        try {
            const {
                output_ResponseCode,
                output_TransactionID,
                output_ConversationID,
                output_ThirdPartyConversationID,
                output_ResponseDesc
            } = callbackData;

            if (output_ResponseCode === 'INS-0') {
                // Payment successful!
                console.log('✅ Payment confirmed!');

                return {
                    success: true,
                    transactionId: output_TransactionID,
                    conversationId: output_ConversationID,
                    reference: output_ThirdPartyConversationID,
                    message: 'Payment completed successfully',
                    provider: 'mpesa_tanzania'
                };

            } else {
                // Payment failed or cancelled
                console.log('❌ Payment failed or cancelled');

                return {
                    success: false,
                    error: output_ResponseDesc || 'Payment cancelled by user',
                    errorCode: output_ResponseCode,
                    provider: 'mpesa_tanzania'
                };
            }

        } catch (error) {
            console.error('💥 Callback processing error:', error.message);

            return {
                success: false,
                error: error.message,
                provider: 'mpesa_tanzania'
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
     * @dev Get pricing for products in TZS
     */
    getPricing(product) {
        const usdPrices = {
            // Alerts
            'alert_flood': 20,
            'alert_drought': 15,
            'alert_cyclone': 30,
            'alert_locust': 25,
            'alert_disease': 20,

            // Subscriptions (slightly lower for TZ market)
            'subscription_basic': 30,     // $30/month vs $50 (more affordable)
            'subscription_premium': 80,   // $80/month vs $150
            'subscription_enterprise': 300, // $300/month vs $500

            // Other services
            'insurance': 50,
            'advisory': 100,
            'certification': 50
        };

        const usdPrice = usdPrices[product] || 20;
        const tzsPrice = this.calculateTZSPrice(usdPrice);

        return {
            product: product,
            price: tzsPrice,
            currency: 'TZS',
            usdEquivalent: usdPrice,
            displayPrice: `TZS ${tzsPrice.toLocaleString()}`,
            displayPriceSwahili: `Shilingi ${tzsPrice.toLocaleString()}`
        };
    }

    /**
     * @dev Check transaction status
     */
    async checkTransactionStatus(transactionId) {
        try {
            const sessionKey = await this.getSessionKey();

            const response = await axios.post(
                `${this.apiUrl}/ipg/v2/vodacomTZN/queryTransactionStatus/`,
                {
                    input_QueryReference: transactionId,
                    input_ServiceProviderCode: this.serviceProviderCode,
                    input_ThirdPartyConversationID: transactionId,
                    input_Country: 'TZN'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${sessionKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                status: response.data.output_ResponseCode,
                data: response.data
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @dev Record successful payment
     */
    async recordRevenue(paymentData) {
        // TODO: Save to database
        console.log('\n💾 Recording revenue...');
        console.log('Payment data:', paymentData);

        const revenue = {
            amount: paymentData.amount,
            currency: 'TZS',
            usdEquivalent: paymentData.amount / (parseInt(process.env.TZS_EXCHANGE_RATE) || 2300),
            provider: 'mpesa_tanzania',
            reference: paymentData.reference,
            customer: paymentData.customer,
            product: paymentData.product,
            timestamp: new Date(),
            status: 'completed'
        };

        console.log('Revenue record:', revenue);
        return revenue;
    }
}

module.exports = new TanzaniaPaymentProcessor();

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Farmer in Tanzania pays for flood alert
const payment = await TanzaniaPayment.chargeMpesa(
    '0754123456',  // or 255754123456
    46000,         // TZS 46,000 (~$20)
    'ALERT-FLOOD-12345'
);

// Customer gets M-Pesa prompt on phone:
// "Pay TZS 46,000 to KAI Intelligence for Climate Alert? Enter PIN:"

// When customer enters PIN, we receive callback


// Example 2: Get pricing
const pricing = TanzaniaPayment.getPricing('alert_flood');
console.log(pricing);
// {
//   product: 'alert_flood',
//   price: 46000,
//   currency: 'TZS',
//   usdEquivalent: 20,
//   displayPrice: 'TZS 46,000',
//   displayPriceSwahili: 'Shilingi 46,000'
// }


// Example 3: Check transaction status
const status = await TanzaniaPayment.checkTransactionStatus('TX123456');
console.log(status);
*/
