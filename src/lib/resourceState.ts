import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

export type ResourceState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<T | null>;
  setData: Dispatch<SetStateAction<T>>;
};

export function useApiResource<T>(loader: () => Promise<T>, fallback: T): ResourceState<T> {
  const [data, setData] = useState<T>(fallback);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await loader();
      setData(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load data.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    loader()
      .then((next) => {
        if (isMounted) setData(next);
      })
      .catch((caught) => {
        if (isMounted) setError(caught instanceof Error ? caught.message : "Could not load data.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [loader]);

  return { data, error, isLoading, refresh, setData };
}
