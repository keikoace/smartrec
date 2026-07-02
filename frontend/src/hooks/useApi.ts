import { useAuthenticatedFetch } from '@shopify/app-bridge-react';
import { useCallback } from 'react';

/**
 * Thin wrapper around App Bridge's authenticated fetch.
 * Automatically attaches the Shopify session token to every request.
 */
export function useApi() {
  const fetch = useAuthenticatedFetch();

  const get = useCallback(async (path: string) => {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, [fetch]);

  const patch = useCallback(async (path: string, body: object) => {
    const res = await fetch(`/api${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, [fetch]);

  const post = useCallback(async (path: string, body: object = {}) => {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, [fetch]);

  return { get, patch, post };
}
