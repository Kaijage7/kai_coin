/**
 * 🌤️ Weather Oracle Service
 *
 * Fetches weather data from multiple sources
 * Generates climate alerts based on thresholds
 * Triggers alert delivery to subscribers
 */

const axios = require('axios');
const { Pool } = require('pg');

class WeatherOracle {
    constructor() {
        this.db = new Pool({
            connectionString: process.env.DATABASE_URL
        });

        // Weather API configurations
        this.apis = {
            openweather: {
                key: process.env.OPENWEATHER_API_KEY,
                baseUrl: 'https://api.openweathermap.org/data/2.5',
                enabled: !!process.env.OPENWEATHER_API_KEY
            },
            weatherapi: {
                key: process.env.WEATHERAPI_KEY,
                baseUrl: 'https://api.weatherapi.com/v1',
                enabled: !!process.env.WEATHERAPI_KEY
            },
            meteostat: {
                key: process.env.METEOSTAT_KEY,
                baseUrl: 'https://api.meteostat.net/v2',
                enabled: !!process.env.METEOSTAT_KEY
            }
        };

        // Alert thresholds for Tanzania/East Africa
        this.thresholds = {
            flood: {
                rainfall_24h: 100, // mm in 24 hours
                rainfall_7day: 250, // mm in 7 days
                soil_moisture: 90, // % saturation
                confidence_min: 70 // % confidence
            },
            drought: {
                days_without_rain: 21, // 3 weeks
                rainfall_30day: 20, // mm in 30 days (very low)
                temperature_avg: 35, // °C sustained high temp
                confidence_min: 75
            },
            cyclone: {
                wind_speed: 119, // km/h (tropical cyclone threshold)
                pressure: 980, // mb (low pressure system)
                confidence_min: 80
            },
            heatwave: {
                temperature_max: 38, // °C
                days_sustained: 3, // consecutive days
                confidence_min: 70
            }
        };

        // Tanzania regions to monitor
        this.monitoredRegions = [
            { name: 'Dar es Salaam', lat: -6.7924, lon: 39.2083 },
            { name: 'Morogoro', lat: -6.8211, lon: 37.6636 },
            { name: 'Dodoma', lat: -6.1630, lon: 35.7516 },
            { name: 'Mwanza', lat: -2.5164, lon: 32.9175 },
            { name: 'Arusha', lat: -3.3869, lon: 36.6830 },
            { name: 'Mbeya', lat: -8.9094, lon: 33.4606 },
            { name: 'Tanga', lat: -5.0689, lon: 39.0986 },
            { name: 'Zanzibar', lat: -6.1659, lon: 39.2026 },
            { name: 'Kilimanjaro', lat: -3.3731, lon: 37.3397 },
            { name: 'Iringa', lat: -7.7700, lon: 35.6900 }
        ];

        this.stats = {
            forecasts_fetched: 0,
            alerts_generated: 0,
            api_calls: 0,
            last_update: null
        };
    }

    /**
     * @dev Fetch weather data from OpenWeather API
     */
    async fetchOpenWeather(lat, lon) {
        if (!this.apis.openweather.enabled) {
            return null;
        }

        try {
            this.stats.api_calls++;

            // Get current weather + 7-day forecast
            const [current, forecast] = await Promise.all([
                axios.get(`${this.apis.openweather.baseUrl}/weather`, {
                    params: {
                        lat,
                        lon,
                        appid: this.apis.openweather.key,
                        units: 'metric'
                    }
                }),
                axios.get(`${this.apis.openweather.baseUrl}/forecast`, {
                    params: {
                        lat,
                        lon,
                        appid: this.apis.openweather.key,
                        units: 'metric',
                        cnt: 40 // 5 days * 8 (3-hour intervals)
                    }
                })
            ]);

            return {
                source: 'openweather',
                current: {
                    temp: current.data.main.temp,
                    feels_like: current.data.main.feels_like,
                    humidity: current.data.main.humidity,
                    pressure: current.data.main.pressure,
                    wind_speed: current.data.wind.speed * 3.6, // m/s to km/h
                    rain_1h: current.data.rain?.['1h'] || 0,
                    clouds: current.data.clouds.all,
                    description: current.data.weather[0].description
                },
                forecast: forecast.data.list.map(item => ({
                    timestamp: item.dt * 1000,
                    temp: item.main.temp,
                    humidity: item.main.humidity,
                    pressure: item.main.pressure,
                    wind_speed: item.wind.speed * 3.6,
                    rain_3h: item.rain?.['3h'] || 0,
                    clouds: item.clouds.all,
                    description: item.weather[0].description
                }))
            };

        } catch (error) {
            console.error('OpenWeather API error:', error.message);
            return null;
        }
    }

    /**
     * @dev Fetch weather from WeatherAPI.com (alternative)
     */
    async fetchWeatherAPI(lat, lon) {
        if (!this.apis.weatherapi.enabled) {
            return null;
        }

        try {
            this.stats.api_calls++;

            const response = await axios.get(`${this.apis.weatherapi.baseUrl}/forecast.json`, {
                params: {
                    key: this.apis.weatherapi.key,
                    q: `${lat},${lon}`,
                    days: 7,
                    alerts: 'yes'
                }
            });

            const data = response.data;

            return {
                source: 'weatherapi',
                current: {
                    temp: data.current.temp_c,
                    feels_like: data.current.feelslike_c,
                    humidity: data.current.humidity,
                    pressure: data.current.pressure_mb,
                    wind_speed: data.current.wind_kph,
                    rain_1h: data.current.precip_mm,
                    clouds: data.current.cloud,
                    description: data.current.condition.text
                },
                forecast: data.forecast.forecastday.map(day => ({
                    date: day.date,
                    max_temp: day.day.maxtemp_c,
                    min_temp: day.day.mintemp_c,
                    avg_temp: day.day.avgtemp_c,
                    total_rain: day.day.totalprecip_mm,
                    max_wind: day.day.maxwind_kph,
                    humidity: day.day.avghumidity,
                    rain_chance: day.day.daily_chance_of_rain,
                    condition: day.day.condition.text
                })),
                alerts: data.alerts?.alert || []
            };

        } catch (error) {
            console.error('WeatherAPI error:', error.message);
            return null;
        }
    }

    /**
     * @dev Analyze weather data and generate alerts
     */
    async analyzeWeatherData(region, weatherData) {
        const alerts = [];

        if (!weatherData) {
            return alerts;
        }

        console.log(`\n🔍 Analyzing weather for ${region.name}...`);

        // Check for flood risk
        const floodAlert = this.checkFloodRisk(region, weatherData);
        if (floodAlert) {
            alerts.push(floodAlert);
        }

        // Check for drought risk
        const droughtAlert = this.checkDroughtRisk(region, weatherData);
        if (droughtAlert) {
            alerts.push(droughtAlert);
        }

        // Check for cyclone/high winds
        const cycloneAlert = this.checkCycloneRisk(region, weatherData);
        if (cycloneAlert) {
            alerts.push(cycloneAlert);
        }

        // Check for heatwave
        const heatwaveAlert = this.checkHeatwaveRisk(region, weatherData);
        if (heatwaveAlert) {
            alerts.push(heatwaveAlert);
        }

        return alerts;
    }

    /**
     * @dev Check for flood risk
     */
    checkFloodRisk(region, data) {
        // Calculate total rainfall in next 24 hours
        const next24h = data.forecast?.slice(0, 8) || []; // 8 * 3hr = 24hr
        const rainfall24h = next24h.reduce((sum, f) => sum + (f.rain_3h || f.total_rain || 0), 0);

        // Calculate 7-day rainfall
        const rainfall7day = data.forecast?.slice(0, 56).reduce(
            (sum, f) => sum + (f.rain_3h || f.total_rain || 0), 0
        ) || 0;

        const threshold = this.thresholds.flood;

        if (rainfall24h > threshold.rainfall_24h || rainfall7day > threshold.rainfall_7day) {
            const severity = rainfall24h > threshold.rainfall_24h * 1.5 ? 'critical' :
                           rainfall24h > threshold.rainfall_24h ? 'high' : 'medium';

            const confidence = Math.min(95, 70 + (rainfall24h / threshold.rainfall_24h) * 15);

            const hoursUntil = this.calculateHoursUntilEvent(data.forecast);

            return {
                type: 'flood',
                region: region.name,
                severity,
                confidence: Math.round(confidence),
                forecast_date: new Date(Date.now() + hoursUntil * 60 * 60 * 1000),
                lead_time_hours: hoursUntil,
                title: `Flood Warning - ${region.name}`,
                description: `Heavy rainfall expected: ${Math.round(rainfall24h)}mm in next 24 hours. ` +
                           `Total 7-day forecast: ${Math.round(rainfall7day)}mm. Flood risk is ${severity}.`,
                recommendations: severity === 'critical'
                    ? 'EVACUATE LOW-LYING AREAS NOW! Move livestock and harvest to high ground immediately.'
                    : 'Move harvest to elevated storage. Prepare drainage. Monitor water levels.',
                impact_assessment: `Potential flooding in ${region.name} and surrounding areas. ` +
                                  `Crops at risk: Maize, rice, vegetables in low-lying fields.`,
                metadata: {
                    rainfall_24h,
                    rainfall_7day,
                    threshold: threshold.rainfall_24h,
                    data_source: data.source
                }
            };
        }

        return null;
    }

    /**
     * @dev Check for drought risk
     */
    checkDroughtRisk(region, data) {
        // Calculate days without significant rain
        const forecast = data.forecast || [];
        let daysWithoutRain = 0;
        let totalRain30day = 0;

        for (let i = 0; i < Math.min(30, forecast.length); i++) {
            const rain = forecast[i]?.rain_3h || forecast[i]?.total_rain || 0;
            totalRain30day += rain;
            if (rain < 1) { // Less than 1mm = dry day
                daysWithoutRain++;
            }
        }

        const threshold = this.thresholds.drought;
        const avgTemp = data.current?.temp || 0;

        if (daysWithoutRain > threshold.days_without_rain ||
            (totalRain30day < threshold.rainfall_30day && avgTemp > threshold.temperature_avg)) {

            const severity = daysWithoutRain > 30 ? 'critical' :
                           daysWithoutRain > 25 ? 'high' : 'medium';

            const confidence = Math.min(90, 65 + (daysWithoutRain / threshold.days_without_rain) * 20);

            return {
                type: 'drought',
                region: region.name,
                severity,
                confidence: Math.round(confidence),
                forecast_date: new Date(),
                lead_time_hours: 0,
                title: `Drought Alert - ${region.name}`,
                description: `${daysWithoutRain} days forecast without significant rainfall. ` +
                           `Only ${Math.round(totalRain30day)}mm expected in next 30 days. ` +
                           `Average temperature: ${Math.round(avgTemp)}°C.`,
                recommendations: 'Plant drought-resistant crops (sorghum, millet). ' +
                               'Implement water conservation. Consider irrigation if available.',
                impact_assessment: `Severe drought conditions in ${region.name}. ` +
                                  `Crops at risk: Maize, beans. Water sources may dry up.`,
                metadata: {
                    days_without_rain: daysWithoutRain,
                    rainfall_30day: totalRain30day,
                    avg_temp: avgTemp,
                    threshold: threshold.days_without_rain,
                    data_source: data.source
                }
            };
        }

        return null;
    }

    /**
     * @dev Check for cyclone/high wind risk
     */
    checkCycloneRisk(region, data) {
        const maxWind = data.current?.wind_speed || 0;
        const pressure = data.current?.pressure || 1013;
        const threshold = this.thresholds.cyclone;

        // Check forecast for high winds
        const forecast = data.forecast || [];
        const maxForecastWind = Math.max(...forecast.map(f => f.wind_speed || f.max_wind || 0));

        if (maxWind > threshold.wind_speed || maxForecastWind > threshold.wind_speed ||
            pressure < threshold.pressure) {

            const severity = maxWind > 150 || maxForecastWind > 150 ? 'critical' :
                           maxWind > 119 || maxForecastWind > 119 ? 'high' : 'medium';

            const confidence = pressure < threshold.pressure ? 85 : 75;

            const hoursUntil = this.calculateHoursUntilHighWinds(forecast, threshold.wind_speed);

            return {
                type: 'cyclone',
                region: region.name,
                severity,
                confidence,
                forecast_date: new Date(Date.now() + hoursUntil * 60 * 60 * 1000),
                lead_time_hours: hoursUntil,
                title: `${severity === 'critical' ? 'CYCLONE' : 'High Wind'} Warning - ${region.name}`,
                description: `${severity === 'critical' ? 'TROPICAL CYCLONE' : 'Strong winds'} expected. ` +
                           `Wind speed: up to ${Math.round(Math.max(maxWind, maxForecastWind))} km/h. ` +
                           `Pressure: ${Math.round(pressure)} mb.`,
                recommendations: severity === 'critical'
                    ? 'EVACUATE NOW! Seek shelter in sturdy buildings. Stay away from windows.'
                    : 'Secure loose objects. Harvest ready crops. Reinforce structures.',
                impact_assessment: `Dangerous wind conditions in ${region.name}. ` +
                                  `Risk of structural damage, falling trees, power outages.`,
                metadata: {
                    wind_speed: Math.round(Math.max(maxWind, maxForecastWind)),
                    pressure,
                    threshold: threshold.wind_speed,
                    data_source: data.source
                }
            };
        }

        return null;
    }

    /**
     * @dev Check for heatwave risk
     */
    checkHeatwaveRisk(region, data) {
        const forecast = data.forecast || [];
        const threshold = this.thresholds.heatwave;

        // Check for sustained high temperatures
        let consecutiveHotDays = 0;
        let maxTemp = data.current?.temp || 0;

        for (const day of forecast.slice(0, 7)) {
            const temp = day.max_temp || day.temp || 0;
            maxTemp = Math.max(maxTemp, temp);

            if (temp > threshold.temperature_max) {
                consecutiveHotDays++;
            } else {
                break; // Reset if not consecutive
            }
        }

        if (consecutiveHotDays >= threshold.days_sustained || maxTemp > threshold.temperature_max + 3) {
            const severity = maxTemp > 42 || consecutiveHotDays > 5 ? 'critical' :
                           maxTemp > 40 || consecutiveHotDays > 3 ? 'high' : 'medium';

            const confidence = 75;

            return {
                type: 'heatwave',
                region: region.name,
                severity,
                confidence,
                forecast_date: new Date(),
                lead_time_hours: 24,
                title: `Heatwave Alert - ${region.name}`,
                description: `Extreme heat expected for ${consecutiveHotDays} consecutive days. ` +
                           `Maximum temperature: ${Math.round(maxTemp)}°C.`,
                recommendations: 'Protect livestock from heat. Increase irrigation. ' +
                               'Harvest heat-sensitive crops early. Provide shade for animals.',
                impact_assessment: `Dangerous heat conditions in ${region.name}. ` +
                                  `Crops at risk: Vegetables, flowers. Livestock stress likely.`,
                metadata: {
                    max_temp: Math.round(maxTemp),
                    consecutive_days: consecutiveHotDays,
                    threshold: threshold.temperature_max,
                    data_source: data.source
                }
            };
        }

        return null;
    }

    /**
     * @dev Helper: Calculate hours until event
     */
    calculateHoursUntilEvent(forecast) {
        // Simple: assume event in 24-48 hours if detected
        return 36;
    }

    /**
     * @dev Helper: Calculate hours until high winds
     */
    calculateHoursUntilHighWinds(forecast, threshold) {
        for (let i = 0; i < forecast.length; i++) {
            const wind = forecast[i]?.wind_speed || forecast[i]?.max_wind || 0;
            if (wind > threshold) {
                return i * 3; // 3-hour intervals
            }
        }
        return 48; // Default 48 hours
    }

    /**
     * @dev Store alert in database
     */
    async storeAlert(alert) {
        try {
            const query = `
                INSERT INTO climate_alerts (
                    alert_type, severity, confidence_score, region, country_code,
                    forecast_date, lead_time_hours, title, description,
                    recommendations, impact_assessment, data_source, metadata, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id, alert_id
            `;

            const values = [
                alert.type,
                alert.severity,
                alert.confidence,
                alert.region,
                'TZ', // Country code
                alert.forecast_date,
                alert.lead_time_hours,
                alert.title,
                alert.description,
                alert.recommendations,
                alert.impact_assessment,
                alert.metadata?.data_source || 'weather_api',
                JSON.stringify(alert.metadata),
                'active'
            ];

            const result = await this.db.query(query, values);

            console.log(`✅ Alert stored: ${alert.type} in ${alert.region} (ID: ${result.rows[0].id})`);
            this.stats.alerts_generated++;

            return result.rows[0];

        } catch (error) {
            console.error('Failed to store alert:', error.message);
            return null;
        }
    }

    /**
     * @dev Main method: Monitor all regions and generate alerts
     */
    async monitorAllRegions() {
        console.log('\n🌍 Weather Oracle - Monitoring All Regions');
        console.log('═══════════════════════════════════════════\n');

        const allAlerts = [];

        for (const region of this.monitoredRegions) {
            console.log(`📍 Checking ${region.name}...`);

            try {
                // Fetch weather data (try OpenWeather first, fallback to WeatherAPI)
                let weatherData = await this.fetchOpenWeather(region.lat, region.lon);

                if (!weatherData) {
                    weatherData = await this.fetchWeatherAPI(region.lat, region.lon);
                }

                if (!weatherData) {
                    console.log(`❌ No weather data for ${region.name}`);
                    continue;
                }

                // Analyze and generate alerts
                const alerts = await this.analyzeWeatherData(region, weatherData);

                if (alerts.length > 0) {
                    console.log(`⚠️  ${alerts.length} alert(s) generated for ${region.name}`);

                    // Store alerts in database
                    for (const alert of alerts) {
                        const stored = await this.storeAlert(alert);
                        if (stored) {
                            allAlerts.push({ ...alert, id: stored.id, alert_id: stored.alert_id });
                        }
                    }
                } else {
                    console.log(`✅ No alerts for ${region.name}`);
                }

                // Rate limiting: wait 1 second between API calls
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error monitoring ${region.name}:`, error.message);
            }
        }

        this.stats.forecasts_fetched += this.monitoredRegions.length;
        this.stats.last_update = new Date();

        console.log('\n═══════════════════════════════════════════');
        console.log(`✅ Monitoring complete!`);
        console.log(`   Regions checked: ${this.monitoredRegions.length}`);
        console.log(`   Alerts generated: ${allAlerts.length}`);
        console.log(`   API calls: ${this.stats.api_calls}`);
        console.log('═══════════════════════════════════════════\n');

        return allAlerts;
    }

    /**
     * @dev Get stats
     */
    getStats() {
        return {
            ...this.stats,
            regions_monitored: this.monitoredRegions.length,
            apis_configured: Object.values(this.apis).filter(api => api.enabled).length
        };
    }
}

module.exports = new WeatherOracle();
