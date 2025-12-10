/**
 * String Similarity Utilities for MRP Verification
 * Implements Levenshtein Distance and normalized similarity scoring
 */

/**
 * Calculate Levenshtein Distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const matrix: number[][] = Array(s2.length + 1).fill(0).map(() => Array(s1.length + 1).fill(0));

    for (let i = 0; i <= s2.length; i++) {
        matrix[i]![0] = i;
    }

    for (let j = 0; j <= s1.length; j++) {
        matrix[0]![j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
        for (let j = 1; j <= s1.length; j++) {
            if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                matrix[i]![j] = matrix[i - 1]![j - 1]!;
            } else {
                matrix[i]![j] = Math.min(
                    matrix[i - 1]![j - 1]! + 1, // substitution
                    matrix[i]![j - 1]! + 1,     // insertion
                    matrix[i - 1]![j]! + 1      // deletion
                );
            }
        }
    }

    return matrix[s2.length]![s1.length]!;
}

/**
 * Calculate normalized similarity (0-1 scale)
 */
export function stringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const distance = levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) return 1;

    return 1 - (distance / maxLength);
}

/**
 * Normalize product name for comparison
 */
export function normalizeProductName(name: string): string {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

/**
 * Extract pack size from string (e.g., "15 tablets" -> 15)
 */
export function extractPackSize(packStr: string): number {
    if (!packStr) return 1;
    const match = packStr.match(/(\d+)\s*(tablet|capsule|ml|mg|strip|piece)/i);
    return match ? parseInt(match[1]!, 10) : 1;
}

/**
 * Calculate composite similarity score
 * Formula: 0.5*nameSim + 0.3*formulaSim + 0.2*companySim
 */
export function calculateCompositeSimilarity(
    localName: string,
    localFormula: string,
    localCompany: string,
    remoteName: string,
    remoteFormula: string,
    remoteCompany: string
): number {
    const nameSim = stringSimilarity(
        normalizeProductName(localName),
        normalizeProductName(remoteName)
    );

    const formulaSim = localFormula && remoteFormula
        ? stringSimilarity(localFormula, remoteFormula)
        : 0;

    const companySim = localCompany && remoteCompany
        ? stringSimilarity(
            normalizeProductName(localCompany),
            normalizeProductName(remoteCompany)
        )
        : 0;

    return 0.5 * nameSim + 0.3 * formulaSim + 0.2 * companySim;
}
