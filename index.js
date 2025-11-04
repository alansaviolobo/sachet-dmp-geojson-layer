/**
 * Sachet API Cache Script
 *
 * This script fetches data from the Sachet API and saves it
 * to a cached JSON file that can be served via GitHub Pages.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {fileURLToPath} from 'url';

const API_URL = 'https://sachet.ndma.gov.in/cap_public_website/FetchLocationWiseAlerts?lat=15.486867644898695&long=73.81707691946626&radius=50';
const CACHE_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data/');
const OUTPUT_FILE = path.join(CACHE_DIRECTORY, 'goa-sachet-alerts.geojson');
const LOG_FILE = path.join(CACHE_DIRECTORY, 'debug-log.txt');

function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${message}\n`;
    if (data) {
        logMessage += (typeof data === 'string' ? data : JSON.stringify(data, null, 2)) + '\n';
    }

    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage);
}

// Main function to fetch and cache data
export async function fetchAndCacheData() {
    try {
        debugLog('Starting data fetch process');

        const response = await fetch(API_URL);
        debugLog(`API response status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const jsonData = await response.json();
        debugLog(`Received JSON response: ${JSON.stringify(jsonData)}...`);
        if (!(jsonData && (jsonData.responseMessage === 'Success'))) {
            throw new Error(`API Internal Error: ${JSON.stringify(jsonData)}`);
        }

        const result = {
            type: 'FeatureCollection',
            metadata: {
                timestamp: new Date().toISOString(),
                source: 'Sachet - National Disaster Alert Portal',
                count: jsonData.alerts.length
            },
            features: jsonData.alerts.map(row => {
                const {area_json, ...props} = row;
                return {
                    type: 'Feature',
                    properties: props,
                    geometry: JSON.parse(row.area_json),
                };
            })
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
        debugLog('Sachet data cached successfully!');
    } catch (error) {
        debugLog(`ERROR: ${error.message}`, error.stack);
        console.error('Error fetching or caching data:', error);
        process.exit(1);
    }
}

// Make sure the cache directory exists
if (!fs.existsSync(CACHE_DIRECTORY)) {
    fs.mkdirSync(CACHE_DIRECTORY, {recursive: true});
}

// Clear the debug log before starting
fs.writeFileSync(LOG_FILE, '');
debugLog('Debug logging initialized');

// Run only if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    fetchAndCacheData();
}