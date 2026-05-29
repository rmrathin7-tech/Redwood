/**
 * src/pages/fsa/core/fsaEngine.js
 * * CORE ANALYTICAL ENGINE (DYNAMIC CROSS-DOCUMENT UPGRADE)
 * Transforms raw document data into a fully calculated financial model based on 
 * dynamic enterprise schemas, supporting cross-document formulas (e.g., CF pulling from P&L).
 * Phase 4 Update: Added Custom KPI Formula Engine Evaluation.
 */

/* =========================
   1. STRING FORMULA EVALUATOR (For Custom Ratios & Metrics)
========================= */
export function evaluateFormula(formula, valueMap) {
    try {
        if (!formula || typeof formula !== 'string') return 0;

        // Normalize typographical dashes to standard minus signs
        let safeFormula = formula.replace(/[−–—]/g, '-');
        
        // Sort keys by length descending to prevent substring matching errors 
        const sortedKeys = Object.keys(valueMap).sort((a, b) => b.length - a.length);

        sortedKeys.forEach(key => {
            const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // Safely replace exact variable matches with their numerical values
            const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
            const val = valueMap[key] || 0;
            safeFormula = safeFormula.replace(regex, `(${val})`);
        });

        // Purge remaining unmatched text to prevent execution crashes
        safeFormula = safeFormula.replace(/[a-zA-Z_]\w*/g, '0');

        const result = new Function(`return ${safeFormula}`)();
        return isFinite(result) ? result : 0;
    } catch (e) {
        return 0;
    }
}

/* =========================
   2. RECLASSIFICATION ROUTER
========================= */
export function applyReclassifications(projectData, reclassMap) {
    if (!reclassMap || Object.keys(reclassMap).length === 0) return projectData;
    const mappedData = JSON.parse(JSON.stringify(projectData));

    Object.entries(reclassMap).forEach(([docKey, fromSections]) => {
        Object.entries(fromSections).forEach(([fromSec, items]) => {
            Object.entries(items).forEach(([itemKey, toSec]) => {
                if (toSec) {
                    // Route values across all fiscal years
                    Object.keys(mappedData[docKey]?.[fromSec] || {}).forEach(year => {
                        const val = mappedData[docKey][fromSec][year][itemKey];
                        if (val !== undefined) {
                            if (!mappedData[docKey][toSec]) mappedData[docKey][toSec] = {};
                            if (!mappedData[docKey][toSec][year]) mappedData[docKey][toSec][year] = {};
                            mappedData[docKey][toSec][year][itemKey] = val;
                            delete mappedData[docKey][fromSec][year][itemKey];
                        }
                    });
                }
            });
        });
    });
    return mappedData;
}

/* =========================
   3. MASTER MODEL BUILDER
========================= */
export function buildFinancialModel(rawProjectData, targetYear, reclassMap = {}, configSchemas = {}, activeEntityType = 'pvtLtd') {
    const model = {};
    if (!rawProjectData) return { [targetYear]: {} };

    // Apply any structural overrides defined by the user
    const projectData = applyReclassifications(rawProjectData, reclassMap);
    const sharedCoA = configSchemas?.chartOfAccounts?.shared || {};

    // ── PASS 1: AGGREGATE BASE SECTIONS ACROSS ALL DOCUMENTS ──
    Object.keys(sharedCoA).forEach(docKey => {
        const docSchema = sharedCoA[docKey] || [];
        docSchema.forEach(node => {
            if (node.type === 'section') {
                let sectionSum = 0;
                const yearData = projectData?.[docKey]?.[node.key]?.[targetYear] || {};
                
                // Bulletproof Sub-Item Aggregation to prevent double-counting parent lines
                const keys = Object.keys(yearData);
                const parentKeysWithChildren = new Set();
                keys.forEach(k => {
                    if (k.includes('||')) parentKeysWithChildren.add(k.split('||')[0]);
                });

                Object.entries(yearData).forEach(([itemKey, val]) => {
                    if (parentKeysWithChildren.has(itemKey)) return; 
                    sectionSum += (parseFloat(val) || 0);
                });
                model[node.key] = sectionSum;
            }
            
            // Dynamic Equity Evaluator
            if (node.dynamic && node.key === 'equity_placeholder') {
                let eqSum = 0;
                const yearData = projectData?.[docKey]?.['equity']?.[targetYear] || {};
                
                const keys = Object.keys(yearData);
                const parentKeysWithChildren = new Set();
                keys.forEach(k => {
                    if (k.includes('||')) parentKeysWithChildren.add(k.split('||')[0]);
                });

                Object.entries(yearData).forEach(([itemKey, val]) => {
                    if (parentKeysWithChildren.has(itemKey)) return;
                    eqSum += (parseFloat(val) || 0);
                });
                model['equity'] = eqSum;
            }
        });
    });

    // ── PASS 2: EVALUATE TOTALS & CROSS-DOCUMENT FORMULAS ──
    for (let pass = 0; pass < 2; pass++) {
        Object.keys(sharedCoA).forEach(docKey => {
            const docSchema = sharedCoA[docKey] || [];
            docSchema.forEach(node => {
                if (node.type === 'total' && node.formula) {
                    if (Array.isArray(node.formula)) {
                        let totalVal = 0;
                        node.formula.forEach(part => {
                            if (typeof part === 'string') {
                                totalVal += (model[part] || 0);
                            } else if (typeof part === 'object') {
                                totalVal += ((model[part.section] || 0) * (part.sign || 1));
                            }
                        });
                        model[node.key] = totalVal;
                    } 
                    else if (typeof node.formula === 'string') {
                        model[node.key] = evaluateFormula(node.formula, model);
                    }
                }
            });
        });
    }

    // ── 3. SAFETY FALLBACKS ──
    if (model.grossProfit === undefined) model.grossProfit = (model.revenue || 0) - (model.directCosts || 0);
    if (model.ebitda === undefined) model.ebitda = (model.grossProfit || 0) - (model.empbenefitexp || 0) - (model.otherindirectexpenses || 0);
    if (model.ebt === undefined) model.ebt = (model.ebitda || 0) - (model.financeCosts || 0) - (model.depreciationandammortization || 0);
    if (model.eat === undefined) model.eat = (model.ebt || 0) - (model.tax || 0);
    if (model.totalAssets === undefined) model.totalAssets = (model.nonCurrentAssets || 0) + (model.currentAssets || 0);
    if (model.totalLE === undefined) model.totalLE = (model.nonCurrentLiabilities || 0) + (model.currentliablities || 0) + (model.equity || 0);

    // ── 4. DASHBOARD METRICS EVALUATION ──
    if (Array.isArray(configSchemas.metricsFormulas)) {
        configSchemas.metricsFormulas.forEach(metric => {
            model[metric.key] = evaluateFormula(metric.formula, model);
        });
    }

    // ── 5. DYNAMIC CUSTOM RATIOS EVALUATION ──
    if (Array.isArray(configSchemas.customRatios)) {
        configSchemas.customRatios.forEach(ratio => {
            const getSum = arr => (arr || []).reduce((s, k) => s + (model[k] || 0), 0);
            const num = getSum(ratio.numerator);
            const den = getSum(ratio.denominator);
            model[`cr__${ratio.key}`] = den !== 0 ? (num / den) : 0;
        });
    }

    // ── 6. DYNAMIC CUSTOM KPIs EVALUATION (PHASE 4) ──
    if (Array.isArray(configSchemas.customKPIs)) {
        configSchemas.customKPIs.forEach(kpi => {
            model[kpi.key] = evaluateFormula(kpi.formula, model);
        });
    }

    return { [targetYear]: model };
}