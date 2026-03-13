import { useEffect, useState } from "react";
import { fetchAnalyticsPayload, type AnalyticsPayload } from "../api/analyticsApi";

const EMPTY_ANALYTICS: AnalyticsPayload = {
  walletNodes: [],
  transactions: [],
  alerts: [],
  volumeData: [],
  riskDistData: [],
  hourlyAlerts: [],
};

export function useAnalyticsData() {
  const [data, setData] = useState<AnalyticsPayload>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAnalyticsPayload();
        if (mounted) {
          setData(payload);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load analytics data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}