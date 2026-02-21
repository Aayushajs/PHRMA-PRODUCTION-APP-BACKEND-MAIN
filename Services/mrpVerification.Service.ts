/**
 * Advanced MRP Verification Service
 * Implements 7-stage matching and price validation
 */

import { scrapeAllSources, ScrapedProduct } from '../Utils/webScraper';
import {
    calculateCompositeSimilarity,
    extractPackSize,
    normalizeProductName,
    stringSimilarity
} from '../Utils/stringSimilarity';

export interface MRPVerificationInput {
    itemName: string;
    itemCompany?: string;
    formula?: string;
    userEnteredPrice: number;
    packSize?: string;
    category?: string;
}

export interface MRPReference {
    source: string;
    matchedProduct: string;
    mrp: number;
    pack: string;
    normalizedMRP: number;
    weightUsed: number;
    matchScore: number;
}

export interface MRPVerificationResult {
    status: 'approved' | 'warning' | 'rejected';
    systemFinalMRP: number;
    userEnteredPrice: number;
    maxAllowedPrice: number;
    realtimeReferences: MRPReference[];
    finalScore: number;
    reason: string;
    difference: string;
    stageUsed: string;
    needsAdminReview: boolean;
}

export class MRPVerificationService {
    private static readonly WEIGHTS: Record<string, number> = {
        'netmeds': 0.30,
        'pharmeasy': 0.30,
        '1mg': 0.20,
        'dpco': 0.20
    };

    private static readonly STAGE_2_THRESHOLD = 0.75;
    private static readonly MAX_DEVIATION_PERCENT = 30;
    private static readonly TOLERANCE_PERCENT = 3;
    private static readonly MAX_SELL_MARGIN = 0.05;

    /**
     * Main verification method
     */
    public static async verifyMRP(input: MRPVerificationInput): Promise<MRPVerificationResult> {
        try {
            const scrapedProducts = await scrapeAllSources(input.itemName);

            if (scrapedProducts.length === 0) {
                return this.createFallbackResult(input, 'No market data available');
            }

            const matchResult = await this.executeSevenStageMatching(input, scrapedProducts);

            if (!matchResult) {
                return this.createFallbackResult(input, 'Could not match product in market');
            }

            const finalResult = this.processPricesAndCalculate(input, matchResult);
            return finalResult;
        } catch (error) {
            console.error('MRP Verification Error:', error);
            return this.createFallbackResult(input, 'Verification failed due to system error');
        }
    }

    /**
     * 7-Stage Matching Algorithm
     */
    private static async executeSevenStageMatching(
        input: MRPVerificationInput,
        scrapedProducts: ScrapedProduct[]
    ): Promise<{ stage: string; references: MRPReference[] } | null> {
        // Stage 1: Exact Match
        const exactMatches = this.stage1ExactMatch(input, scrapedProducts);
        if (exactMatches.length > 0) {
            return { stage: 'Stage 1: Exact Match', references: exactMatches };
        }

        // Stage 2: Strong Similarity
        const strongMatches = this.stage2StrongSimilarity(input, scrapedProducts);
        if (strongMatches.length > 0) {
            return { stage: 'Stage 2: Strong Similarity', references: strongMatches };
        }

        // Stage 3: Formula Lookup
        if (input.formula) {
            const formulaMatches = this.stage3FormulaLookup(input, scrapedProducts);
            if (formulaMatches.length > 0) {
                return { stage: 'Stage 3: Formula Lookup', references: formulaMatches };
            }
        }

        // Stage 7: Final Fallback
        if (scrapedProducts.length > 0) {
            const fallbackMatches = this.stage7Fallback(input, scrapedProducts);
            return { stage: 'Stage 7: Industry Average Fallback', references: fallbackMatches };
        }

        return null;
    }

    /**
     * Stage 1: Exact Match
     */
    private static stage1ExactMatch(
        input: MRPVerificationInput,
        products: ScrapedProduct[]
    ): MRPReference[] {
        const normalized = normalizeProductName(input.itemName);

        return products
            .filter(p => normalizeProductName(p.productName) === normalized)
            .map(p => this.createReference(p, input, 1.0));
    }

    /**
     * Stage 2: Strong Similarity (>= 0.75)
     */
    private static stage2StrongSimilarity(
        input: MRPVerificationInput,
        products: ScrapedProduct[]
    ): MRPReference[] {
        const matches: Array<{ product: ScrapedProduct; score: number }> = [];

        for (const product of products) {
            const score = calculateCompositeSimilarity(
                input.itemName,
                input.formula || '',
                input.itemCompany || '',
                product.productName,
                product.formula || '',
                product.company || ''
            );

            if (score >= this.STAGE_2_THRESHOLD) {
                matches.push({ product, score });
            }
        }

        return matches
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(m => this.createReference(m.product, input, m.score));
    }

    /**
     * Stage 3: Formula Lookup
     */
    private static stage3FormulaLookup(
        input: MRPVerificationInput,
        products: ScrapedProduct[]
    ): MRPReference[] {
        if (!input.formula) return [];

        const matches = products.filter(p => {
            if (!p.formula) return false;
            const similarity = stringSimilarity(input.formula || '', p.formula);
            return similarity >= 0.8;
        });

        return matches.map(p => this.createReference(p, input, 0.8));
    }

    /**
     * Stage 7: Fallback (use all available data)
     */
    private static stage7Fallback(
        input: MRPVerificationInput,
        products: ScrapedProduct[]
    ): MRPReference[] {
        const scored = products.map(p => ({
            product: p,
            score: stringSimilarity(input.itemName, p.productName)
        }));

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => this.createReference(s.product, input, s.score * 0.5));
    }

    /**
     * Create MRP Reference with pack size normalization
     */
    private static createReference(
        product: ScrapedProduct,
        input: MRPVerificationInput,
        matchScore: number
    ): MRPReference {
        const sourceMRP = product.mrp;
        const sourcePack = extractPackSize(product.packSize);
        const localPack = input.packSize ? extractPackSize(input.packSize) : 1;

        const normalizedMRP = (sourceMRP / sourcePack) * localPack;

        const weight = this.WEIGHTS[product.source.toLowerCase()] || 0.2;

        return {
            source: product.source,
            matchedProduct: product.productName,
            mrp: sourceMRP,
            pack: product.packSize,
            normalizedMRP: +normalizedMRP.toFixed(2),
            weightUsed: weight,
            matchScore: +matchScore.toFixed(2)
        };
    }

    /**
     * Process prices and calculate final MRP
     */
    private static processPricesAndCalculate(
        input: MRPVerificationInput,
        matchResult: { stage: string; references: MRPReference[] }
    ): MRPVerificationResult {
        const normalizedPrices = matchResult.references.map(r => r.normalizedMRP);

        if (normalizedPrices.length === 0) {
            return this.createFallbackResult(input, 'No valid price data');
        }

        const median = this.calculateMedian(normalizedPrices);
        const filtered = normalizedPrices.filter(price => {
            const deviation = Math.abs((price - median) / median) * 100;
            return deviation <= this.MAX_DEVIATION_PERCENT;
        });

        if (filtered.length === 0) {
            return this.createFallbackResult(input, 'All prices were outliers');
        }

        const finalMedian = this.calculateMedian(filtered);
        const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
        const systemFinalMRP = (finalMedian + mean) / 2;

        const maxAllowedPrice = systemFinalMRP * (1 + this.MAX_SELL_MARGIN);

        const finalScore = matchResult.references.reduce((sum, ref) => {
            return sum + (ref.matchScore * ref.weightUsed);
        }, 0);

        const priceDiff = input.userEnteredPrice - systemFinalMRP;
        const diffPercent = (priceDiff / systemFinalMRP) * 100;

        let status: 'approved' | 'warning' | 'rejected';
        let reason: string;
        let needsAdminReview = false;

        if (input.userEnteredPrice <= systemFinalMRP * (1 + this.TOLERANCE_PERCENT / 100)) {
            status = 'approved';
            reason = 'Price is within acceptable market range';
        } else if (input.userEnteredPrice <= maxAllowedPrice) {
            status = 'warning';
            reason = `Price is ${diffPercent.toFixed(1)}% higher than market average`;
            needsAdminReview = true;
        } else {
            status = 'rejected';
            reason = `Price is ${diffPercent.toFixed(1)}% higher than market average (exceeds 5% margin)`;
            needsAdminReview = true;
        }

        return {
            status,
            systemFinalMRP: +systemFinalMRP.toFixed(2),
            userEnteredPrice: input.userEnteredPrice,
            maxAllowedPrice: +maxAllowedPrice.toFixed(2),
            realtimeReferences: matchResult.references,
            finalScore: +finalScore.toFixed(2),
            reason,
            difference: diffPercent >= 0
                ? `You are selling ${diffPercent.toFixed(1)}% higher than market average`
                : `You are selling ${Math.abs(diffPercent).toFixed(1)}% lower than market average`,
            stageUsed: matchResult.stage,
            needsAdminReview
        };
    }

    /**
     * Create fallback result when verification fails
     */
    private static createFallbackResult(
        input: MRPVerificationInput,
        reason: string
    ): MRPVerificationResult {
        return {
            status: 'warning',
            systemFinalMRP: 0,
            userEnteredPrice: input.userEnteredPrice,
            maxAllowedPrice: 0,
            realtimeReferences: [],
            finalScore: 0,
            reason,
            difference: 'Unable to verify against market data',
            stageUsed: 'Verification Failed',
            needsAdminReview: true
        };
    }

    /**
     * Calculate median
     */
    private static calculateMedian(values: number[]): number {
        if (values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 === 0
            ? ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2
            : (sorted[mid] || 0);
    }
}
