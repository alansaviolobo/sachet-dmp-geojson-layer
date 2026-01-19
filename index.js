/**
 * Sachet API Cache Script
 *
 * This script fetches data from the Sachet API and saves it
 * to a cached JSON file that can be served via GitHub Pages.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const API_URL = 'https://sachet.ndma.gov.in/cap_public_website/FetchLocationWiseAlerts?lat=15.486867644898695&long=73.81707691946626&radius=50';
const CACHE_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data/');
const OUTPUT_FILE = path.join(CACHE_DIRECTORY, 'goa-sachet-alerts.geojson');
const LOG_FILE = path.join(CACHE_DIRECTORY, 'debug-log.txt');
const NRSC_API_URL = 'https://ndem.nrsc.gov.in/documents/ndemV5/API/dbFetch.php?module=getWarnings';
const TARGET_DISTRICTS = ['NORTH GOA', 'SOUTH GOA', 'KUSHAVATI'];

function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${message}\n`;
    if (data) {
        logMessage += (typeof data === 'string' ? data : JSON.stringify(data, null, 2)) + '\n';
    }

    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage);
}

/**
 * Validates if the dist property includes any of the target districts.
 * The check is case-insensitive.
 */
function isTargetDistrict(dist) {
    if (!dist) return false;
    const upperDist = dist.toUpperCase();
    return TARGET_DISTRICTS.some(target => upperDist.includes(target));
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
                const { area_json, ...props } = row;
                return {
                    type: 'Feature',
                    properties: props,
                    geometry: JSON.parse(row.area_json),
                };
            })
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
        debugLog('Sachet data cached successfully!');
        return true; // Success
    } catch (error) {
        debugLog(`ERROR: ${error.message}`, error.stack);
        console.error('Error fetching or caching data:', error);
        return false; // Failure
    }
}

// Function to fetch and cache NRSC data
export async function fetchAndCacheNRSCData() {
    try {
        debugLog('Starting NRSC data fetch process');

        const response = await fetch(NRSC_API_URL);
        debugLog(`NRSC API response status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`NRSC API responded with status: ${response.status}`);
        }

        const jsonData = await response.json();
        const keys = Object.keys(jsonData);
        debugLog(`Received NRSC data with keys: ${keys.join(', ')}`);

        for (const key of keys) {
            const layerData = jsonData[key];

            // The API structure seems to be { layerId: "...", geoJson: { ... } } or potentially direct GeoJSON
            // Based on the observed response, it is inside 'geoJson' property

            let featureCollection = null;
            if (layerData.geoJson && layerData.geoJson.type === 'FeatureCollection') {
                featureCollection = layerData.geoJson;
            } else if (layerData.type === 'FeatureCollection') {
                featureCollection = layerData;
            }

            if (!featureCollection) {
                debugLog(`Skipping key '${key}': No valid FeatureCollection found.`);
                continue;
            }

            const activeAlerts = featureCollection.features.filter(feature => {
                return feature.properties && isTargetDistrict(feature.properties.dist);
            });

            if (activeAlerts.length > 0) {
                const filteredCollection = {
                    type: 'FeatureCollection',
                    metadata: {
                        timestamp: new Date().toISOString(),
                        source: 'NRSC - National Remote Sensing Centre',
                        originalLayerId: layerData.layerId || key,
                        count: activeAlerts.length
                    },
                    features: activeAlerts
                };

                const fileName = `${key}.geojson`;
                const filePath = path.join(CACHE_DIRECTORY, fileName);
                fs.writeFileSync(filePath, JSON.stringify(filteredCollection, null, 2));
                debugLog(`Saved ${activeAlerts.length} alerts to ${fileName}`);
            } else {
                debugLog(`No active alerts for target districts in '${key}'`);
            }
        }
        return true; // Success
    } catch (error) {
        debugLog(`ERROR in NRSC fetch: ${error.message}`, error.stack);
        console.error('Error fetching or caching NRSC data:', error);
        return false; // Failure
    }
}

// Make sure the cache directory exists
if (!fs.existsSync(CACHE_DIRECTORY)) {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
}

// Clear the debug log before starting
fs.writeFileSync(LOG_FILE, '');
debugLog('Debug logging initialized');

// Run only if this file is executed directly
// Robust check for ES Main entry point that works in local and CI/Action environments
const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1];

if (currentFile === executedFile || executedFile.endsWith(path.basename(currentFile))) {
    (async () => {
        console.log('Starting Sachet & NRSC Data Fetch...');

        const results = await Promise.allSettled([
            fetchAndCacheData(),
            fetchAndCacheNRSCData()
        ]);

        const sachetSuccess = results[0].status === 'fulfilled' && results[0].value === true;
        const nrscSuccess = results[1].status === 'fulfilled' && results[1].value === true;

        if (!sachetSuccess) console.error('Sachet Data Fetch Failed');
        if (!nrscSuccess) console.error('NRSC Data Fetch Failed');

        if (!sachetSuccess || !nrscSuccess) {
            console.error('One or more fetch processes failed.');
            process.exit(1);
        } else {
            console.log('All fetch processes completed successfully.');
            process.exit(0);
        }
    })();
}