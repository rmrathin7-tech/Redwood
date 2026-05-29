/**
 * src/pages/fsa/utils/fsaFormatters.js
 * * SaaS-Grade Financial Formatting Utilities
 * Handles native Indian numbering formats (Lakhs/Crores), live string parsing, 
 * and dynamic schema-aware percentage vs integer evaluations.
 */

// ── 1. Pure Indian Integer Formatter (e.g., 1234567 → "12,34,567") ──
function formatIndianInteger(intStr) {
    const s = intStr.replace(/^0+/, '') || '0';
    if (s.length <= 3) return s;
    const lastThree = s.slice(-3);
    const rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
}

/**
 * Format a numeric value strictly using the Indian numbering system (en-IN).
 * @param {number|string} value 
 * @param {number} fractionDigits Default is 2 decimal places
 * @returns {string} Formatted output string
 */
export function formatIN(value, fractionDigits = 2) {
    const num = Number(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString('en-IN', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}

/**
 * Parses a comma-formatted string safely back into a clean floating-point number.
 * @param {string|number} str 
 * @returns {number} Clean numeric float ready for database ingestion
 */
export function parseFormattedNumber(str) {
    if (str === null || str === undefined) return 0;
    const raw = String(str).replace(/,/g, '').trim();
    return raw === '' ? 0 : parseFloat(raw) || 0;
}

/**
 * Applies real-time Indian comma insertion directly to an HTML input element
 * while preserving the user's cursor selection indices perfectly.
 * @param {HTMLInputElement} input DOM node target
 * @returns {number} The extracted pure float value for state synchronization
 */
export function applyLiveIndianFormat(input) {
    if (!input) return 0;
    const cursorPos = input.selectionStart || 0;
    const prevValue = input.value || '';

    // Track existing comma separators preceding the cursor index
    const commasBefore = (prevValue.slice(0, cursorPos).match(/,/g) || []).length;

    // Filter out unauthorized alphabetical strings, leaving numbers and a single decimal point
    let rawChars = prevValue.replace(/[^0-9.]/g, '');
    const dotIdx = rawChars.indexOf('.');
    if (dotIdx !== -1) {
        rawChars = rawChars.slice(0, dotIdx + 1) + rawChars.slice(dotIdx + 1).replace(/\./g, '');
    }

    // Assemble clean formatted strings
    const parts = rawChars.split('.');
    const intPart = parts[0] ? formatIndianInteger(parts[0]) : '';
    const formatted = parts.length > 1 ? intPart + '.' + (parts[1] || '') : intPart;

    input.value = formatted;

    // Recalculate precise cursor offsets
    const rawBeforeCursor = rawChars.slice(0, cursorPos - commasBefore);
    const intBeforeCursor = rawBeforeCursor.split('.')[0];
    const newCommasBefore = (formatIndianInteger(intBeforeCursor).match(/,/g) || []).length;
    const newCursor = Math.min(
        cursorPos - commasBefore + newCommasBefore,
        input.value.length
    );

    try { 
        input.setSelectionRange(newCursor, newCursor); 
    } catch (_) {}

    return parseFloat(rawChars) || 0;
}

/**
 * Evaluates configured schemas dynamically to render values appropriately 
 * as formatted Indian currency strings or rounded percentages.
 * @param {string} key Unique line item identifier key
 * @param {number} value Raw evaluation float
 * @param {object} configSchemas Master settings configuration schema
 * @returns {string} Final display-ready string representation
 */
/**
 * Evaluates configured schemas dynamically to render values appropriately 
 * as formatted Indian currency strings or rounded percentages.
 */
export function formatValue(key, value, configSchemas) {
    if (!isFinite(value) || value === null || value === undefined) return "0";

    let isPercentage = false;

    // Evaluate dynamic schemas to check IF percentage formatting applies
    if (configSchemas) {
        const metricDef = configSchemas.metricsFormulas?.find(m => m.key === key);
        if (metricDef?.isPercentage) isPercentage = true;

        const ratioKey = key.startsWith('cr__') ? key.replace('cr__', '') : key;
        const ratioDef = configSchemas.customRatios?.find(r => r.key === ratioKey);
        if (ratioDef?.isPercentage) isPercentage = true;
    } 
    // Fallback baseline ratio parameters
    else if (key.toLowerCase().includes('margin') || key.toLowerCase() === 'roe' || key.toLowerCase() === 'roa') {
        isPercentage = true;
    }

    // PHASE 2 FIX: Correctly multiply the decimal by 100 for percentages
    if (isPercentage) {
        return (Number(value) * 100).toFixed(1) + "%";
    }

    return formatIN(value);
}
/**
 * Formats a standard 4-digit calendar year into your application's expected 
 * Financial Year string format (e.g., 2026 -> "FY25-26").
 * @param {number|string} year Standard calendar year
 * @returns {string} Formatted financial year string
 */
export function formatFinancialYear(year) {
    const numericYear = parseInt(year, 10) || new Date().getFullYear();
    const startYear = numericYear - 1;
    const shortEndYear = numericYear.toString().slice(-2);
    
    return `FY${startYear}-${shortEndYear}`;
}