const API_URL = import.meta.env.VITE_API_URL || "";
let authToken = "";

export function setAuthToken(token: string) { authToken = token; }
export function getAuthToken() { return authToken; }

export async function api<T>(path: string, body?: unknown, method = body !== undefined ? "POST" : "GET"): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP_${response.status}`);
  return data as T;
}
