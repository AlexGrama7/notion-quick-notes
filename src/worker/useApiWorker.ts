import { useEffect, useRef, useCallback } from 'react';

// Worker instance type
type WorkerInstance = Worker;

// Create a type-safe hook for working with the API worker
export function useApiWorker() {
  // Create a ref to hold the worker instance
  const workerRef = useRef<WorkerInstance | null>(null);
  
  // Store callbacks in a map
  const callbacksRef = useRef<Map<string, (data: any) => void>>(new Map());
  
  // Initialize the worker once when the hook is first used
  useEffect(() => {
    // Create the worker
    workerRef.current = new Worker(
      new URL('./api-worker.ts', import.meta.url), 
      { type: 'module' }
    );
    
    // Handle messages from the worker
    const handleMessage = (event: MessageEvent) => {
      const { type, ...data } = event.data;
      
      // Find and execute the registered callback for this message type
      const callback = callbacksRef.current.get(type);
      if (callback) {
        callback(data);
        // Remove one-time callbacks
        if (type.endsWith('Result')) {
          callbacksRef.current.delete(type);
        }
      }
    };
    
    // Add the message event listener
    workerRef.current.addEventListener('message', handleMessage);
    
    // Clean up on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.removeEventListener('message', handleMessage);
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);
  
  // Function to send messages to the worker
  const sendMessage = useCallback((type: string, payload?: any) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      // Register a callback for the response
      const resultType = `${type}Result`;
      callbacksRef.current.set(resultType, (data) => {
        if (data.success) {
          resolve(data);
        } else {
          reject(new Error(data.error || 'Unknown error'));
        }
      });
      
      // Send the message to the worker
      workerRef.current.postMessage({ type, payload });
    });
  }, []);
  
  // Return the sendMessage function
  return { sendMessage };
}

export default useApiWorker; 