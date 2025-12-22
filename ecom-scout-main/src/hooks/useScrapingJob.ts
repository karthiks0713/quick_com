import { useState, useCallback, useRef, useEffect } from 'react';
import { ScrapingJob, StoreName, Product } from '@/types/product';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

interface UseScrapingJobReturn {
  startScraping: (product: string, location: string) => Promise<void>;
  job: ScrapingJob | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useScrapingJob(): UseScrapingJobReturn {
  const [job, setJob] = useState<ScrapingJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setIsLoading(false);
    setError(null);
  }, [stopPolling]);

  const checkJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/job/${jobId}`);
      const data = await response.json();
      
      if (data.status === 'completed') {
        stopPolling();
        // Fetch the results
        const resultsResponse = await fetch(`${API_BASE}/json/${jobId}`);
        if (!resultsResponse.ok) {
          throw new Error(`Failed to fetch results: ${resultsResponse.statusText}`);
        }
        const results = await resultsResponse.json();
        
        console.log('📦 Fetched results from API:', results);
        
        // Transform results into our format
        const transformedResults: Record<StoreName, Product[]> = {
          dmart: results.dmart || [],
          jiomart: results.jiomart || [],
          naturesbasket: results.naturesbasket || [],
          zepto: results.zepto || [],
          swiggy: results.swiggy || [],
        };
        
        console.log('✅ Transformed results:', transformedResults);
        console.log('📊 Product counts:', {
          dmart: transformedResults.dmart.length,
          jiomart: transformedResults.jiomart.length,
          naturesbasket: transformedResults.naturesbasket.length,
          zepto: transformedResults.zepto.length,
          swiggy: transformedResults.swiggy.length,
        });
        
        setJob({
          jobId,
          status: 'completed',
          results: transformedResults,
        });
        setIsLoading(false);
      } else if (data.status === 'failed') {
        stopPolling();
        setJob({
          jobId,
          status: 'failed',
          error: data.error || 'Scraping failed',
        });
        setError(data.error || 'Scraping failed');
        setIsLoading(false);
      } else {
        setJob(prev => ({
          ...(prev || { jobId }),
          jobId,
          status: data.status,
        }));
      }
    } catch (err) {
      console.error('Error checking job status:', err);
    }
  }, [stopPolling]);

  const startScraping = useCallback(async (product: string, location: string) => {
    reset();
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ product, location });
      const response = await fetch(`${API_BASE}/scrape?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to start scraping job');
      }
      
      const data = await response.json();
      const jobId = data.jobId;
      
      setJob({
        jobId,
        status: 'queued',
      });
      
      // Start polling for status
      pollingRef.current = setInterval(() => {
        checkJobStatus(jobId);
      }, 2000);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start scraping';
      setError(message);
      setIsLoading(false);
    }
  }, [reset, checkJobStatus]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    startScraping,
    job,
    isLoading,
    error,
    reset,
  };
}

