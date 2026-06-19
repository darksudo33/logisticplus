import React from "react";
import { useAppStore } from "@/src/store/useAppStore";

type AuthMePayload = {
  ok?: boolean;
  data?: {
    permissions?: string[];
  };
};

let cachedUserId: string | null = null;
let cachedPermissions: string[] = [];
let cachedStatus: number | null = null;
let cachedError: string | null = null;
let inFlightUserId: string | null = null;
let inFlightRequest: Promise<{ permissions: string[]; status: number; error: string | null }> | null = null;

function readPermissions(userId: string) {
  if (cachedUserId === userId) {
    return Promise.resolve({
      permissions: cachedPermissions,
      status: cachedStatus || 200,
      error: cachedError,
    });
  }

  if (inFlightRequest && inFlightUserId === userId) {
    return inFlightRequest;
  }

  inFlightUserId = userId;
  inFlightRequest = fetch("/api/auth/me", { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as AuthMePayload | null;
      if (!response.ok || payload?.ok === false) {
        const error = new Error("AUTH_ME_FAILED") as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const result = {
        permissions: payload?.data?.permissions || [],
        status: response.status,
        error: null,
      };
      cachedUserId = userId;
      cachedPermissions = result.permissions;
      cachedStatus = result.status;
      cachedError = null;
      return result;
    })
    .catch((caught) => {
      const result = {
        permissions: [] as string[],
        status: Number((caught as { status?: number })?.status || cachedStatus || 500),
        error: caught instanceof Error ? caught.message : "AUTH_ME_FAILED",
      };
      cachedUserId = userId;
      cachedPermissions = result.permissions;
      cachedStatus = result.status;
      cachedError = result.error;
      return result;
    })
    .finally(() => {
      if (inFlightUserId === userId) {
        inFlightUserId = null;
        inFlightRequest = null;
      }
    });

  return inFlightRequest;
}

export function clearCurrentUserPermissionsCache() {
  cachedUserId = null;
  cachedPermissions = [];
  cachedStatus = null;
  cachedError = null;
  inFlightUserId = null;
  inFlightRequest = null;
}

export function useCurrentUserPermissions() {
  const currentUser = useAppStore((state) => state.currentUser);
  const [permissions, setPermissions] = React.useState<string[]>(
    currentUser?.id && cachedUserId === currentUser.id ? cachedPermissions : []
  );
  const [loading, setLoading] = React.useState(Boolean(currentUser));
  const [error, setError] = React.useState<string | null>(
    currentUser?.id && cachedUserId === currentUser.id ? cachedError : null
  );
  const [status, setStatus] = React.useState<number | null>(
    currentUser?.id && cachedUserId === currentUser.id ? cachedStatus : null
  );

  React.useEffect(() => {
    let cancelled = false;

    if (!currentUser) {
      clearCurrentUserPermissionsCache();
      setPermissions([]);
      setLoading(false);
      setError(null);
      setStatus(null);
      return () => {
        cancelled = true;
      };
    }

    if (cachedUserId === currentUser.id) {
      setPermissions(cachedPermissions);
      setStatus(cachedStatus);
      setError(cachedError);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    readPermissions(currentUser.id)
      .then((result) => {
        if (cancelled) return;
        setPermissions(result.permissions);
        setStatus(result.status);
        setError(result.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  return {
    permissions,
    loading,
    error,
    status,
    isPlatformAdmin: permissions.includes("platform.admin"),
  };
}
