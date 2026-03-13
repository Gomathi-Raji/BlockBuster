import type { Alert, Transaction, WalletNode } from "../data/mockData";
import type { MlAllFeaturesResponse } from "./walletAnalyzerApi";

export interface AnalyticsPayload {
  walletNodes: WalletNode[];
  transactions: Transaction[];
  alerts: Alert[];
  volumeData: { date: string; volume: number; suspicious: number }[];
  riskDistData: { range: string; count: number; label: string }[];
  hourlyAlerts: { hour: string; alerts: number }[];
  aiInsights?: Record<string, MlAllFeaturesResponse>;
  aiIntegration?: {
    enabled: boolean;
    scored_wallets: number;
    errors: Array<{ address: string; error: string }>;
  };
}

const DEFAULT_API_BASE_URL = "http://localhost:5000";

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return (configured ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export async function fetchAnalyticsPayload(): Promise<AnalyticsPayload> {
  const response = await fetch(`${getApiBaseUrl()}/api/analytics`);
  const payload = (await response.json().catch(() => null)) as AnalyticsPayload | { error?: string } | null;

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "Failed to load analytics data.";
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected analytics response format.");
  }

  return payload as AnalyticsPayload;
}

export async function fetchAnalyticsPayloadWithAi(): Promise<AnalyticsPayload> {
  const response = await fetch(`${getApiBaseUrl()}/api/analytics?include_ai=true&ai_limit=20`);
  const payload = (await response.json().catch(() => null)) as AnalyticsPayload | { error?: string } | null;

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "Failed to load AI-enriched analytics data.";
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected AI analytics response format.");
  }

  return payload as AnalyticsPayload;
}