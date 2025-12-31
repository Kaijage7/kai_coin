/**
 * 🇹🇿 Test Tanzania M-Pesa Payment Integration
 *
 * Run this to test payment with Tanzania M-Pesa
 */

require('dotenv').config();
const TanzaniaPayment = require('./payments-tanzania');

// Test configuration
const TEST_CONFIG = {
    // Sandbox test number (use this first)
    sandboxPhone: '255000000000',

    // Your real phone number (for real testing after sandbox works)
    realPhone: '255712345678', // Change this to your Vodacom number!

    // Test amounts
    smallAmount: 1000,    // 1,000 TZS (~$0.43) for real testing
    alertAmount: 46000,   // 46,000 TZS ($20) for flood alert
};

/**
 * Test 1: Get Pricing
 */
async function testGetPricing() {
    console.log('\n═══════════════════════════════════════');
    console.log('TEST 1: GET PRICING FOR TANZANIA');
    console.log('═══════════════════════════════════════\n');

    const products = [
        'alert_flood',
        'alert_drought',
        'subscription_basic',
        'subscription_premium'
    ];

    products.forEach(product => {
        const pricing = TanzaniaPayment.getPricing(product);
        console.log(`${product}:`);
        console.log(`  - USD: $${pricing.usdEquivalent}`);
        console.log(`  - TZS: ${pricing.displayPrice}`);
        console.log(`  - Swahili: ${pricing.displayPriceSwahili}`);
        console.log('');
    });

    console.log('✅ Pricing test complete\n');
}

/**
 * Test 2: Test Sandbox Payment (No Real Money)
 */
async function testSandboxPayment() {
    console.log('\n═══════════════════════════════════════');
    console.log('TEST 2: SANDBOX PAYMENT (NO REAL MONEY)');
    console.log('═══════════════════════════════════════\n');

    console.log('ℹ️  This uses Vodacom M-Pesa sandbox environment');
    console.log('ℹ️  No real money will be charged\n');

    const testData = {
        phone: TEST_CONFIG.sandboxPhone,
        amount: TEST_CONFIG.alertAmount,
        reference: `TEST-SANDBOX-${Date.now()}`
    };

    console.log('Test Data:');
    console.log(`  Phone: ${testData.phone}`);
    console.log(`  Amount: TZS ${testData.amount.toLocaleString()}`);
    console.log(`  Reference: ${testData.reference}`);
    console.log('');

    try {
        const result = await TanzaniaPayment.chargeMpesa(
            testData.phone,
            testData.amount,
            testData.reference
        );

        if (result.success) {
            console.log('\n✅ SANDBOX TEST PASSED!');
            console.log('Transaction ID:', result.transactionId);
            console.log('Reference:', result.reference);
            console.log('\nℹ️  In production, customer would receive M-Pesa prompt');
        } else {
            console.log('\n❌ SANDBOX TEST FAILED');
            console.log('Error:', result.error);
            console.log('Error Code:', result.errorCode);
        }

    } catch (error) {
        console.error('\n💥 TEST ERROR:', error.message);
    }
}

/**
 * Test 3: Test Real Payment (Small Amount)
 * WARNING: This will charge real money!
 */
async function testRealPayment() {
    console.log('\n═══════════════════════════════════════');
    console.log('TEST 3: REAL PAYMENT (REAL MONEY!)');
    console.log('═══════════════════════════════════════\n');

    console.log('⚠️  WARNING: This will charge REAL MONEY!');
    console.log('⚠️  Make sure you have:');
    console.log('    1. Real M-Pesa business account');
    console.log('    2. Production API credentials in .env');
    console.log('    3. MPESA_ENVIRONMENT=production in .env');
    console.log('');

    // Check if in production mode
    if (process.env.MPESA_ENVIRONMENT !== 'production') {
        console.log('❌ Not in production mode. Set MPESA_ENVIRONMENT=production in .env');
        console.log('ℹ️  Skipping real payment test for safety\n');
        return;
    }

    const testData = {
        phone: TEST_CONFIG.realPhone,
        amount: TEST_CONFIG.smallAmount, // Small amount for testing
        reference: `TEST-REAL-${Date.now()}`
    };

    console.log('Test Data:');
    console.log(`  Phone: ${testData.phone}`);
    console.log(`  Amount: TZS ${testData.amount.toLocaleString()} (~$0.43)`);
    console.log(`  Reference: ${testData.reference}`);
    console.log('');

    console.log('⏳ Initiating real payment...');
    console.log('📱 Check your phone for M-Pesa prompt!\n');

    try {
        const result = await TanzaniaPayment.chargeMpesa(
            testData.phone,
            testData.amount,
            testData.reference
        );

        if (result.success) {
            console.log('\n✅ PAYMENT REQUEST SENT!');
            console.log('Transaction ID:', result.transactionId);
            console.log('Reference:', result.reference);
            console.log('\n📱 NEXT STEPS:');
            console.log('1. Check your phone for M-Pesa prompt');
            console.log('2. Enter your M-Pesa PIN');
            console.log('3. You should receive SMS confirmation');
            console.log('4. Money will appear in your M-Pesa business account');
            console.log('\nℹ️  Dial *150*00# to check your M-Pesa balance');
        } else {
            console.log('\n❌ PAYMENT FAILED');
            console.log('Error:', result.error);
            console.log('Error Code:', result.errorCode);

            if (result.errorCode === 'INS-2001') {
                console.log('\nℹ️  Common fix: Customer has insufficient M-Pesa balance');
            }
        }

    } catch (error) {
        console.error('\n💥 TEST ERROR:', error.message);
    }
}

/**
 * Test 4: Test Phone Number Formatting
 */
function testPhoneFormatting() {
    console.log('\n═══════════════════════════════════════');
    console.log('TEST 4: PHONE NUMBER FORMATTING');
    console.log('═══════════════════════════════════════\n');

    const testNumbers = [
        '0754123456',
        '754123456',
        '255754123456',
        '+255754123456',
        '255 754 123 456'
    ];

    console.log('Testing various phone number formats:\n');

    testNumbers.forEach(phone => {
        try {
            const formatted = TanzaniaPayment.formatPhoneNumber(phone);
            console.log(`✅ ${phone.padEnd(20)} → ${formatted}`);
        } catch (error) {
            console.log(`❌ ${phone.padEnd(20)} → ERROR: ${error.message}`);
        }
    });

    console.log('\n✅ Phone formatting test complete\n');
}

/**
 * Test 5: Simulate Callback
 */
async function testCallback() {
    console.log('\n═══════════════════════════════════════');
    console.log('TEST 5: SIMULATE M-PESA CALLBACK');
    console.log('═══════════════════════════════════════\n');

    // Simulate successful payment callback
    const successCallback = {
        output_ResponseCode: 'INS-0',
        output_ResponseDesc: 'Request processed successfully',
        output_TransactionID: 'TX12345678',
        output_ConversationID: 'AG_20251230_123456789',
        output_ThirdPartyConversationID: 'TEST-CALLBACK-001'
    };

    console.log('Simulating successful payment callback:');
    console.log(JSON.stringify(successCallback, null, 2));
    console.log('');

    const result = await TanzaniaPayment.handleMpesaCallback(successCallback);

    if (result.success) {
        console.log('✅ Callback processed successfully!');
        console.log('Transaction ID:', result.transactionId);
        console.log('Reference:', result.reference);
    } else {
        console.log('❌ Callback processing failed');
    }

    console.log('\n✅ Callback test complete\n');
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║     🇹🇿 TANZANIA M-PESA PAYMENT INTEGRATION TEST 🇹🇿      ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Check environment variables
    console.log('Environment Configuration:');
    console.log('─────────────────────────────────────');
    console.log(`Environment: ${process.env.MPESA_ENVIRONMENT || 'sandbox'}`);
    console.log(`API Key: ${process.env.MPESA_API_KEY ? '✅ Set' : '❌ Not set'}`);
    console.log(`Service Provider: ${process.env.MPESA_SERVICE_PROVIDER_CODE || '000000'}`);
    console.log('');

    if (!process.env.MPESA_API_KEY) {
        console.log('⚠️  WARNING: MPESA_API_KEY not set in .env');
        console.log('ℹ️  Add your Vodacom M-Pesa API credentials to .env file');
        console.log('ℹ️  Get credentials from: https://developer.mpesa.vm.co.tz/\n');
    }

    try {
        // Run tests
        await testGetPricing();
        testPhoneFormatting();
        await testCallback();

        // Only run payment tests if API key is set
        if (process.env.MPESA_API_KEY) {
            await testSandboxPayment();

            // Only offer real payment test if in production mode
            if (process.env.MPESA_ENVIRONMENT === 'production') {
                console.log('\n⚠️  Real payment test available. Run with:');
                console.log('   node test-tanzania-payment.js --real\n');
            }
        }

        console.log('\n═══════════════════════════════════════');
        console.log('✅ ALL TESTS COMPLETE!');
        console.log('═══════════════════════════════════════\n');

        console.log('📋 Next Steps:');
        console.log('1. Get M-Pesa API credentials from Vodacom');
        console.log('2. Add credentials to .env file');
        console.log('3. Test in sandbox first (no real money)');
        console.log('4. Test with real account (small amount)');
        console.log('5. Launch to customers!\n');

    } catch (error) {
        console.error('\n💥 Test suite error:', error.message);
        console.error(error.stack);
    }
}

// Run tests
if (require.main === module) {
    // Check command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--real')) {
        // Run only real payment test
        testRealPayment()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err);
                process.exit(1);
            });
    } else {
        // Run all tests
        runAllTests()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err);
                process.exit(1);
            });
    }
}

module.exports = {
    testGetPricing,
    testSandboxPayment,
    testRealPayment,
    testPhoneFormatting,
    testCallback
};
