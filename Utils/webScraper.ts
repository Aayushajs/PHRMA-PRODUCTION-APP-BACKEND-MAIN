/**
 * Web Scraping Utilities for MRP Verification
 * Handles scraping from Netmeds, Pharmeasy, 1mg, and DPCO
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { redis } from '../config/redis';

export interface ScrapedProduct {
    source: string;
    productName: string;
    mrp: number;
    packSize: string;
    formula?: string;
    company?: string;
    url?: string;
}

/**
 * Generic scraper with retry logic
 */
async function scrapeWithRetry(
    url: string,
    parser: (html: string) => ScrapedProduct | null,
    maxRetries: number = 2
): Promise<ScrapedProduct | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: 8000,
            });

            return parser(response.data);
        } catch (error) {
            console.error(`Scraping attempt ${attempt + 1} failed:`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }
    return null;
}

/**
 * Scrape Netmeds
 */
export async function scrapeNetmeds(query: string): Promise<ScrapedProduct | null> {
    const cacheKey = `scrape:netmeds:${query}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `https://www.netmeds.com/catalogsearch/result/?q=${encodeURIComponent(query)}`;

    const parser = (html: string): ScrapedProduct | null => {
        const $ = cheerio.load(html);

        // Find first product card
        const firstProduct = $('.product-item').first();
        if (!firstProduct.length) return null;

        const productName = firstProduct.find('.clsgetname').text().trim();
        const priceText = firstProduct.find('.final-price').text().trim();
        const packSize = firstProduct.find('.drug_content').text().trim() || '1 unit';

        const mrp = parseFloat(priceText.replace(/[^\d.]/g, ''));

        if (!productName || !mrp) return null;

        return {
            source: 'Netmeds',
            productName,
            mrp,
            packSize,
            url
        };
    };

    const result = await scrapeWithRetry(url, parser);
    if (result) {
        await redis.set(cacheKey, JSON.stringify(result), { EX: 86400 }); // 24h
    }

    return result;
}

/**
 * Scrape Pharmeasy
 */
export async function scrapePharmeasy(query: string): Promise<ScrapedProduct | null> {
    const cacheKey = `scrape:pharmeasy:${query}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`;

    const parser = (html: string): ScrapedProduct | null => {
        const $ = cheerio.load(html);

        const firstProduct = $('.ProductCard_medicineUnitWrapper__eoLpy').first();
        if (!firstProduct.length) return null;

        const productName = firstProduct.find('.ProductCard_medicineName__8Ydfq').text().trim();
        const priceText = firstProduct.find('.ProductCard_ourPrice__yDytt').text().trim();
        const packSize = firstProduct.find('.ProductCard_packSize__ZiMVJ').text().trim() || '1 unit';

        const mrp = parseFloat(priceText.replace(/[^\d.]/g, ''));

        if (!productName || !mrp) return null;

        return {
            source: 'Pharmeasy',
            productName,
            mrp,
            packSize,
            url
        };
    };

    const result = await scrapeWithRetry(url, parser);
    if (result) {
        await redis.set(cacheKey, JSON.stringify(result), { EX: 86400 });
    }

    return result;
}

/**
 * Scrape 1mg
 */
export async function scrape1mg(query: string): Promise<ScrapedProduct | null> {
    const cacheKey = `scrape:1mg:${query}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`;

    const parser = (html: string): ScrapedProduct | null => {
        const $ = cheerio.load(html);

        const firstProduct = $('.style__product-card___1gbex').first();
        if (!firstProduct.length) return null;

        const productName = firstProduct.find('.style__pro-title___3zxNC').text().trim();
        const priceText = firstProduct.find('.style__price-tag___B2csA').text().trim();
        const packSize = firstProduct.find('.style__pack-size___2JD70').text().trim() || '1 unit';
        const formula = firstProduct.find('.style__saltInfo___qkcWB').text().trim();

        const mrp = parseFloat(priceText.replace(/[^\d.]/g, ''));

        if (!productName || !mrp) return null;

        return {
            source: '1mg',
            productName,
            mrp,
            packSize,
            formula,
            url
        };
    };

    const result = await scrapeWithRetry(url, parser);
    if (result) {
        await redis.set(cacheKey, JSON.stringify(result), { EX: 86400 });
    }

    return result;
}

/**
 * Scrape DPCO ceiling price
 */
export async function scrapeDPCO(drugName: string): Promise<{ ceilingPrice: number } | null> {
    const cacheKey = `scrape:dpco:${drugName}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Note: DPCO doesn't have a simple search API
    // This is a placeholder - in production, use NPPA's actual data
    // or maintain a local DPCO database

    return null;
}

/**
 * Scrape all sources in parallel
 */
export async function scrapeAllSources(query: string): Promise<ScrapedProduct[]> {
    const results = await Promise.allSettled([
        scrapeNetmeds(query),
        scrapePharmeasy(query),
        scrape1mg(query),
    ]);

    return results
        .filter((r): r is PromiseFulfilledResult<ScrapedProduct | null> =>
            r.status === 'fulfilled' && r.value !== null
        )
        .map(r => r.value as ScrapedProduct);
}
