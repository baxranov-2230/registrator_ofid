// Direct HEMIS authentication from the browser.
// Requests go through Vite dev proxy: /hemis/*  →  https://student.ndki.uz/rest/v1/*
// In production, the reverse-proxy (nginx) must forward /hemis/* to HEMIS too,
// or the frontend must be served from an origin allowed by HEMIS's CORS policy.

const HEMIS_LOGIN_URL = "/hemis/auth/login";

export interface HemisLoginResponse {
  success: boolean;
  error?: string;
  data?: { token?: string };
  code?: number;
}

export async function hemisLogin(
  login: string,
  password: string,
): Promise<{ token: string }> {
  const res = await fetch(HEMIS_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login, password }),
  });

  let body: HemisLoginResponse | null = null;
  try {
    body = (await res.json()) as HemisLoginResponse;
  } catch {
    throw new Error(`HEMIS noto'g'ri javob: HTTP ${res.status}`);
  }

  if (!res.ok || body.success === false) {
    throw new Error(body.error || `HEMIS xatoligi: HTTP ${res.status}`);
  }

  const token = body.data?.token;
  if (!token) throw new Error("HEMIS token qaytarmadi");
  return { token };
}
