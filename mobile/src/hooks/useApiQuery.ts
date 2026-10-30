import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toApiError, type ApiError } from '@/api/errors';

interface QueryState<T> {
  data: T | null;
  /** True once a request has succeeded. Needed because `null` is itself a valid result (e.g. "no assessment yet"). */
  loaded: boolean;
  error: ApiError | null;
  refreshing: boolean;
}

/**
 * Loads data when a screen gains focus (so lists/dashboards are fresh after returning from a form).
 *  - First load: `loading` is true until a result (which may legitimately be `null`) or an error arrives.
 *  - Later focus refetches are silent: existing data stays on screen and is replaced when the new data arrives.
 *  - A failed silent refetch never replaces good data with an error.
 *  - Out-of-order responses are discarded.
 *  - Pass a changing `key` to refetch when the fetcher's inputs change.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, key: string | number = 0) {
  const [state, setState] = useState<QueryState<T>>({ data: null, loaded: false, error: null, refreshing: false });
  const fetcherRef = useRef(fetcher);
  const latestRequest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++latestRequest.current;
    try {
      const data = await fetcherRef.current();
      if (mounted.current && id === latestRequest.current) setState({ data, loaded: true, error: null, refreshing: false });
    } catch (e) {
      if (mounted.current && id === latestRequest.current) {
        setState((s) => ({ ...s, error: s.loaded ? null : toApiError(e), refreshing: false }));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run();
      // `key` lets callers re-run the query when their inputs change (e.g. a different date range).
    }, [run, key]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** User-initiated reload (pull to refresh / "Try again"). */
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, error: null, refreshing: true }));
    await run();
  }, [run]);

  return { data: state.data, error: state.error, refreshing: state.refreshing, loading: !state.loaded && state.error === null, reload };
}
