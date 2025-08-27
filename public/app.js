// Global variables
let currentData = [];
let ws = null;
let map = null;
let mapMarkers = [];
let charts = {};
const currentCenter = { lat: 50.9375, lng: 6.9603 }; // Cologne only

// Performance guards
const MAX_MARKERS = 1000;
const MAX_TABLE_ROWS = 100;
let lastUiUpdate = 0;
let lastStatsUpdate = 0;
let lastServerOnline = null;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    initializeEventListeners();
    initializeCharts();
    updateStatistics();
    initializeServerMonitor();
    initializeTheme();
    initializeCompact();
});

// Utils
function clamp(num, min, max) {
    const n = Number(num);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
}

// Initialize Leaflet Map
function initializeMap() {
map = L.map('map').setView([50.9375, 6.9603], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Initialize heatmap layer (will be populated later)
    window.heatmapLayer = null;
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Data type selection
    document.getElementById('dataType').addEventListener('change', handleDataTypeChange);
    
    // Data mode selection
    document.querySelectorAll('input[name="dataMode"]').forEach(radio => {
        radio.addEventListener('change', handleDataModeChange);
    });
    
    // Map visualization mode toggles
    const mapModeButtons = document.querySelectorAll('[data-map-mode]');
    if (mapModeButtons.length) {
        // restore persisted mode
        const savedMode = localStorage.getItem('mapMode') || 'points';
        setMapMode(savedMode);
        mapModeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mapMode;
                setMapMode(mode);
                if (currentData.length > 0) {
                    updateMapView(document.getElementById('dataType').value, currentData);
                }
            });
        });
    }
    
    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateData);
    
    // Stop stream button
    document.getElementById('stopStreamBtn').addEventListener('click', stopStream);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearData);
    
    // Export buttons
    document.getElementById('exportJson').addEventListener('click', () => exportData('json'));
    document.getElementById('exportCsv').addEventListener('click', () => exportData('csv'));
    document.getElementById('exportExcel').addEventListener('click', () => exportData('excel'));
    
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
            // Refresh map if switching to map view
            if (tabName === 'map' && currentData.length > 0) {
                updateMapView(document.getElementById('dataType').value, currentData);
            }
            // ARIA state
            document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tabName ? 'true' : 'false'));
        });
    });

    // City is fixed to Cologne; ensure any dynamic inputs reflect that when present
}

function setMapMode(mode) {
    localStorage.setItem('mapMode', mode);
    document.querySelectorAll('[data-map-mode]').forEach(b => {
        const active = b.dataset.mapMode === mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function getMapMode() {
    const active = document.querySelector('[data-map-mode].active');
    if (active) return active.dataset.mapMode;
    const saved = localStorage.getItem('mapMode');
    return saved || 'points';
}

// Theme
function initializeTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
        document.body.classList.add('theme-dark');
    }
    // Apply initial chart theme
    applyChartTheme();
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('theme-dark');
            const dark = document.body.classList.contains('theme-dark');
            localStorage.setItem('theme', dark ? 'dark' : 'light');
            btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
            applyChartTheme();
            rebuildChartStyles();
        });
        btn.setAttribute('aria-pressed', document.body.classList.contains('theme-dark') ? 'true' : 'false');
    }
}

// Compact mode
function initializeCompact() {
    const stored = localStorage.getItem('compact');
    // Auto-enable on first load for small screens
    if (stored === null && window.innerWidth <= 1024) {
        document.body.classList.add('compact');
        localStorage.setItem('compact', 'true');
    } else if (stored === 'true') {
        document.body.classList.add('compact');
    }
    const btn = document.getElementById('compactToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('compact');
            const on = document.body.classList.contains('compact');
            localStorage.setItem('compact', on ? 'true' : 'false');
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            // Resize map when toggling
            if (map) setTimeout(() => map.invalidateSize(), 150);
        });
        btn.setAttribute('aria-pressed', document.body.classList.contains('compact') ? 'true' : 'false');
    }
}

// Theme helpers for charts
function isDarkTheme() {
    return document.body.classList.contains('theme-dark');
}

function getSeriesColors() {
    if (isDarkTheme()) {
        return ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'];
    }
    return ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
}

function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    const dark = isDarkTheme();
    Chart.defaults.color = dark ? '#e5e7eb' : '#111827';
    Chart.defaults.borderColor = dark ? '#374151' : '#e5e7eb';
    Chart.defaults.font.family = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial";
}

function createLineGradient(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    if (isDarkTheme()) {
        gradient.addColorStop(0, 'rgba(96,165,250,0.35)');
        gradient.addColorStop(1, 'rgba(96,165,250,0.05)');
    } else {
        gradient.addColorStop(0, 'rgba(59,130,246,0.25)');
        gradient.addColorStop(1, 'rgba(59,130,246,0.05)');
    }
    return gradient;
}

function rebuildChartStyles() {
    if (!charts || !charts.main || !charts.pie || !charts.bar) return;
    // Main line chart
    const ctx = charts.main.ctx;
    charts.main.data.datasets[0].borderColor = isDarkTheme() ? '#60a5fa' : '#3b82f6';
    charts.main.data.datasets[0].backgroundColor = createLineGradient(ctx);
    charts.main.update('none');
    // Pie/Doughnut chart
    const colors = getSeriesColors();
    charts.pie.data.datasets[0].backgroundColor = colors;
    charts.pie.update('none');
    // Bar chart
    charts.bar.data.datasets[0].backgroundColor = (isDarkTheme() ? '#34d399' : '#10b981');
    charts.bar.update('none');
}

// Handle data type change
function handleDataTypeChange(e) {
    const dataType = e.target.value;
    const dynamicOptions = document.getElementById('dynamicOptions');
    
    if (!dataType) {
        dynamicOptions.classList.remove('active');
        dynamicOptions.innerHTML = '';
        return;
    }
    
    // Generate dynamic options based on data type
    let optionsHTML = '';
    
    switch(dataType) {
        case 'geo':
            optionsHTML = `
                <h4>Geographic Options</h4>
                <div class="form-group">
                    <label for="centerLat">Center Latitude</label>
                    <input type="number" id="centerLat" class="form-control" value="${currentCenter.lat}" step="0.0001">
                </div>
                <div class="form-group">
                    <label for="centerLng">Center Longitude</label>
                    <input type="number" id="centerLng" class="form-control" value="${currentCenter.lng}" step="0.0001">
                </div>
                <div class="form-group">
                    <label for="radius">Radius (degrees)</label>
                    <input type="number" id="radius" class="form-control" value="0.1" step="0.01">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="includeMetadata" checked>
                        <span>Include metadata</span>
                    </label>
                </div>
            `;
            break;
            
        case 'traffic':
            optionsHTML = `
                <h4>Traffic Options</h4>
                <div class="form-group">
                    <label for="centerLat">Center Latitude</label>
                    <input type="number" id="centerLat" class="form-control" value="${currentCenter.lat}" step="0.0001">
                </div>
                <div class="form-group">
                    <label for="centerLng">Center Longitude</label>
                    <input type="number" id="centerLng" class="form-control" value="${currentCenter.lng}" step="0.0001">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="includeVehicles" checked>
                        <span>Include vehicle details</span>
                    </label>
                </div>
            `;
            break;
            
        case 'financial':
            optionsHTML = `
                <h4>Financial Options</h4>
                <div class="form-group">
                    <label>Data Type</label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="finDataType" value="transactions" checked>
                            <span>Transactions</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="finDataType" value="budget">
                            <span>Budget Data</span>
                        </label>
                    </div>
                </div>
            `;
            break;
            
        case 'iot':
            optionsHTML = `
                <h4>IoT Sensor Options</h4>
                <div class="form-group">
                    <label>Sensor Types</label>
                    <div class="option-group">
                        <label class="checkbox-label">
                            <input type="checkbox" value="parking" class="sensor-type">
                            <span>Parking</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" value="waste" class="sensor-type">
                            <span>Waste</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" value="lighting" class="sensor-type">
                            <span>Lighting</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" value="water" class="sensor-type">
                            <span>Water</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" value="energy" class="sensor-type">
                            <span>Energy</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" value="noise" class="sensor-type">
                            <span>Noise</span>
                        </label>
                    </div>
                </div>
            `;
            break;
    }
    
    dynamicOptions.innerHTML = optionsHTML;
    dynamicOptions.classList.add('active');
}

// Handle data mode change
function handleDataModeChange(e) {
    const streamOptions = document.getElementById('streamOptions');
    if (e.target.value === 'realtime') {
        streamOptions.style.display = 'block';
    } else {
        streamOptions.style.display = 'none';
    }
}

// Generate synthetic data
async function generateData() {
    const dataType = document.getElementById('dataType').value;
    
    if (!dataType) {
        showNotification('Please select a data type', 'warning');
        return;
    }
    
    const dataMode = document.querySelector('input[name="dataMode"]:checked').value;
    const countInput = document.getElementById('dataCount');
    const count = clamp(countInput.value, 1, 10000);
    // Reflect clamped value in UI
    countInput.value = count;
    
    // Collect options based on data type
    const options = collectOptions(dataType);
    
    if (dataMode === 'static') {
        // Static data generation
        try {
            showLoading('Generating data…');
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataType, count, options })
            });
            
            const result = await response.json();
            
            if (result.success) {
                currentData = result.data;
                // Auto-switch to heatmap for large datasets
                maybeSwitchToHeatmap(dataType, currentData.length);
                visualizeData(dataType, result.data);
                updateStatistics();
                showNotification(`Generated ${result.count} ${dataType} records`, 'success');
            } else {
                showNotification('Error generating data', 'error');
            }
        } catch (error) {
            showNotification('Failed to generate data', 'error');
            console.error(error);
        } finally {
            hideLoading();
        }
    } else {
        // Real-time stream
        showLoading('Connecting stream…');
        startStream(dataType, options);
    }
}

// Collect options based on data type
function collectOptions(dataType) {
    const options = {};
    
    switch(dataType) {
        case 'geo':
        case 'traffic':
            const centerLat = document.getElementById('centerLat');
            const centerLng = document.getElementById('centerLng');
            if (centerLat) options.centerLat = parseFloat(centerLat.value);
            if (centerLng) options.centerLng = parseFloat(centerLng.value);
            
            const radius = document.getElementById('radius');
            if (radius) options.radius = parseFloat(radius.value);
            
            const includeMetadata = document.getElementById('includeMetadata');
            if (includeMetadata) options.includeMetadata = includeMetadata.checked;
            
            const includeVehicles = document.getElementById('includeVehicles');
            if (includeVehicles) options.includeVehicles = includeVehicles.checked;
            break;
            
        case 'financial':
            const finDataType = document.querySelector('input[name="finDataType"]:checked');
            if (finDataType) options.dataType = finDataType.value;
            // Attach center for location jitter
            options.centerLat = currentCenter.lat;
            options.centerLng = currentCenter.lng;
            break;
            
        case 'iot':
            const sensorTypes = Array.from(document.querySelectorAll('.sensor-type:checked'))
                .map(cb => cb.value);
            if (sensorTypes.length > 0) {
                options.sensorTypes = sensorTypes;
            }
            options.centerLat = currentCenter.lat;
            options.centerLng = currentCenter.lng;
            break;

        case 'transport':
            options.centerLat = currentCenter.lat;
            options.centerLng = currentCenter.lng;
            break;

        case 'emergency':
            options.centerLat = currentCenter.lat;
            options.centerLng = currentCenter.lng;
            break;
    }

    return options;
}

// Start real-time stream
function startStream(dataType, options) {
    if (ws) {
        ws.close();
    }
    
    // Connect to WebSocket (dynamic origin)
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${wsProtocol}://${location.host}`);
    // Prepare auto-fit for upcoming stream data
    if (window.__streamAutoFitTimer) {
        clearTimeout(window.__streamAutoFitTimer);
        window.__streamAutoFitTimer = null;
    }
    window.__streamAutoFitPending = true;
    window.__streamAutoFitPoints = [];
    
    ws.onopen = () => {
        const intervalInput = document.getElementById('streamInterval');
        const interval = clamp(intervalInput.value, 100, 10000);
        intervalInput.value = interval;
        ws.send(JSON.stringify({
            action: 'start_stream',
            dataType,
            interval,
            options
        }));
        
        document.getElementById('generateBtn').style.display = 'none';
        document.getElementById('stopStreamBtn').style.display = 'inline-flex';
        document.getElementById('streamStatus').textContent = 'Active';
        
        showNotification('Real-time stream started', 'success');
        // Fallback timer: auto-fit after a short delay if few points
        window.__streamAutoFitTimer = setTimeout(() => {
            if (window.__streamAutoFitPending && window.__streamAutoFitPoints.length > 0) {
                tryFitToPoints(window.__streamAutoFitPoints);
                window.__streamAutoFitPending = false;
            }
        }, 1500);
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'stream_data') {
            hideLoading();
            // Add new data to array (keep last 1000 records)
            currentData.push(message.data);
            if (currentData.length > 1000) {
                currentData.shift();
            }
            
            // Update visualizations
            updateStreamVisualization(message.dataType, message.data);
            updateStatistics();
            
            // Update last update time
            document.getElementById('lastUpdate').textContent = 
                new Date().toLocaleTimeString();
        }
    };
    
    ws.onerror = () => {
        showNotification('WebSocket error', 'error');
        stopStream();
        hideLoading();
    };
    
    ws.onclose = () => {
        document.getElementById('streamStatus').textContent = 'Idle';
        hideLoading();
        if (window.__streamAutoFitTimer) {
            clearTimeout(window.__streamAutoFitTimer);
            window.__streamAutoFitTimer = null;
        }
        window.__streamAutoFitPending = false;
    };
}

// Stop real-time stream
function stopStream() {
    if (ws) {
        ws.send(JSON.stringify({ action: 'stop_stream' }));
        ws.close();
        ws = null;
    }
    
    document.getElementById('generateBtn').style.display = 'inline-flex';
    document.getElementById('stopStreamBtn').style.display = 'none';
    document.getElementById('streamStatus').textContent = 'Idle';
    
    showNotification('Stream stopped', 'info');
}

// Clear all data
function clearData() {
    currentData = [];
    clearMapMarkers();
    clearCharts();
    clearTable();
    document.getElementById('rawData').textContent = '';
    updateStatistics();
    showNotification('Data cleared', 'info');
}

// Loading overlay helpers
function showLoading(text = 'Loading…') {
    const overlay = document.getElementById('loadingOverlay');
    const label = document.getElementById('loadingText');
    if (!overlay || !label) return;
    label.textContent = text;
    overlay.hidden = false;
    document.body.setAttribute('aria-busy', 'true');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    document.body.removeAttribute('aria-busy');
}

// Visualize data based on type
function visualizeData(dataType, data) {
    // Update all views
    updateMapView(dataType, data);
    updateChartView(dataType, data);
    updateTableView(data);
    updateRawView(data);
}

// Auto-switch to heatmap for large point-like datasets
function maybeSwitchToHeatmap(dataType, count) {
    const mapModeSelect = document.getElementById('mapVisualizationMode');
    if (!mapModeSelect) return;
    const pointHeavyTypes = new Set(['geo', 'traffic', 'iot', 'transport']);
    const threshold = 2000;
    if (pointHeavyTypes.has(dataType) && count > threshold && mapModeSelect.value === 'points') {
        mapModeSelect.value = 'heatmap';
        showNotification(`Large dataset (${count}). Switched map to Heatmap for performance.`, 'info');
    }
}

// Update stream visualization
function updateStreamVisualization(dataType, newData) {
    // Add to map if has location
    if (newData.lat && newData.lng) {
        addMapMarker(newData);
        if (window.__streamAutoFitPending) collectAutoFitPoint(newData.lat, newData.lng);
    } else if (newData.location) {
        addMapMarker({ ...newData, lat: newData.location.lat, lng: newData.location.lng });
        if (window.__streamAutoFitPending) collectAutoFitPoint(newData.location.lat, newData.location.lng);
    } else if (newData.coordinates) {
        // For traffic data with start/end coordinates
        if (newData.coordinates.start) {
            addMapMarker({ ...newData, lat: newData.coordinates.start.lat, lng: newData.coordinates.start.lng });
            if (window.__streamAutoFitPending) collectAutoFitPoint(newData.coordinates.start.lat, newData.coordinates.start.lng);
        }
    }
    
    // Throttle heavy UI updates to improve performance
    const now = Date.now();
    if (now - lastUiUpdate > 250) {
        // Update charts with rolling data
        updateRollingCharts(dataType);

        // Update table (show last rows)
        const recentData = currentData.slice(-MAX_TABLE_ROWS);
        updateTableView(recentData);

        // Update raw view
        updateRawView(recentData);
        lastUiUpdate = now;
    }
}

function collectAutoFitPoint(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    window.__streamAutoFitPoints.push([lat, lng]);
    if (window.__streamAutoFitPoints.length >= 12) {
        tryFitToPoints(window.__streamAutoFitPoints);
        window.__streamAutoFitPending = false;
        if (window.__streamAutoFitTimer) {
            clearTimeout(window.__streamAutoFitTimer);
            window.__streamAutoFitTimer = null;
        }
    }
}

function tryFitToPoints(points) {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.1));
    }
}

// Map visualization
function updateMapView(dataType, data) {
    clearMapMarkers();
    
    const visualizationMode = getMapMode();
    
    if (visualizationMode === 'heatmap') {
        // Create heatmap data
        const heatmapData = [];
        
        data.forEach(item => {
            let lat, lng, intensity = 1;
            
            if (item.lat && item.lng) {
                lat = item.lat;
                lng = item.lng;
            } else if (item.location) {
                lat = item.location.lat;
                lng = item.location.lng;
            } else if (item.coordinates && item.coordinates.start) {
                lat = item.coordinates.start.lat;
                lng = item.coordinates.start.lng;
            } else if (item.current_location) {
                lat = item.current_location.lat;
                lng = item.current_location.lng;
            }
            
            // Determine intensity based on data type
            if (lat && lng) {
                if (item.population_density) {
                    intensity = item.population_density / 100; // Scale down for heatmap
                } else if (item.congestion_level) {
                    intensity = item.congestion_level * 10;
                } else if (item.temperature) {
                    intensity = (item.temperature - 10) * 2; // Normalize temperature
                } else if (item.air_quality_index) {
                    intensity = item.air_quality_index / 20;
                } else if (item.occupancy !== undefined) {
                    intensity = item.occupancy / 10;
                }
                
                heatmapData.push([lat, lng, Math.min(intensity, 10)]);
            }
        });
        
        // Create heatmap layer (limit points for performance)
        if (heatmapData.length > 0) {
            const limited = heatmapData.length > 5000 ? heatmapData.slice(-5000) : heatmapData;
            window.heatmapLayer = L.heatLayer(limited, {
                radius: 25,
                blur: 15,
                maxZoom: 18
            }).addTo(map);

            // Fit map to heat points
            const latlngs = limited.map(p => [p[0], p[1]]);
            const bounds = L.latLngBounds(latlngs);
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.1));
            }
        } else {
            // No data, center to current city
            if (currentCenter && map) map.setView([currentCenter.lat, currentCenter.lng], 11);
        }
    } else {
        // Point visualization (original behavior)
        data.forEach(item => {
            if (item.lat && item.lng) {
                addMapMarker(item);
            } else if (item.location) {
                addMapMarker({ ...item, lat: item.location.lat, lng: item.location.lng });
            } else if (item.coordinates) {
                // For traffic data with start/end coordinates
                if (item.coordinates.start) {
                    // Draw line for traffic segments
                    const latlngs = [
                        [item.coordinates.start.lat, item.coordinates.start.lng],
                        [item.coordinates.end.lat, item.coordinates.end.lng]
                    ];
                    const polyline = L.polyline(latlngs, {
                        color: getTrafficColor(item.congestion_level),
                        weight: 3,
                        opacity: 0.7
                    }).addTo(map);
                    mapMarkers.push(polyline);
                    
                    // Add popup
                    polyline.bindPopup(createPopupContent(item));
                }
            } else if (item.current_location) {
                // For public transport
                addMapMarker({ ...item, lat: item.current_location.lat, lng: item.current_location.lng });
            }
        });
        
        // Fit map to markers if any
        if (mapMarkers.length > 0) {
            const group = new L.featureGroup(mapMarkers);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            // No data, center to current city
            if (currentCenter && map) map.setView([currentCenter.lat, currentCenter.lng], 11);
        }
    }
}

function addMapMarker(item) {
    const marker = L.circleMarker([item.lat, item.lng], {
        radius: 6,
        fillColor: getMarkerColor(item),
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    
    marker.bindPopup(createPopupContent(item));
    mapMarkers.push(marker);
    if (mapMarkers.length > MAX_MARKERS) {
        const oldest = mapMarkers.shift();
        map.removeLayer(oldest);
    }
}

function clearMapMarkers() {
    // Clear point markers
    mapMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    mapMarkers = [];
    
    // Clear heatmap layer
    if (window.heatmapLayer) {
        map.removeLayer(window.heatmapLayer);
        window.heatmapLayer = null;
    }
}

function getMarkerColor(item) {
    if (item.type) {
        const typeColors = {
            residential: '#10b981',
            commercial: '#3b82f6',
            industrial: '#f59e0b',
            public: '#8b5cf6',
            green_space: '#22c55e',
            parking: '#6366f1',
            waste: '#f97316',
            lighting: '#facc15',
            water: '#06b6d4',
            energy: '#ec4899',
            noise: '#ef4444'
        };
        return typeColors[item.type] || '#6b7280';
    }
    return '#3b82f6';
}

function getTrafficColor(congestionLevel) {
    if (congestionLevel < 0.3) return '#22c55e';
    if (congestionLevel < 0.6) return '#f59e0b';
    return '#ef4444';
}

function createPopupContent(item) {
    let content = '<div style="min-width: 200px;">';
    
    if (item.id) content += `<strong>ID:</strong> ${item.id.slice(0, 8)}...<br>`;
    if (item.type) content += `<strong>Type:</strong> ${item.type}<br>`;
    if (item.name) content += `<strong>Name:</strong> ${item.name}<br>`;
    if (item.temperature) content += `<strong>Temperature:</strong> ${item.temperature}°C<br>`;
    if (item.congestion_level) content += `<strong>Congestion:</strong> ${(item.congestion_level * 100).toFixed(0)}%<br>`;
    if (item.current_speed) content += `<strong>Speed:</strong> ${item.current_speed} km/h<br>`;
    if (item.vehicle_count) content += `<strong>Vehicles:</strong> ${item.vehicle_count}<br>`;
    if (item.occupancy !== undefined) content += `<strong>Occupancy:</strong> ${item.occupancy}%<br>`;
    
    if (item.metadata) {
        content += '<hr style="margin: 5px 0;">';
        if (item.metadata.address) content += `<strong>Address:</strong> ${item.metadata.address}<br>`;
        if (item.metadata.population_density) content += `<strong>Pop. Density:</strong> ${item.metadata.population_density}<br>`;
    }
    
    if (item.data) {
        content += '<hr style="margin: 5px 0;">';
        Object.entries(item.data).forEach(([key, value]) => {
            content += `<strong>${key.replace(/_/g, ' ')}:</strong> ${value}<br>`;
        });
    }
    
    content += '</div>';
    return content;
}

// Chart visualization
function initializeCharts() {
    // Main chart
    const mainCtx = document.getElementById('mainChart').getContext('2d');
    charts.main = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Data Stream',
                data: [],
                borderColor: isDarkTheme() ? '#60a5fa' : '#3b82f6',
                backgroundColor: createLineGradient(mainCtx),
                tension: 0.35,
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: true, position: 'bottom' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true }
            }
        }
    });
    
    // Pie chart
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    charts.pie = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: getSeriesColors(),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: { legend: { position: 'bottom' } }
        }
    });
    
    // Bar chart
    const barCtx = document.getElementById('barChart').getContext('2d');
    charts.bar = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Distribution',
                data: [],
                backgroundColor: isDarkTheme() ? '#34d399' : '#10b981',
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: { legend: { display: true, position: 'bottom' } },
            animation: { duration: 350 }
        }
    });
}

function updateChartView(dataType, data) {
    clearCharts();
    
    if (data.length === 0) return;
    
    // Update charts based on data type
    switch(dataType) {
        case 'climate':
            updateClimateCharts(data);
            break;
        case 'traffic':
            updateTrafficCharts(data);
            break;
        case 'social':
            updateSocialCharts(data);
            break;
        case 'financial':
            updateFinancialCharts(data);
            break;
        case 'iot':
            updateIoTCharts(data);
            break;
        default:
            updateGenericCharts(data);
    }
}

function updateClimateCharts(data) {
    // Temperature over time
    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
    const temperatures = data.map(d => d.temperature);
    
    charts.main.data.labels = labels;
    charts.main.data.datasets[0].label = 'Temperature (°C)';
    charts.main.data.datasets[0].data = temperatures;
    charts.main.update();
    
    // Weather conditions distribution
    const conditions = {};
    data.forEach(d => {
        if (d.weather_condition) {
            conditions[d.weather_condition] = (conditions[d.weather_condition] || 0) + 1;
        }
    });
    
    charts.pie.data.labels = Object.keys(conditions);
    charts.pie.data.datasets[0].data = Object.values(conditions);
    charts.pie.update();
    
    // Air quality
    const airQuality = data.map(d => d.air_quality_index || 0);
    charts.bar.data.labels = labels.slice(0, 20);
    charts.bar.data.datasets[0].label = 'Air Quality Index';
    charts.bar.data.datasets[0].data = airQuality.slice(0, 20);
    charts.bar.update();
}

function updateTrafficCharts(data) {
    // Speed distribution
    const speeds = data.map(d => d.current_speed || 0);
    charts.main.data.labels = data.map((_, i) => `Segment ${i + 1}`).slice(0, 50);
    charts.main.data.datasets[0].label = 'Current Speed (km/h)';
    charts.main.data.datasets[0].data = speeds.slice(0, 50);
    charts.main.update();
    
    // Road type distribution
    const roadTypes = {};
    data.forEach(d => {
        if (d.road_type) {
            roadTypes[d.road_type] = (roadTypes[d.road_type] || 0) + 1;
        }
    });
    
    charts.pie.data.labels = Object.keys(roadTypes);
    charts.pie.data.datasets[0].data = Object.values(roadTypes);
    charts.pie.update();
    
    // Congestion levels
    const congestionLevels = data.map(d => (d.congestion_level || 0) * 100);
    charts.bar.data.labels = data.map((_, i) => `Seg ${i + 1}`).slice(0, 20);
    charts.bar.data.datasets[0].label = 'Congestion Level (%)';
    charts.bar.data.datasets[0].data = congestionLevels.slice(0, 20);
    charts.bar.update();
}

function updateSocialCharts(data) {
    // Age distribution
    const ageGroups = { '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    data.forEach(d => {
        if (d.age < 31) ageGroups['18-30']++;
        else if (d.age < 46) ageGroups['31-45']++;
        else if (d.age < 61) ageGroups['46-60']++;
        else ageGroups['60+']++;
    });
    
    charts.pie.data.labels = Object.keys(ageGroups);
    charts.pie.data.datasets[0].data = Object.values(ageGroups);
    charts.pie.update();
    
    // Income brackets
    const incomeBrackets = {};
    data.forEach(d => {
        if (d.income_bracket) {
            incomeBrackets[d.income_bracket] = (incomeBrackets[d.income_bracket] || 0) + 1;
        }
    });
    
    charts.bar.data.labels = Object.keys(incomeBrackets);
    charts.bar.data.datasets[0].label = 'Income Distribution';
    charts.bar.data.datasets[0].data = Object.values(incomeBrackets);
    charts.bar.update();
}

function updateFinancialCharts(data) {
    if (data[0] && data[0].transaction_id) {
        // Transaction amounts
        const amounts = data.map(d => d.amount || 0);
        charts.main.data.labels = data.map((_, i) => `Trans ${i + 1}`).slice(0, 50);
        charts.main.data.datasets[0].label = 'Transaction Amount';
        charts.main.data.datasets[0].data = amounts.slice(0, 50);
        charts.main.update();
        
        // Category distribution
        const categories = {};
        data.forEach(d => {
            if (d.category) {
                categories[d.category] = (categories[d.category] || 0) + 1;
            }
        });
        
        charts.pie.data.labels = Object.keys(categories);
        charts.pie.data.datasets[0].data = Object.values(categories);
        charts.pie.update();
    } else if (data[0] && data[0].category) {
        // Budget data
        const budgets = data.map(d => d.allocated_budget || 0);
        const spent = data.map(d => d.spent || 0);
        
        charts.bar.data.labels = data.map(d => d.category);
        charts.bar.data.datasets = [
            {
                label: 'Allocated',
                data: budgets,
                backgroundColor: '#3b82f6'
            },
            {
                label: 'Spent',
                data: spent,
                backgroundColor: '#10b981'
            }
        ];
        charts.bar.update();
    }
}

function updateIoTCharts(data) {
    // Sensor type distribution
    const sensorTypes = {};
    data.forEach(d => {
        if (d.type) {
            sensorTypes[d.type] = (sensorTypes[d.type] || 0) + 1;
        }
    });
    
    charts.pie.data.labels = Object.keys(sensorTypes);
    charts.pie.data.datasets[0].data = Object.values(sensorTypes);
    charts.pie.update();
    
    // Battery levels
    const batteryLevels = data.map(d => d.battery_level || 0);
    charts.main.data.labels = data.map((_, i) => `Sensor ${i + 1}`).slice(0, 50);
    charts.main.data.datasets[0].label = 'Battery Level (%)';
    charts.main.data.datasets[0].data = batteryLevels.slice(0, 50);
    charts.main.update();
    
    // Status distribution
    const statuses = {};
    data.forEach(d => {
        if (d.status) {
            statuses[d.status] = (statuses[d.status] || 0) + 1;
        }
    });
    
    charts.bar.data.labels = Object.keys(statuses);
    charts.bar.data.datasets[0].label = 'Sensor Status';
    charts.bar.data.datasets[0].data = Object.values(statuses);
    charts.bar.update();
}

function updateGenericCharts(data) {
    // Try to find numeric fields for visualization
    const sample = data[0];
    const numericFields = Object.keys(sample).filter(key => 
        typeof sample[key] === 'number'
    );
    
    if (numericFields.length > 0) {
        const field = numericFields[0];
        const values = data.map(d => d[field] || 0);
        
        charts.main.data.labels = data.map((_, i) => `Item ${i + 1}`).slice(0, 50);
        charts.main.data.datasets[0].label = field;
        charts.main.data.datasets[0].data = values.slice(0, 50);
        charts.main.update();
    }
}

function updateRollingCharts(dataType) {
    // Update charts with last 50 data points
    const recentData = currentData.slice(-50);
    updateChartView(dataType, recentData);
}

function clearCharts() {
    Object.values(charts).forEach(chart => {
        chart.data.labels = [];
        chart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        chart.update();
    });
}

// Table visualization
function updateTableView(data) {
    const table = document.getElementById('dataTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    if (data.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 20px;">No data to display</td></tr>';
        return;
    }
    
    // Get column headers from first item
    const sample = data[0];
    const columns = Object.keys(sample).filter(key => 
        typeof sample[key] !== 'object' || sample[key] === null
    );
    
    // Create header
    thead.innerHTML = `
        <tr>
            ${columns.map(col => `<th>${col}</th>`).join('')}
        </tr>
    `;
    
    // Create rows (limit for performance)
    const displayData = data.slice(0, MAX_TABLE_ROWS);
    tbody.innerHTML = displayData.map(item => `
        <tr>
            ${columns.map(col => {
                let value = item[col];
                if (value === null || value === undefined) {
                    value = '-';
                } else if (typeof value === 'boolean') {
                    value = value ? 'Yes' : 'No';
                } else if (typeof value === 'number') {
                    value = Number.isInteger(value) ? value : value.toFixed(2);
                } else if (value instanceof Date) {
                    value = value.toLocaleString();
                }
                return `<td>${value}</td>`;
            }).join('')}
        </tr>
    `).join('');
}

function clearTable() {
    const table = document.getElementById('dataTable');
    table.querySelector('thead').innerHTML = '';
    table.querySelector('tbody').innerHTML = '';
}

// Raw data view
function updateRawView(data) {
    const rawData = document.getElementById('rawData');
    rawData.textContent = JSON.stringify(data, null, 2);
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabName}View`);
    });
    
    // Resize map if switching to map view
    if (tabName === 'map' && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }
}

// Export functionality
function exportData(format) {
    if (currentData.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    switch(format) {
        case 'json':
            exportJSON();
            break;
        case 'csv':
            exportCSV();
            break;
        case 'excel':
            exportExcel();
            break;
    }
}

function exportJSON() {
    const jsonStr = JSON.stringify(currentData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthetic_data_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Data exported as JSON', 'success');
}

function exportCSV() {
    if (currentData.length === 0) return;
    
    // Flatten nested objects for CSV
    const flattenedData = currentData.map(item => {
        const flat = {};
        for (const key in item) {
            if (typeof item[key] === 'object' && item[key] !== null) {
                if (item[key].lat !== undefined && item[key].lng !== undefined) {
                    flat[`${key}_lat`] = item[key].lat;
                    flat[`${key}_lng`] = item[key].lng;
                } else {
                    flat[key] = JSON.stringify(item[key]);
                }
            } else {
                flat[key] = item[key];
            }
        }
        return flat;
    });
    
    const csv = Papa.unparse(flattenedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthetic_data_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Data exported as CSV', 'success');
}

function exportExcel() {
    if (currentData.length === 0) return;
    
    // Flatten nested objects for Excel
    const flattenedData = currentData.map(item => {
        const flat = {};
        for (const key in item) {
            if (typeof item[key] === 'object' && item[key] !== null) {
                if (item[key].lat !== undefined && item[key].lng !== undefined) {
                    flat[`${key}_lat`] = item[key].lat;
                    flat[`${key}_lng`] = item[key].lng;
                } else {
                    flat[key] = JSON.stringify(item[key]);
                }
            } else {
                flat[key] = item[key];
            }
        }
        return flat;
    });
    
    const ws = XLSX.utils.json_to_sheet(flattenedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Synthetic Data');
    
    // Generate Excel file
    XLSX.writeFile(wb, `synthetic_data_${Date.now()}.xlsx`);
    showNotification('Data exported as Excel', 'success');
}

// Statistics
function updateStatistics() {
    const now = Date.now();
    if (now - lastStatsUpdate < 500) return; // throttle
    // Total records
    document.getElementById('totalRecords').textContent = currentData.length;
    
    // Data size
    const dataSize = new Blob([JSON.stringify(currentData)]).size;
    let sizeText = '0 KB';
    if (dataSize < 1024) {
        sizeText = `${dataSize} B`;
    } else if (dataSize < 1024 * 1024) {
        sizeText = `${(dataSize / 1024).toFixed(1)} KB`;
    } else {
        sizeText = `${(dataSize / (1024 * 1024)).toFixed(1)} MB`;
    }
    document.getElementById('dataSize').textContent = sizeText;
    
    // Last update
    if (currentData.length > 0) {
        const lastItem = currentData[currentData.length - 1];
        if (lastItem.timestamp) {
            document.getElementById('lastUpdate').textContent = 
                new Date(lastItem.timestamp).toLocaleTimeString();
        }
    }
    lastStatsUpdate = now;
}

// Server monitor
function initializeServerMonitor() {
    const ping = async () => {
        const start = performance.now();
        try {
            const res = await fetch('/api/health', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            await res.json();
            const latency = Math.round(performance.now() - start);
            setServerStatus(true, latency);
        } catch (e) {
            setServerStatus(false);
        }
    };
    // initial
    ping();
    // repeat every 10s
    setInterval(ping, 10000);
}

function setServerStatus(isOnline, latencyMs) {
    const statusEl = document.getElementById('serverStatus');
    const latencyEl = document.getElementById('serverLatency');
    if (!statusEl || !latencyEl) return;
    if (isOnline) {
        statusEl.textContent = 'Online';
        statusEl.style.color = '#10b981';
        if (typeof latencyMs === 'number') {
            latencyEl.textContent = `Latency: ${latencyMs} ms`;
        }
        if (lastServerOnline === false) {
            // Only notify when state changes
            showNotification('Server is back online', 'success');
        }
        lastServerOnline = true;
        setButtonsEnabled(true);
    } else {
        statusEl.textContent = 'Offline';
        statusEl.style.color = '#ef4444';
        latencyEl.textContent = 'Latency: -';
        if (lastServerOnline !== false) {
            showNotification('Cannot reach server (health check failed)', 'warning');
        }
        lastServerOnline = false;
        setButtonsEnabled(false);
    }
}

function setButtonsEnabled(enabled) {
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) generateBtn.disabled = !enabled;
    const stopBtn = document.getElementById('stopStreamBtn');
    // Keep Stop enabled if a WS is active so user can close it
    if (stopBtn) stopBtn.disabled = !enabled && !ws;
}

// Notifications
function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    
    notifications.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// Add slideOut animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
