/**
 * 💰 KAI Revenue API - All 7 Pillars Integration
 *
 * Connects payment system to each pillar's services
 * Enables farmers to pay with M-Pesa, cards, or USSD
 */

const express = require('express');
const router = express.Router();
const PaymentProcessor = require('../payments');
const { v4: uuidv4 } = require('uuid');

// ============================================
// PILLAR 1: CLIMATE INTELLIGENCE
// ============================================

/**
 * @route POST /api/climate/alert/buy
 * @desc Purchase a climate alert (flood, drought, etc.)
 * @access Public
 */
router.post('/climate/alert/buy', async (req, res) => {
    try {
        const { alertType, phone, email, country, paymentMethod } = req.body;

        // Validate input
        if (!alertType || !paymentMethod) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get pricing based on alert type and country
        const pricing = {
            'flood': 20,      // $20 per flood alert
            'drought': 15,    // $15 per drought alert
            'cyclone': 30,    // $30 per cyclone alert (urgent)
            'locust': 25,     // $25 per locust swarm alert
            'disease': 20,    // $20 per crop disease alert
            'heatwave': 15,   // $15 per heatwave alert
            'wildfire': 30    // $30 per wildfire alert (urgent)
        };

        const basePrice = pricing[alertType] || 20;
        const priceInfo = PaymentProcessor.getPricing('alert', country);
        const localPrice = priceInfo.price;
        const currency = priceInfo.currency;

        // Generate transaction reference
        const reference = `ALERT-${alertType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        // Process payment
        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: localPrice,
            reference: reference,
            customer: { phone, email, currency, country }
        });

        if (payment.success) {
            // Record revenue
            await PaymentProcessor.recordRevenue({
                amount: localPrice,
                currency: currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone || email,
                product: `climate_alert_${alertType}`
            });

            return res.json({
                success: true,
                message: 'Payment initiated successfully',
                alertType: alertType,
                price: localPrice,
                currency: currency,
                reference: payment.reference,
                paymentDetails: payment
            });
        } else {
            return res.status(400).json({
                success: false,
                error: payment.error
            });
        }

    } catch (error) {
        console.error('Climate alert purchase error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/climate/subscription
 * @desc Subscribe to climate intelligence service
 */
router.post('/climate/subscription', async (req, res) => {
    try {
        const { plan, phone, email, country, paymentMethod } = req.body;

        const pricing = {
            'basic': 50,      // $50/month - 10 alerts, drought only
            'premium': 150,   // $150/month - Unlimited alerts, all types
            'enterprise': 500 // $500/month - API access + historical data
        };

        const basePrice = pricing[plan] || 50;
        const priceInfo = PaymentProcessor.calculateLocalPrice(basePrice, country);
        const reference = `SUB-CLIMATE-${plan.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, email, currency: priceInfo.currency, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone || email,
                product: `climate_subscription_${plan}`
            });

            return res.json({
                success: true,
                subscription: {
                    plan: plan,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    reference: payment.reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Climate subscription error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 2: AGRICULTURE INTELLIGENCE
// ============================================

/**
 * @route POST /api/agriculture/insurance
 * @desc Purchase crop insurance powered by KAI intelligence
 */
router.post('/agriculture/insurance', async (req, res) => {
    try {
        const { cropType, acreage, coverageAmount, phone, country, paymentMethod } = req.body;

        // Insurance pricing: 5% of coverage amount
        const premiumRate = 0.05;
        const basePrice = coverageAmount * premiumRate;
        const priceInfo = PaymentProcessor.getPricing('subscription_premium', country);
        const reference = `INS-${cropType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: basePrice,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: basePrice,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: `agriculture_insurance_${cropType}`
            });

            return res.json({
                success: true,
                insurance: {
                    cropType: cropType,
                    acreage: acreage,
                    coverageAmount: coverageAmount,
                    premium: basePrice,
                    currency: priceInfo.currency,
                    policyNumber: reference,
                    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Agriculture insurance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/agriculture/advisory
 * @desc Pay for personalized farming advisory
 */
router.post('/agriculture/advisory', async (req, res) => {
    try {
        const { farmSize, crops, phone, country, paymentMethod } = req.body;

        const basePrice = 100; // $100 for comprehensive farm analysis
        const priceInfo = PaymentProcessor.getPricing('data_access', country);
        const reference = `ADV-FARM-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: 'agriculture_advisory'
            });

            return res.json({
                success: true,
                advisory: {
                    farmSize: farmSize,
                    crops: crops,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    reference: reference,
                    deliveryDays: 3
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Agriculture advisory error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 3: HEALTH & FOOD SAFETY
// ============================================

/**
 * @route POST /api/health/food-certification
 * @desc Pay for food safety certification/testing
 */
router.post('/health/food-certification', async (req, res) => {
    try {
        const { productType, quantity, phone, country, paymentMethod } = req.body;

        const basePrice = 50; // $50 per certification test
        const priceInfo = PaymentProcessor.getPricing('subscription_basic', country);
        const reference = `CERT-FOOD-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: `food_certification_${productType}`
            });

            return res.json({
                success: true,
                certification: {
                    productType: productType,
                    quantity: quantity,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    certificateId: reference,
                    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Food certification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/health/outbreak-alert
 * @desc Purchase disease outbreak alerts
 */
router.post('/health/outbreak-alert', async (req, res) => {
    try {
        const { region, diseaseType, phone, country, paymentMethod } = req.body;

        const basePrice = 25; // $25 per outbreak alert
        const priceInfo = PaymentProcessor.getPricing('alert', country);
        const reference = `OUTBREAK-${diseaseType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: `outbreak_alert_${diseaseType}`
            });

            return res.json({
                success: true,
                alert: {
                    region: region,
                    diseaseType: diseaseType,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Outbreak alert error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 4: GOVERNANCE & DAO
// ============================================

/**
 * @route POST /api/governance/participation-fee
 * @desc Pay DAO participation fee for voting rights
 */
router.post('/governance/participation-fee', async (req, res) => {
    try {
        const { walletAddress, phone, country, paymentMethod } = req.body;

        const basePrice = 10; // $10 participation fee
        const priceInfo = PaymentProcessor.getPricing('alert', country);
        const reference = `DAO-${walletAddress.slice(0, 8)}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: walletAddress,
                product: 'dao_participation'
            });

            return res.json({
                success: true,
                participation: {
                    walletAddress: walletAddress,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    votingPower: 1,
                    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('DAO participation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 5: AI MARKETPLACE
// ============================================

/**
 * @route POST /api/ai/model-access
 * @desc Purchase access to AI models/predictions
 */
router.post('/ai/model-access', async (req, res) => {
    try {
        const { modelType, duration, phone, email, country, paymentMethod } = req.body;

        const pricing = {
            'crop_prediction': 50,     // $50/month
            'weather_forecast': 75,    // $75/month
            'market_analysis': 100,    // $100/month
            'custom_ai': 200          // $200/month
        };

        const basePrice = pricing[modelType] || 50;
        const priceInfo = PaymentProcessor.calculateLocalPrice(basePrice, country);
        const reference = `AI-${modelType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo,
            reference: reference,
            customer: { phone, email, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone || email,
                product: `ai_model_${modelType}`
            });

            return res.json({
                success: true,
                aiAccess: {
                    modelType: modelType,
                    duration: duration,
                    price: priceInfo,
                    apiKey: `kai_${uuidv4()}`,
                    validUntil: new Date(Date.now() + duration * 24 * 60 * 60 * 1000),
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('AI model access error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/ai/custom-analysis
 * @desc Pay for custom AI analysis
 */
router.post('/ai/custom-analysis', async (req, res) => {
    try {
        const { analysisType, dataSize, phone, country, paymentMethod } = req.body;

        const basePrice = 200; // $200 for custom analysis
        const priceInfo = PaymentProcessor.getPricing('subscription_enterprise', country);
        const reference = `ANALYSIS-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: `custom_analysis_${analysisType}`
            });

            return res.json({
                success: true,
                analysis: {
                    analysisType: analysisType,
                    dataSize: dataSize,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    deliveryDays: 5,
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Custom analysis error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 6: DISASTER RESPONSE
// ============================================

/**
 * @route POST /api/disaster/emergency-service
 * @desc Pay for emergency disaster response coordination
 */
router.post('/disaster/emergency-service', async (req, res) => {
    try {
        const { disasterType, location, phone, country, paymentMethod } = req.body;

        const basePrice = 50; // $50 for emergency coordination
        const priceInfo = PaymentProcessor.getPricing('subscription_basic', country);
        const reference = `DISASTER-${disasterType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo.price,
            reference: reference,
            customer: { phone, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo.price,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: phone,
                product: `disaster_response_${disasterType}`
            });

            return res.json({
                success: true,
                service: {
                    disasterType: disasterType,
                    location: location,
                    price: priceInfo.price,
                    currency: priceInfo.currency,
                    responseTime: '< 30 minutes',
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Disaster service error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PILLAR 7: LAW & COMPLIANCE
// ============================================

/**
 * @route POST /api/law/compliance-audit
 * @desc Pay for legal compliance audit
 */
router.post('/law/compliance-audit', async (req, res) => {
    try {
        const { complianceType, organizationSize, email, country, paymentMethod } = req.body;

        const pricing = {
            'small': 500,      // $500 for small org
            'medium': 2000,    // $2000 for medium org
            'large': 5000      // $5000 for large org
        };

        const basePrice = pricing[organizationSize] || 500;
        const priceInfo = PaymentProcessor.calculateLocalPrice(basePrice, country);
        const reference = `AUDIT-${complianceType.toUpperCase()}-${uuidv4().slice(0, 8)}`;

        const payment = await PaymentProcessor.processPayment({
            method: paymentMethod,
            amount: priceInfo,
            reference: reference,
            customer: { email, country }
        });

        if (payment.success) {
            await PaymentProcessor.recordRevenue({
                amount: priceInfo,
                currency: priceInfo.currency,
                provider: payment.provider,
                reference: payment.reference,
                customer: email,
                product: `compliance_audit_${complianceType}`
            });

            return res.json({
                success: true,
                audit: {
                    complianceType: complianceType,
                    organizationSize: organizationSize,
                    price: priceInfo,
                    deliveryDays: 14,
                    reference: reference
                }
            });
        } else {
            return res.status(400).json({ success: false, error: payment.error });
        }

    } catch (error) {
        console.error('Compliance audit error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PAYMENT CALLBACKS
// ============================================

/**
 * @route POST /api/payments/mpesa/callback
 * @desc Handle M-Pesa payment callbacks
 */
router.post('/payments/mpesa/callback', async (req, res) => {
    try {
        const result = await PaymentProcessor.handleMpesaCallback(req.body);

        if (result.success) {
            console.log('✅ M-Pesa payment successful:', result.reference);
            // TODO: Update database, send confirmation, trigger service delivery
        } else {
            console.log('❌ M-Pesa payment failed:', result.error);
        }

        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    } catch (error) {
        console.error('M-Pesa callback error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/payments/paystack/callback
 * @desc Handle Paystack payment callbacks
 */
router.post('/payments/paystack/callback', async (req, res) => {
    try {
        const { reference } = req.query;
        console.log('✅ Paystack payment callback:', reference);
        // TODO: Verify payment with Paystack, update database
        res.redirect('/payment-success');
    } catch (error) {
        console.error('Paystack callback error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// REVENUE ANALYTICS
// ============================================

/**
 * @route GET /api/revenue/stats
 * @desc Get revenue statistics across all pillars
 */
router.get('/revenue/stats', async (req, res) => {
    try {
        // TODO: Query database for actual stats
        const stats = {
            totalRevenue: 0,
            monthlyRevenue: 0,
            revenueByPillar: {
                climate: 0,
                agriculture: 0,
                health: 0,
                governance: 0,
                ai: 0,
                disaster: 0,
                law: 0
            },
            revenueByProvider: {
                mpesa: 0,
                stripe: 0,
                paystack: 0,
                ussd: 0
            },
            totalCustomers: 0,
            activeSubscriptions: 0
        };

        res.json(stats);

    } catch (error) {
        console.error('Revenue stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
