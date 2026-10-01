function apiUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
}

export type SessionUser = {
  id: string;
  clinicId: string;
  displayName: string;
  roles: string[];
};

export type ClinicProfile = {
  id: string;
  name: string;
  legalName: string | null;
  timezone: string;
  currencyCode: string;
  defaultTaxRate: string;
  phone: string | null;
  email: string | null;
  status: string;
  version: number;
};

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  branchId: string | null;
  roles: string[];
  version: number;
};

export type ApiError = {
  code: string;
  message: string;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrf(): Promise<void> {
  await fetch(`${apiUrl()}/api/v1/auth/csrf`, { credentials: "include" });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
  }
  const headers = new Headers(init.headers);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = readCookie("XSRF-TOKEN");
  if (csrf && method !== "GET" && method !== "HEAD") {
    headers.set("X-XSRF-TOKEN", csrf);
  }
  const response = await fetch(`${apiUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(error?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  await ensureCsrf();
  return apiJson<SessionUser>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function currentUser(): Promise<SessionUser> {
  return apiJson<SessionUser>("/api/v1/auth/me");
}

export async function logout(): Promise<void> {
  await apiJson<void>("/api/v1/auth/logout", { method: "POST" });
}
