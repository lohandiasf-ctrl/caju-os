import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './client';

type Result<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  refresh: () => void;
};

/** Busca simples com recarga e pull-to-refresh — o padrão de todas as telas. */
export function useApi<T>(path: string | null, deps: unknown[] = []): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    if (tick === 0) setLoading(true);
    apiFetch<T>(path)
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => {
    setLoading(true);
    setTick((value) => value + 1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTick((value) => value + 1);
  }, []);

  return { data, error, loading, refreshing, reload, refresh };
}
