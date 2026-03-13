import { useState, useEffect } from "react";
import {
  Bell,
  AlertTriangle,
  Zap,
  Skull,
  RefreshCw,
  CheckCircle,
  Circle,
  Eye,
  Filter,
  ArrowUpRight,
  Clock,
  X,
  TrendingUp,
  ChevronDown,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Alert,
  getSeverityColor,
  formatAddress,
  timeAgo,
} from "../data/mockData";
import { useAnalyticsDataWithAi } from "../hooks/useAnalyticsData";

const TYPE_CONFIG: Record<
  Alert["type"],
  { icon: React.ElementType; label: string; color: string; bg: string }
> = {
  large_transaction: { icon: TrendingUp, label: "Large Transaction", color: "#ff7700", bg: "rgba(255,119,0,0.1)" },
  rapid_transactions: { icon: Zap, label: "Rapid Transactions", color: "#f5c518", bg: "rgba(245,197,24,0.1)" },
  darkweb_wallet: { icon: Skull, label: "Dark Web Wallet", color: "#ff2b4a", bg: "rgba(255,43,74,0.1)" },
  mixer: { icon: RefreshCw, label: "Mixer Activity", color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
  phishing: { icon: AlertTriangle, label: "Phishing Wallet", color: "#00aaff", bg: "rgba(0,170,255,0.1)" },
};

const SEVERITY_ORDER: Record<Alert["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function AlertMonitoringPage() {
  const { data, error } = useAnalyticsDataWithAi();
  const { alerts, hourlyAlerts } = data;
  const [filter, setFilter] = useState<"all" | Alert["severity"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Alert["type"]>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [localAlerts, setLocalAlerts] = useState<Alert[]>([]);
  const [liveStream, setLiveStream] = useState<Alert[]>([]);

  useEffect(() => {
    setLocalAlerts(alerts);
  }, [alerts]);

  // Simulate live alerts
  useEffect(() => {
    const liveAlertTemplates: Omit<Alert, "id" | "timestamp" | "read" | "resolved">[] = [
      {
        type: "large_transaction",
        severity: "high",
        walletAddress: "0xNEW1...AA",
        description: "Large ETH transfer of 45.2 ETH ($170K) detected",
        amount: 45.2,
        currency: "ETH",
      },
      {
        type: "rapid_transactions",
        severity: "medium",
        walletAddress: "0xNEW2...BB",
        description: "17 rapid transactions in 3 minutes from unknown wallet",
      },
      {
        type: "darkweb_wallet",
        severity: "critical",
        walletAddress: "0xNEW3...CC",
        description: "New interaction with OFAC-sanctioned wallet detected",
        amount: 12.8,
        currency: "BTC",
      },
      {
        type: "mixer",
        severity: "high",
        walletAddress: "0xNEW4...DD",
        description: "Funds routed through 5-hop mixer chain detected",
        amount: 88.5,
        currency: "ETH",
      },
    ];

    let counter = 100;
    const interval = setInterval(() => {
      const template = liveAlertTemplates[Math.floor(Math.random() * liveAlertTemplates.length)];
      const newAlert: Alert = {
        ...template,
        id: `live_${counter++}`,
        timestamp: new Date().toISOString(),
        read: false,
        resolved: false,
      };
      setLiveStream((prev) => [newAlert, ...prev.slice(0, 3)]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const markRead = (id: string) => {
    setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  const markResolved = (id: string) => {
    setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true, read: true } : a)));
    if (selected?.id === id) setSelected(null);
  };

  const filteredAlerts = localAlerts
    .filter((a) => {
      if (!showResolved && a.resolved) return false;
      if (filter !== "all" && a.severity !== filter) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });

  const unreadCount = localAlerts.filter((a) => !a.read).length;
  const criticalCount = localAlerts.filter((a) => a.severity === "critical" && !a.resolved).length;
  const aiInsights = data.aiInsights ?? {};
  const aiValues = Object.values(aiInsights);
  const aiPriorityAvg = aiValues.length
    ? aiValues.reduce((sum, item) => sum + (item.models.alert_prioritizer?.priority_score ?? 0), 0) / aiValues.length
    : 0;
  const aiAnomalyRate = aiValues.length
    ? (aiValues.filter((item) => item.models.transaction_anomaly_detector?.is_anomaly).length / aiValues.length) * 100
    : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "#0a1628",
          border: "1px solid #1a3050",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 11,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <div style={{ color: "#7a9cc0" }}>{label}:00</div>
        <div style={{ color: "#ff2b4a", fontWeight: 600 }}>{payload[0].value} alerts</div>
      </div>
    );
  };

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Space Grotesk', sans-serif", background: "#050912", minHeight: "100%" }}>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,43,74,0.35)",
            background: "rgba(255,43,74,0.08)",
            color: "#ff9090",
            fontSize: 12,
          }}
        >
          Unable to refresh backend alerts: {error}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ color: "#e2f0ff", margin: 0, fontSize: 22, fontWeight: 700 }}>
            Alert <span style={{ color: "#ff2b4a" }}>Monitor</span>
          </h1>
          <p style={{ color: "#5b7fa6", fontSize: 13, margin: "4px 0 0" }}>
            Real-time threat intelligence feed
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: "#0a1628",
              border: "1px solid #1a3050",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00ff9d",
                animation: "pulse 1s infinite",
              }}
            />
            <span style={{ color: "#00ff9d", fontSize: 11, fontWeight: 600 }}>LIVE STREAM</span>
          </div>
          {unreadCount > 0 && (
            <div
              style={{
                padding: "6px 14px",
                background: "rgba(255,43,74,0.12)",
                border: "1px solid rgba(255,43,74,0.3)",
                borderRadius: 6,
                color: "#ff2b4a",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Bell size={12} />
              {unreadCount} unread
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Critical", count: criticalCount, color: "#ff2b4a" },
          { label: "High", count: localAlerts.filter((a) => a.severity === "high" && !a.resolved).length, color: "#ff7700" },
          { label: "Medium", count: localAlerts.filter((a) => a.severity === "medium" && !a.resolved).length, color: "#f5c518" },
          { label: "Resolved", count: localAlerts.filter((a) => a.resolved).length, color: "#00ff9d" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              flex: 1,
              background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
              border: `1px solid ${item.color}33`,
              borderRadius: 10,
              padding: "16px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ color: item.color, fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{item.count}</div>
            <div style={{ color: "#5b7fa6", fontSize: 11, letterSpacing: "0.05em" }}>{item.label} Alerts</div>
          </div>
        ))}

        {/* Hourly chart */}
        <div
          style={{
            flex: 3,
            background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
            border: "1px solid #1a3050",
            borderRadius: 10,
            padding: "14px 20px",
          }}
        >
          <div style={{ color: "#7a9cc0", fontSize: 10, letterSpacing: "0.06em", marginBottom: 8 }}>
            ALERTS PER HOUR (TODAY)
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={hourlyAlerts} barCategoryGap="20%">
              <XAxis dataKey="hour" tick={{ fill: "#3d5a7a", fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="alerts" radius={[2, 2, 0, 0]}>
                {hourlyAlerts.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.alerts > 20 ? "#ff2b4a" : entry.alerts > 10 ? "#ff7700" : "#0e6cc4"}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: "#081426", border: "1px solid #1a3050", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ color: "#5b7fa6", fontSize: 10, marginBottom: 3 }}>AI AVG PRIORITY</div>
          <div style={{ color: "#00aaff", fontSize: 18, fontWeight: 700 }}>{aiPriorityAvg.toFixed(1)}</div>
        </div>
        <div style={{ flex: 1, background: "#081426", border: "1px solid #1a3050", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ color: "#5b7fa6", fontSize: 10, marginBottom: 3 }}>AI ANOMALY RATE</div>
          <div style={{ color: "#ff7700", fontSize: 18, fontWeight: 700 }}>{aiAnomalyRate.toFixed(1)}%</div>
        </div>
        <div style={{ flex: 1, background: "#081426", border: "1px solid #1a3050", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ color: "#5b7fa6", fontSize: 10, marginBottom: 3 }}>AI INTEGRATION ERRORS</div>
          <div style={{ color: "#ff2b4a", fontSize: 18, fontWeight: 700 }}>{data.aiIntegration?.errors?.length ?? 0}</div>
        </div>
      </div>

      {/* Live stream ticker */}
      {liveStream.length > 0 && (
        <div
          style={{
            background: "rgba(255,43,74,0.04)",
            border: "1px solid rgba(255,43,74,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#ff2b4a",
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.08em",
              flexShrink: 0,
            }}
          >
            NEW
          </div>
          <Activity size={13} color="#ff2b4a" style={{ flexShrink: 0 }} />
          <div style={{ color: "#ff9090", fontSize: 12, flex: 1 }}>
            <span style={{ color: "#ff2b4a", fontWeight: 700 }}>{liveStream[0].severity.toUpperCase()}</span>:{" "}
            {liveStream[0].description}
          </div>
          <div style={{ color: "#5b7fa6", fontSize: 10, flexShrink: 0 }}>
            {timeAgo(liveStream[0].timestamp)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {/* Severity filter */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "6px 12px",
                background: filter === s
                  ? s === "all"
                    ? "rgba(0,255,157,0.12)"
                    : `${getSeverityColor(s as Alert["severity"])}18`
                  : "#0a1628",
                border: `1px solid ${
                  filter === s
                    ? s === "all"
                      ? "#00ff9d"
                      : getSeverityColor(s as Alert["severity"])
                    : "#1a3050"
                }`,
                borderRadius: 6,
                color: filter === s
                  ? s === "all"
                    ? "#00ff9d"
                    : getSeverityColor(s as Alert["severity"])
                  : "#7a9cc0",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                textTransform: "capitalize",
              }}
            >
              {s === "all" ? "All Severity" : s}
            </button>
          ))}
        </div>

        <div style={{ height: 20, width: 1, background: "#1a3050" }} />

        {/* Type filter */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", "large_transaction", "rapid_transactions", "darkweb_wallet", "mixer", "phishing"] as const).map(
            (t) => {
              const cfg = t !== "all" ? TYPE_CONFIG[t] : null;
              const Icon = cfg?.icon;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding: "6px 12px",
                    background: typeFilter === t ? (cfg ? cfg.bg : "rgba(0,255,157,0.08)") : "#0a1628",
                    border: `1px solid ${typeFilter === t ? (cfg ? cfg.color : "#00ff9d") : "#1a3050"}`,
                    borderRadius: 6,
                    color: typeFilter === t ? (cfg ? cfg.color : "#00ff9d") : "#7a9cc0",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {Icon && <Icon size={11} />}
                  {t === "all" ? "All Types" : cfg?.label}
                </button>
              );
            }
          )}
        </div>

        <button
          onClick={() => setShowResolved(!showResolved)}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            background: showResolved ? "rgba(0,255,157,0.08)" : "#0a1628",
            border: `1px solid ${showResolved ? "#00ff9d" : "#1a3050"}`,
            borderRadius: 6,
            color: showResolved ? "#00ff9d" : "#7a9cc0",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <CheckCircle size={11} />
          {showResolved ? "Hide Resolved" : "Show Resolved"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Alert feed */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredAlerts.length === 0 && (
            <div
              style={{
                background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                border: "1px solid #1a3050",
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: "#3d5a7a",
                fontSize: 13,
              }}
            >
              No alerts match your current filters
            </div>
          )}

          {filteredAlerts.map((alert) => {
            const cfg = TYPE_CONFIG[alert.type];
            const Icon = cfg.icon;
            const sColor = getSeverityColor(alert.severity);
            const isSelected = selected?.id === alert.id;

            return (
              <div
                key={alert.id}
                onClick={() => {
                  setSelected(isSelected ? null : alert);
                  if (!alert.read) markRead(alert.id);
                }}
                style={{
                  background: isSelected
                    ? `rgba(${alert.severity === "critical" ? "255,43,74" : "14,108,196"},0.08)`
                    : alert.resolved
                    ? "rgba(0,0,0,0.3)"
                    : "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                  border: `1px solid ${
                    isSelected
                      ? sColor + "66"
                      : alert.resolved
                      ? "#0f1e35"
                      : !alert.read
                      ? sColor + "44"
                      : "#1a3050"
                  }`,
                  borderRadius: 10,
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  position: "relative",
                  opacity: alert.resolved ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = sColor + "55";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.borderColor =
                      alert.resolved ? "#0f1e35" : !alert.read ? sColor + "44" : "#1a3050";
                }}
              >
                {/* Unread indicator */}
                {!alert.read && !alert.resolved && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: sColor,
                      borderRadius: "10px 0 0 10px",
                    }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  {/* Icon */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: cfg.bg,
                      border: `1px solid ${cfg.color}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} color={cfg.color} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          background: sColor + "18",
                          border: `1px solid ${sColor}44`,
                          borderRadius: 9999,
                          color: sColor,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {alert.severity.toUpperCase()}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          background: cfg.bg,
                          border: `1px solid ${cfg.color}33`,
                          borderRadius: 9999,
                          color: cfg.color,
                          fontSize: 9,
                          fontWeight: 600,
                        }}
                      >
                        {cfg.label}
                      </span>
                      {alert.resolved && (
                        <span
                          style={{
                            padding: "2px 8px",
                            background: "rgba(0,255,157,0.08)",
                            border: "1px solid rgba(0,255,157,0.2)",
                            borderRadius: 9999,
                            color: "#00ff9d",
                            fontSize: 9,
                            fontWeight: 600,
                          }}
                        >
                          ✓ RESOLVED
                        </span>
                      )}
                      {!alert.read && !alert.resolved && (
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: sColor,
                            boxShadow: `0 0 6px ${sColor}`,
                          }}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        color: alert.resolved ? "#5b7fa6" : "#d0e4ff",
                        fontSize: 13,
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      {alert.description}
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ color: "#5b7fa6", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                        {alert.walletAddress}
                      </div>
                      {alert.amount && (
                        <div style={{ color: "#7a9cc0", fontSize: 11 }}>
                          Amount: <span style={{ color: "#e2f0ff", fontWeight: 600 }}>{alert.amount} {alert.currency}</span>
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          color: "#3d5a7a",
                          fontSize: 11,
                          marginLeft: "auto",
                        }}
                      >
                        <Clock size={10} />
                        {timeAgo(alert.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!alert.resolved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markResolved(alert.id);
                        }}
                        title="Mark as resolved"
                        style={{
                          width: 30,
                          height: 30,
                          background: "rgba(0,255,157,0.08)",
                          border: "1px solid rgba(0,255,157,0.2)",
                          borderRadius: 7,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#00ff9d",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,255,157,0.15)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,255,157,0.08)")}
                      >
                        <CheckCircle size={13} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(isSelected ? null : alert);
                      }}
                      title="View details"
                      style={{
                        width: 30,
                        height: 30,
                        background: "#0f1e35",
                        border: "1px solid #1a3050",
                        borderRadius: 7,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#7a9cc0",
                      }}
                    >
                      <Eye size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              position: "sticky",
              top: 20,
              alignSelf: "flex-start",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Alert detail */}
            <div
              style={{
                background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                border: `1px solid ${getSeverityColor(selected.severity)}44`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div style={{ color: "#e2f0ff", fontWeight: 700, fontSize: 14 }}>Alert Detail</div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#5b7fa6", cursor: "pointer" }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Severity badge */}
              <div
                style={{
                  padding: "12px 16px",
                  background: `${getSeverityColor(selected.severity)}10`,
                  border: `1px solid ${getSeverityColor(selected.severity)}33`,
                  borderRadius: 8,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {(() => {
                  const cfg = TYPE_CONFIG[selected.type];
                  const Icon = cfg.icon;
                  return (
                    <>
                      <Icon size={18} color={cfg.color} />
                      <div>
                        <div style={{ color: getSeverityColor(selected.severity), fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>
                          {selected.severity.toUpperCase()} SEVERITY
                        </div>
                        <div style={{ color: "#7a9cc0", fontSize: 11 }}>{cfg.label}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <p style={{ color: "#a0c0e0", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
                {selected.description}
              </p>

              {/* Details grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Wallet", value: selected.walletAddress, mono: true },
                  ...(selected.amount
                    ? [{ label: "Amount", value: `${selected.amount} ${selected.currency}`, mono: false }]
                    : []),
                  { label: "Status", value: selected.resolved ? "✓ Resolved" : selected.read ? "Reviewed" : "● Unread", mono: false },
                  { label: "Time", value: timeAgo(selected.timestamp), mono: false },
                  { label: "Alert ID", value: `#${selected.id}`, mono: true },
                ].map(({ label, value, mono }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      borderBottom: "1px solid #0f1e35",
                    }}
                  >
                    <span style={{ color: "#5b7fa6", fontSize: 11 }}>{label}</span>
                    <span
                      style={{
                        color: label === "Status" && !selected.resolved ? getSeverityColor(selected.severity) : "#e2f0ff",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {!selected.resolved && (
                <button
                  onClick={() => markResolved(selected.id)}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    padding: "10px",
                    background: "rgba(0,255,157,0.08)",
                    border: "1px solid rgba(0,255,157,0.25)",
                    borderRadius: 8,
                    color: "#00ff9d",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontFamily: "'Space Grotesk', sans-serif",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,255,157,0.14)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,255,157,0.08)")}
                >
                  <CheckCircle size={13} />
                  Mark as Resolved
                </button>
              )}
            </div>

            {/* Alert type breakdown */}
            <div
              style={{
                background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                border: "1px solid #1a3050",
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ color: "#e2f0ff", fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Type Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(Object.entries(TYPE_CONFIG) as [Alert["type"], typeof TYPE_CONFIG[Alert["type"]]][]).map(
                  ([type, cfg]) => {
                    const count = localAlerts.filter((a) => a.type === type).length;
                    const max = Math.max(...Object.keys(TYPE_CONFIG).map((t) => localAlerts.filter((a) => a.type === t).length));
                    return (
                      <div key={type}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: cfg.color, fontSize: 10 }}>{cfg.label}</span>
                          <span style={{ color: "#e2f0ff", fontSize: 10, fontWeight: 600 }}>{count}</span>
                        </div>
                        <div style={{ height: 4, background: "#0f1e35", borderRadius: 2, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${(count / max) * 100}%`,
                              background: cfg.color,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
