/**
 * src/pages/fsa/components/PDFExtractionHook.jsx
 * ASYNC JOB QUEUE ENGINE (Local -> Cloud Run Ready)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { formatFinancialYear } from '../utils/fsaFormatters.js';
import { db } from '../../../firebase.js'; // Adjust this path if your firebase.js is located elsewhere
import { doc, onSnapshot } from 'firebase/firestore';

export function usePDFExtraction(onInjectExtractedPayload, configSchemas) {
  const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);

  // We need a ref to hold the active Firestore listener so we can cleanly shut it down
  const activeListenerRef = useRef(null);

  // Pointing to our new Local FastAPI Server!
  const targetEndpoint = 'http://127.0.0.1:8000/api/v1/extract';

  const buildExtractionSchema = (coaNodes = []) => {
    const schema = {};
    coaNodes.forEach(node => {
      if (node.type === 'section') {
        schema[node.key] = [];
        if (Array.isArray(node.items)) {
          schema[node.key] = node.items.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object') return item.label || item.dataKey || item.key || '';
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
    // Tell the UI we are starting
    setExtractionResult({ status: 'PROCESSING', message: 'Uploading document to secure engine...' });

    try {
      const formData = new FormData();
      formData.append('file', selectedPdfFile);

      if (configSchemas?.chartOfAccounts?.shared?.pnl) {
        formData.append('pnl_schema', JSON.stringify(buildExtractionSchema(configSchemas.chartOfAccounts.shared.pnl)));
      }
      if (configSchemas?.chartOfAccounts?.shared?.bs) {
        formData.append('bs_schema', JSON.stringify(buildExtractionSchema(configSchemas.chartOfAccounts.shared.bs)));
      }
      if (configSchemas?.chartOfAccounts?.shared?.cashflow) {
        formData.append('cf_schema', JSON.stringify(buildExtractionSchema(configSchemas.chartOfAccounts.shared.cashflow)));
      }

      // 1. Drop the file off at the backend
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server responded with ${response.status}`);

      const result = await response.json();
      const jobId = result.job_id;

      if (!jobId) throw new Error('No Job ID returned from server.');

      // 2. Clear any old listeners
      if (activeListenerRef.current) activeListenerRef.current(); 

      // 3. Start listening to Firebase for real-time progress updates!
      const jobRef = doc(db, 'fsa_jobs', jobId);
      activeListenerRef.current = onSnapshot(jobRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          
          if (data.status === 'processing') {
            // Update the UI with the live message from Python
            setExtractionResult({
              status: 'PROCESSING',
              message: data.message || 'Extracting data...',
            });
          } else if (data.status === 'completed') {
            // Success! The UI can now render the "Apply Data" button
            setExtractionResult({
              status: 'SUCCESS',  
              confidence: 0.95, // Replaced with actual confidence score later
              parsedNodes: Object.keys(data.payload || {}).length,
              message: data.message || 'Extraction complete.',
              payload: data.payload,
            });
            setIsExtracting(false);
            if (activeListenerRef.current) activeListenerRef.current(); // Kill listener
          } else if (data.status === 'error') {
            // Safe Error Catch: No crashed databases!
            setExtractionResult({
              status: 'ERROR',
              message: data.message || 'Extraction failed.',
            });
            setIsExtracting(false);
            if (activeListenerRef.current) activeListenerRef.current(); // Kill listener
          }
        }
      }, (err) => {
        console.error('Firestore listener error:', err);
        setExtractionResult({ status: 'ERROR', message: 'Lost connection to extraction tracker.' });
        setIsExtracting(false);
      });

    } catch (error) {
      console.error('Extraction init failed:', error);
      setExtractionResult({
        status: 'ERROR',
        message: error.message || 'Failed to communicate with the extraction server.',
      });
      setIsExtracting(false);
    }
  }, [selectedPdfFile, configSchemas]);

const applyExtractedPayload = useCallback((targetYearStr) => {
    if (!extractionResult?.payload || !onInjectExtractedPayload) return 0;

    const safeYear = targetYearStr || formatFinancialYear(new Date().getFullYear());
    let injectedCount = 0;

    Object.entries(extractionResult.payload).forEach(([docKey, extractionData]) => {
      const frontendDocMap = { profit_and_loss: 'pnl', balance_sheet: 'bs', cash_flow: 'cashflow' };
      const activeDocKey = frontendDocMap[docKey] || 'pnl';

      if (extractionData && extractionData.data) {
        let dataToProcess = extractionData.data;

        // CHECK FOR YEAR LAYER: Does the AI output have "2025" or "2024" as top-level keys?
        const firstKey = Object.keys(dataToProcess)[0];
        if (firstKey && !isNaN(parseInt(firstKey)) && firstKey.length === 4) {
          // It is grouped by year! Find the requested year, otherwise default to the most recent one
          const yearMatch = Object.keys(dataToProcess).find(k => k.includes(safeYear) || safeYear.includes(k));
          dataToProcess = yearMatch ? dataToProcess[yearMatch] : dataToProcess[firstKey];
        }

        // Now loop through the clean, flattened sections (e.g., 'revenue', 'directcosts')
        Object.entries(dataToProcess).forEach(([sectionKey, items]) => {
          if (typeof items === 'object' && items !== null) {
            Object.entries(items).forEach(([itemKey, numericVal]) => {
              if (typeof numericVal === 'number' || !isNaN(parseFloat(numericVal))) {
                onInjectExtractedPayload(activeDocKey, sectionKey, itemKey, parseFloat(numericVal), safeYear);
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
  
  const togglePdfDrawer = useCallback(() => setPdfDrawerOpen(prev => !prev), []);

  const resetExtractionState = useCallback(() => {
    setSelectedPdfFile(null);
    setExtractionResult(null);
    setIsExtracting(false);
    if (activeListenerRef.current) {
      activeListenerRef.current();
      activeListenerRef.current = null;
    }
  }, []);

  // Cleanup listener on component unmount
  useEffect(() => {
    return () => {
      if (activeListenerRef.current) activeListenerRef.current();
    };
  }, []);

  return {
    pdfDrawerOpen, selectedPdfFile, isExtracting, extractionResult, targetEndpoint,
    setSelectedPdfFile, executePdfExtraction, applyExtractedPayload, togglePdfDrawer, resetExtractionState,
  };
}
