/**
 * Main execution script for caching the sachet data.
 */

import { fetchAndCacheData } from './fetch-data.js';

async function main() {
    try {
        await fetchAndCacheData();
        console.log('Completed all operations successfully');
    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
}

main();