/**
 * src/pages/fsa/components/PDFExtractionHook.jsx
 * MODULAR STANDALONE PDF PARSING & API INGESTION CONTROLLER
 * Fully upgraded to connect to the Hugging Face Async Enterprise Engine.
 */

import { useState, useCallback } from 'react';
import { formatFinancialYear } from '../utils/fsaFormatters.js';

export function usePDFExtraction(onInjectExtractedPayload, configSchemas) {
  const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);

  const targetEndpoint = 'https://rathin-07-financialstatementextractorv2.hf.space/analyze-pipeline';
const buildExtractionSchema = (coaNodes = []) => {
  const schema = {};

  coaNodes.forEach(node => {
    if (node.type === 'section') {
      schema[node.key] = [];

      if (Array.isArray(node.items)) {
        schema[node.key] = node.items.map(item => {
          if (typeof item === 'string') return item;

          if (typeof item === 'object') {
            return (
              item.label ||
              item.dataKey ||
              item.key ||
              ''
            );
          }

          return '';
        }).filter(Boolean);
      }
    }
  });

  return schema;
};
const executePdfExtraction = useCallback(async () => {
  if (!selectedPdfFile) {
    alert('Please select a PDF file first.');
    return;
  }

    setIsExtracting(true);
    setExtractionResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedPdfFile);
if (configSchemas?.chartOfAccounts?.shared?.pnl) {
  formData.append(
    'pnl_schema',
    JSON.stringify(
      buildExtractionSchema(
        configSchemas.chartOfAccounts.shared.pnl
      )
    )
  );
}

if (configSchemas?.chartOfAccounts?.shared?.bs) {
  formData.append(
    'bs_schema',
    JSON.stringify(
      buildExtractionSchema(
        configSchemas.chartOfAccounts.shared.bs
      )
    )
  );
}

if (configSchemas?.chartOfAccounts?.shared?.cashflow) {
  formData.append(
    'cf_schema',
    JSON.stringify(
      buildExtractionSchema(
        configSchemas.chartOfAccounts.shared.cashflow
      )
    )
  );
}

      const response = await fetch(targetEndpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const result = await response.json();
console.log(
  'EXTRACTION RESULT',
  JSON.stringify(result, null, 2)
);
      if (result.status === 'error') {
        throw new Error(result.message || 'Extraction server returned an error.');
      }

      const extractedPayload = result.extracted_data || {};

      setExtractionResult({
        status: 'SUCCESS',  
        confidence: result.document_info?.confidence || 0.9,
        parsedNodes: Object.keys(extractedPayload).length,
        message: `Successfully extracted ${result.page_summary?.relevant_pages || 0} financial pages.`,
        payload: extractedPayload,
      });

      return extractedPayload;
    } catch (error) {
      console.error('Extraction failed:', error);

      const errorState = {
        status: 'ERROR',
        message: error.message || 'Failed to communicate with the extraction server.',
      };

      setExtractionResult(errorState);
      throw error;
    } finally {
      setIsExtracting(false);
    }
  }, [selectedPdfFile, configSchemas]);

  const applyExtractedPayload = useCallback((targetYearStr) => {
    if (!extractionResult?.payload || !onInjectExtractedPayload) return 0;

    const safeYear = targetYearStr || formatFinancialYear(new Date().getFullYear());
    let injectedCount = 0;

    Object.entries(extractionResult.payload).forEach(([docKey, extractionData]) => {
      const frontendDocMap = {
        profit_and_loss: 'pnl',
        balance_sheet: 'bs',
        cash_flow: 'cashflow',
      };

      const activeDocKey = frontendDocMap[docKey] || 'pnl';

      if (extractionData && extractionData.data) {
        Object.entries(extractionData.data).forEach(([sectionKey, items]) => {
          if (typeof items === 'object' && items !== null) {
            Object.entries(items).forEach(([itemKey, numericVal]) => {
              if (typeof numericVal === 'number' || !isNaN(parseFloat(numericVal))) {
                onInjectExtractedPayload(
                  activeDocKey,
                  sectionKey,
                  itemKey,
                  parseFloat(numericVal),
                  safeYear
                );
                injectedCount += 1;
              }
            });
          }
        });
      }
    });

    setPdfDrawerOpen(false);
    setExtractionResult(null);
    setSelectedPdfFile(null);

    return injectedCount;
  }, [extractionResult, onInjectExtractedPayload]);

  const togglePdfDrawer = useCallback(() => {
    setPdfDrawerOpen(prev => !prev);
  }, []);

  const resetExtractionState = useCallback(() => {
    setSelectedPdfFile(null);
    setExtractionResult(null);
    setIsExtracting(false);
  }, []);

  return {
    pdfDrawerOpen,
    selectedPdfFile,
    isExtracting,
    extractionResult,
    targetEndpoint,
    setSelectedPdfFile,
    executePdfExtraction,
    applyExtractedPayload,
    togglePdfDrawer,
    resetExtractionState,
  };
}