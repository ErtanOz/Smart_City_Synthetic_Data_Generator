const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker');
// Aliases to keep existing code working on @faker-js/faker
if (!faker.random) faker.random = {};
if (!faker.random.arrayElement && faker.helpers?.arrayElement) {
    faker.random.arrayElement = faker.helpers.arrayElement;
}
if (!faker.name) faker.name = {};
if (!faker.name.findName && faker.person?.fullName) {
    faker.name.findName = () => faker.person.fullName();
}
if (faker.company && !faker.company.companyName && faker.company.name) {
    faker.company.companyName = () => faker.company.name();
}
if (!faker.address && faker.location) {
    faker.address = faker.location;
}
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;
// Default reference location: Cologne
const DEFAULT_CENTER = { lat: 50.9375, lng: 6.9603 };

// Middleware
app.use(cors());
app.use(express.json());
// Avoid caching HTML to prevent stale UI; cache static assets otherwise
app.use((req, res, next) => {
    if (req.path === '/' || req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-cache');
    }
    next();
});
app.use(express.static('public', { maxAge: '1d', etag: true }));

// Store active real-time data streams
const activeStreams = new Map();

// Data Generator Classes
class SyntheticDataGenerator {
    static generateData(dataType, count = 100, options = {}) {
        switch (dataType) {
            case 'geo':
                return this.generateGeoData(count, options);
            case 'traffic':
                return this.generateTrafficData(count, options);
            case 'social':
                return this.generateSocialData(count, options);
            case 'demographic':
                return this.generateSocialData(count, options);
            case 'financial':
                return this.generateFinancialData(count, options);
            case 'climate':
                return this.generateClimateData(count, options);
            case 'iot':
                return this.generateIoTData(count, options);
            case 'transport':
                return this.generatePublicTransportData(count, options);
            case 'emergency':
                return this.generateEmergencyData(count, options);
            default:
                throw new Error('Invalid data type');
        }
    }

    // Generate Geo/Location Data
    static generateGeoData(count = 100, options = {}) {
        const {
            centerLat = DEFAULT_CENTER.lat,  // Default: Cologne
            centerLng = DEFAULT_CENTER.lng,
            radius = 0.1,  // Radius in degrees
            includeMetadata = true
        } = options;

        const data = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const r = radius * Math.sqrt(Math.random());
            
            const point = {
                id: uuidv4(),
                lat: centerLat + r * Math.cos(angle),
                lng: centerLng + r * Math.sin(angle),
                timestamp: new Date().toISOString(),
                type: faker.random.arrayElement(['residential', 'commercial', 'industrial', 'public', 'green_space'])
            };

            if (includeMetadata) {
                point.metadata = {
                    address: faker.address.streetAddress(),
                    city: faker.address.city(),
                    district: faker.address.county(),
                    postalCode: faker.address.zipCode(),
                    country: faker.address.country(),
                    elevation: Math.floor(Math.random() * 300) + 50,
                    population_density: Math.floor(Math.random() * 10000),
                    building_height: Math.floor(Math.random() * 100) + 5
                };
            }

            data.push(point);
        }
        return data;
    }

    static generateSingleData(dataType, options = {}) {
        return this.generateData(dataType, 1, options)[0];
    }

    // Generate Traffic Data
    static generateTrafficData(count = 50, options = {}) {
        const {
            centerLat = DEFAULT_CENTER.lat,
            centerLng = DEFAULT_CENTER.lng,
            radius = 0.05,
            includeVehicles = true
        } = options;

        const data = [];
        const roadTypes = ['highway', 'main_road', 'street', 'residential'];
        const vehicleTypes = ['car', 'bus', 'truck', 'motorcycle', 'bicycle', 'emergency'];

        for (let i = 0; i < count; i++) {
            const trafficPoint = {
                id: uuidv4(),
                segment_id: `SEG-${uuidv4()}`,
                coordinates: {
                    start: {
                        lat: centerLat + (Math.random() - 0.5) * radius * 2,
                        lng: centerLng + (Math.random() - 0.5) * radius * 2
                    },
                    end: {
                        lat: centerLat + (Math.random() - 0.5) * radius * 2,
                        lng: centerLng + (Math.random() - 0.5) * radius * 2
                    }
                },
                road_type: faker.random.arrayElement(roadTypes),
                current_speed: Math.floor(Math.random() * 80) + 20,
                speed_limit: faker.random.arrayElement([30, 50, 70, 100, 130]),
                congestion_level: Math.random(),
                vehicle_count: Math.floor(Math.random() * 100),
                timestamp: new Date().toISOString()
            };

            if (includeVehicles) {
                const vehicleCount = Math.floor(Math.random() * 10) + 1;
                trafficPoint.vehicles = [];
                for (let j = 0; j < vehicleCount; j++) {
                    trafficPoint.vehicles.push({
                        vehicle_id: uuidv4(),
                        type: faker.random.arrayElement(vehicleTypes),
                        speed: Math.floor(Math.random() * 80) + 20,
                        direction: Math.random() * 360,
                        license_plate: faker.vehicle.vin().slice(0, 8)
                    });
                }
            }

            // Add incident data randomly
            if (Math.random() < 0.1) {
                trafficPoint.incident = {
                    type: faker.random.arrayElement(['accident', 'breakdown', 'roadwork', 'event']),
                    severity: faker.random.arrayElement(['low', 'medium', 'high']),
                    estimated_delay: Math.floor(Math.random() * 60) + 5
                };
            }

            data.push(trafficPoint);
        }
        return data;
    }

    // Generate Social/Demographic Data
    static generateSocialData(count = 100, options = {}) {
        const { includeDetails = true } = options;
        const data = [];

        for (let i = 0; i < count; i++) {
            const person = {
                id: uuidv4(),
                name: faker.name.findName(),
                age: Math.floor(Math.random() * 80) + 18,
                gender: faker.random.arrayElement(['male', 'female', 'other']),
                occupation: faker.name.jobTitle(),
                income_bracket: faker.random.arrayElement(['low', 'medium', 'high', 'very_high']),
                education_level: faker.random.arrayElement(['high_school', 'bachelor', 'master', 'phd', 'other']),
                district: faker.address.county(),
                household_size: Math.floor(Math.random() * 6) + 1
            };

            if (includeDetails) {
                person.details = {
                    employment_status: faker.random.arrayElement(['employed', 'unemployed', 'student', 'retired']),
                    marital_status: faker.random.arrayElement(['single', 'married', 'divorced', 'widowed']),
                    has_children: Math.random() > 0.5,
                    transportation_mode: faker.random.arrayElement(['car', 'public_transport', 'bicycle', 'walking']),
                    internet_usage_hours: Math.floor(Math.random() * 12),
                    social_participation: Math.random(),
                    health_insurance: Math.random() > 0.2,
                    voting_participation: Math.random() > 0.4
                };
            }

            data.push(person);
        }
        return data;
    }

    // Generate Financial/Economic Data
    static generateFinancialData(count = 50, options = {}) {
        const { dataType = 'transactions', centerLat = DEFAULT_CENTER.lat, centerLng = DEFAULT_CENTER.lng } = options;
        const data = [];

        if (dataType === 'transactions') {
            for (let i = 0; i < count; i++) {
                data.push({
                    transaction_id: uuidv4(),
                    timestamp: faker.date.recent(),
                    amount: parseFloat((Math.random() * 10000).toFixed(2)),
                    currency: faker.random.arrayElement(['EUR', 'USD', 'GBP']),
                    type: faker.random.arrayElement(['purchase', 'transfer', 'withdrawal', 'deposit']),
                    category: faker.random.arrayElement(['groceries', 'utilities', 'transport', 'entertainment', 'healthcare', 'education']),
                    merchant: faker.company.companyName(),
                    location: {
                        lat: centerLat + (Math.random() - 0.5) * 0.1,
                        lng: centerLng + (Math.random() - 0.5) * 0.1
                    },
                    payment_method: faker.random.arrayElement(['card', 'cash', 'online', 'mobile'])
                });
            }
        } else if (dataType === 'budget') {
            const categories = ['infrastructure', 'education', 'healthcare', 'public_safety', 'transportation', 'environment', 'culture', 'administration'];
            for (let category of categories) {
                data.push({
                    id: uuidv4(),
                    category: category,
                    allocated_budget: Math.floor(Math.random() * 100000000),
                    spent: Math.floor(Math.random() * 80000000),
                    year: new Date().getFullYear(),
                    quarter: Math.floor(Math.random() * 4) + 1,
                    projects_count: Math.floor(Math.random() * 50) + 1,
                    efficiency_score: Math.random()
                });
            }
        }

        return data;
    }

    // Generate Climate/Environmental Data
    static generateClimateData(count = 24, options = {}) {
        const { 
            startDate = new Date(),
            intervalHours = 1 
        } = options;
        
        const data = [];
        let currentDate = new Date(startDate);

        for (let i = 0; i < count; i++) {
            data.push({
                id: uuidv4(),
                timestamp: new Date(currentDate).toISOString(),
                temperature: parseFloat((Math.random() * 30 + 10).toFixed(1)),
                humidity: Math.floor(Math.random() * 60 + 30),
                pressure: Math.floor(Math.random() * 50 + 980),
                wind_speed: parseFloat((Math.random() * 30).toFixed(1)),
                wind_direction: Math.floor(Math.random() * 360),
                precipitation: parseFloat((Math.random() * 10).toFixed(1)),
                air_quality_index: Math.floor(Math.random() * 200),
                pm25: parseFloat((Math.random() * 100).toFixed(1)),
                pm10: parseFloat((Math.random() * 150).toFixed(1)),
                co2_level: Math.floor(Math.random() * 200 + 350),
                uv_index: Math.floor(Math.random() * 11),
                visibility: Math.floor(Math.random() * 10000 + 1000),
                weather_condition: faker.random.arrayElement(['clear', 'cloudy', 'rainy', 'foggy', 'stormy'])
            });
            currentDate.setHours(currentDate.getHours() + intervalHours);
        }

        return data;
    }

    // Generate IoT Sensor Data
    static generateIoTData(count = 100, options = {}) {
        const { sensorTypes = ['all'], centerLat = DEFAULT_CENTER.lat, centerLng = DEFAULT_CENTER.lng } = options;
        const data = [];

        const allSensorTypes = ['parking', 'waste', 'lighting', 'water', 'energy', 'noise'];
        const types = sensorTypes[0] === 'all' ? allSensorTypes : sensorTypes;

        for (let i = 0; i < count; i++) {
            const sensorType = faker.random.arrayElement(types);
            const sensor = {
                sensor_id: uuidv4(),
                type: sensorType,
                location: {
                    lat: centerLat + (Math.random() - 0.5) * 0.1,
                    lng: centerLng + (Math.random() - 0.5) * 0.1
                },
                timestamp: new Date().toISOString(),
                status: faker.random.arrayElement(['active', 'inactive', 'maintenance']),
                battery_level: Math.floor(Math.random() * 100)
            };

            // Add type-specific data
            switch(sensorType) {
                case 'parking':
                    sensor.data = {
                        occupied: Math.random() > 0.3,
                        duration_minutes: Math.floor(Math.random() * 180),
                        zone: faker.random.arrayElement(['A', 'B', 'C', 'D'])
                    };
                    break;
                case 'waste':
                    sensor.data = {
                        fill_level: Math.floor(Math.random() * 100),
                        temperature: Math.floor(Math.random() * 40 + 10),
                        last_collection: faker.date.recent()
                    };
                    break;
                case 'lighting':
                    sensor.data = {
                        brightness: Math.floor(Math.random() * 100),
                        power_consumption: Math.floor(Math.random() * 200 + 50),
                        operational: Math.random() > 0.1
                    };
                    break;
                case 'water':
                    sensor.data = {
                        flow_rate: parseFloat((Math.random() * 100).toFixed(2)),
                        pressure: parseFloat((Math.random() * 10).toFixed(2)),
                        quality_index: Math.floor(Math.random() * 100),
                        leak_detected: Math.random() < 0.05
                    };
                    break;
                case 'energy':
                    sensor.data = {
                        consumption_kwh: parseFloat((Math.random() * 1000).toFixed(2)),
                        voltage: 220 + Math.random() * 20 - 10,
                        current: parseFloat((Math.random() * 50).toFixed(2)),
                        power_factor: Math.random()
                    };
                    break;
                case 'noise':
                    sensor.data = {
                        decibel_level: Math.floor(Math.random() * 60 + 40),
                        peak_frequency: Math.floor(Math.random() * 5000 + 100),
                        violation: Math.random() < 0.1
                    };
                    break;
            }

            data.push(sensor);
        }

        return data;
    }

    // Generate Public Transport Data
    static generatePublicTransportData(count = 30, options = {}) {
        const { centerLat = DEFAULT_CENTER.lat, centerLng = DEFAULT_CENTER.lng } = options;
        const data = [];
        const transportTypes = ['bus', 'metro', 'tram', 'train'];
        
        for (let i = 0; i < count; i++) {
            const vehicle = {
                vehicle_id: uuidv4(),
                type: faker.random.arrayElement(transportTypes),
                line_number: faker.random.arrayElement(['U1', 'U2', 'S1', 'S2', 'M1', 'M2', '100', '200', '300']),
                current_location: {
                    lat: centerLat + (Math.random() - 0.5) * 0.1,
                    lng: centerLng + (Math.random() - 0.5) * 0.1
                },
                next_stop: faker.address.streetName(),
                capacity: Math.floor(Math.random() * 100 + 50),
                occupancy: Math.floor(Math.random() * 100),
                delay_minutes: Math.floor(Math.random() * 15) - 5,
                speed_kmh: Math.floor(Math.random() * 60 + 10),
                timestamp: new Date().toISOString(),
                status: faker.random.arrayElement(['on_time', 'delayed', 'cancelled', 'maintenance'])
            };

            data.push(vehicle);
        }

        return data;
    }

    // Generate Emergency Services Data
    static generateEmergencyData(count = 20, options = {}) {
        const { centerLat = DEFAULT_CENTER.lat, centerLng = DEFAULT_CENTER.lng } = options;
        const data = [];
        const emergencyTypes = ['fire', 'medical', 'police', 'accident', 'natural_disaster'];
        const severityLevels = ['low', 'medium', 'high', 'critical'];
        
        for (let i = 0; i < count; i++) {
            const incident = {
                incident_id: uuidv4(),
                type: faker.random.arrayElement(emergencyTypes),
                severity: faker.random.arrayElement(severityLevels),
                location: {
                    lat: centerLat + (Math.random() - 0.5) * 0.1,
                    lng: centerLng + (Math.random() - 0.5) * 0.1,
                    address: faker.address.streetAddress()
                },
                reported_at: faker.date.recent(),
                response_time_minutes: Math.floor(Math.random() * 30 + 1),
                units_dispatched: Math.floor(Math.random() * 5 + 1),
                status: faker.random.arrayElement(['reported', 'dispatched', 'on_scene', 'resolved']),
                description: faker.lorem.sentence(),
                affected_people: Math.floor(Math.random() * 50)
            };

            data.push(incident);
        }

        return data;
    }
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Generate synthetic data endpoint
app.post('/api/generate', (req, res) => {
    const { dataType } = req.body;
    let { count = 100, options = {} } = req.body;
    // Clamp count to a safe range
    count = Math.max(1, Math.min(10000, Number(count) || 100));
    
    try {
        const data = SyntheticDataGenerator.generateData(dataType, count, options);
        res.json({
            success: true,
            dataType,
            count: data.length,
            data
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get data for map endpoint
app.get('/api/map', (req, res) => {
    const { topic } = req.query;
    
    try {
        const data = SyntheticDataGenerator.generateData(topic, 1000);
        res.json({
            success: true,
            topic,
            data
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// WebSocket connection for real-time data
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
        let request;
        try {
            request = JSON.parse(message);
        } catch (e) {
            console.warn('Invalid WS message, ignoring');
            return;
        }
        
        if (request.action === 'start_stream') {
            const { dataType, interval = 1000, options = {} } = request;
            
            // Stop existing stream for this connection if any
            if (activeStreams.has(ws)) {
                clearInterval(activeStreams.get(ws));
            }
            
// Clamp interval to avoid UI overload
const safeInterval = Math.max(100, Math.min(10000, Number(interval) || 1000));
// Start new stream
const streamInterval = setInterval(() => {
    try {
        const data = SyntheticDataGenerator.generateSingleData(dataType, options);
        ws.send(JSON.stringify({
            type: 'stream_data',
            dataType,
            data,
            timestamp: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Error generating data:', error);
    }
}, safeInterval);
            
            activeStreams.set(ws, streamInterval);
            
            ws.send(JSON.stringify({
                type: 'stream_started',
                dataType,
                interval: safeInterval
            }));
        }
        
        if (request.action === 'stop_stream') {
            if (activeStreams.has(ws)) {
                clearInterval(activeStreams.get(ws));
                activeStreams.delete(ws);
                ws.send(JSON.stringify({ type: 'stream_stopped' }));
            }
        }
    });
    
    ws.on('close', () => {
        // Clean up active streams
        if (activeStreams.has(ws)) {
            clearInterval(activeStreams.get(ws));
            activeStreams.delete(ws);
        }
        console.log('WebSocket connection closed');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
