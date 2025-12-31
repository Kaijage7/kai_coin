/**
 * Test Weather Oracle System
 */

require('dotenv').config();
const WeatherOracle = require('./services/weather-oracle');

async function testWeatherOracle() {
    console.log('🌤️  Testing Weather Oracle System\n');
    console.log('═══════════════════════════════════════\n');

    // Check API configuration
    console.log('📋 API Configuration:');
    console.log(`   OpenWeather: ${process.env.OPENWEATHER_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   WeatherAPI: ${process.env.WEATHERAPI_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Database: ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log('');

    if (!process.env.OPENWEATHER_API_KEY && !process.env.WEATHERAPI_KEY) {
        console.log('\n⚠️  No weather API keys configured!');
        console.log('\n📝 To get FREE API keys:');
        console.log('\n1. OpenWeather (Free 1000 calls/day):');
        console.log('   https://openweathermap.org/api');
        console.log('   Sign up → Get API key');
        console.log('   Add to .env: OPENWEATHER_API_KEY=your_key\n');
        console.log('2. WeatherAPI (Free 1M calls/month):');
        console.log('   https://www.weatherapi.com/');
        console.log('   Sign up → Get API key');
        console.log('   Add to .env: WEATHERAPI_KEY=your_key\n');
        return;
    }

    try {
        // Monitor all regions
        console.log('🌍 Starting region monitoring...\n');
        const alerts = await WeatherOracle.monitorAllRegions();

        // Display results
        console.log('\n📊 Results Summary:');
        console.log('─────────────────────────────────────');

        if (alerts.length === 0) {
            console.log('✅ No weather alerts at this time');
            console.log('   All monitored regions are safe');
        } else {
            console.log(`⚠️  ${alerts.length} Weather Alert(s) Generated:\n`);

            alerts.forEach((alert, i) => {
                console.log(`${i + 1}. ${alert.type.toUpperCase()} - ${alert.region}`);
                console.log(`   Severity: ${alert.severity}`);
                console.log(`   Confidence: ${alert.confidence}%`);
                console.log(`   Lead time: ${alert.lead_time_hours} hours`);
                console.log(`   ${alert.title}`);
                console.log('');
            });
        }

        // Display stats
        const stats = WeatherOracle.getStats();
        console.log('\n📈 Oracle Statistics:');
        console.log('─────────────────────────────────────');
        console.log(`   Regions monitored: ${stats.regions_monitored}`);
        console.log(`   Forecasts fetched: ${stats.forecasts_fetched}`);
        console.log(`   Alerts generated: ${stats.alerts_generated}`);
        console.log(`   API calls made: ${stats.api_calls}`);
        console.log(`   APIs configured: ${stats.apis_configured}`);
        console.log(`   Last update: ${stats.last_update || 'Never'}`);

        console.log('\n═══════════════════════════════════════');
        console.log('✅ Test complete!\n');

        if (alerts.length > 0) {
            console.log('💡 Next steps:');
            console.log('1. Alerts are stored in database');
            console.log('2. Use alert delivery service to send to customers');
            console.log('3. Run: node scripts/deliver-alerts.js\n');
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run test
if (require.main === module) {
    testWeatherOracle()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = { testWeatherOracle };
