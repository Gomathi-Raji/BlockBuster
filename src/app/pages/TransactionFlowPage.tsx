import { useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Filter,
  Eye,
  EyeOff,
  Info,
  X,
  ExternalLink,
  AlertTriangle,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import {
  WalletNode,
  Transaction,
  getRiskColor,
  getRiskLabel,
  formatAddress,
  timeAgo,
} from "../data/mockData";
import { useAnalyticsData } from "../hooks/useAnalyticsData";

interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_ICON: Record<string, string> = {
  mixer: "⚡",
  darkweb: "💀",
  exchange: "🏦",
  wallet: "👛",
  defi: "🔗",
};

export function TransactionFlowPage() {
  const { data } = useAnalyticsData();
  const { walletNodes, transactions } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<NodePosition[]>([]);
  const animRef = useRef<number>(0);
  const [scale, setScale] = useState(1);
  const [selectedNode, setSelectedNode] = useState<WalletNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);
  const [animating, setAnimating] = useState(true);
  const [particles, setParticles] = useState<
    { x: number; y: number; tx: number; ty: number; progress: number; suspicious: boolean; txId: string }[]
  >([]);

  // Initialize node positions
  useEffect(() => {
    const W = 900;
    const H = 520;
    const cx = W / 2;
    const cy = H / 2;
    posRef.current = walletNodes.map((node, i) => {
      const angle = (i / walletNodes.length) * Math.PI * 2;
      const radius = node.risk >= 80 ? 140 : node.risk >= 40 ? 220 : 300;
      return {
        id: node.id,
        x: cx + Math.cos(angle) * radius * (0.8 + Math.random() * 0.4),
        y: cy + Math.sin(angle) * radius * (0.8 + Math.random() * 0.4),
        vx: 0,
        vy: 0,
      };
    });
  }, [walletNodes]);

  // Draw function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 900;
    const H = 520;
    canvas.width = W;
    canvas.height = H;

    const activeTransactions = showSuspiciousOnly
      ? transactions.filter((t) => t.suspicious)
      : transactions;

    let pList: { x: number; y: number; tx: number; ty: number; progress: number; suspicious: boolean; txId: string }[] =
      [];

    const spawnParticle = () => {
      if (!animating) return;
      const tx = activeTransactions[Math.floor(Math.random() * activeTransactions.length)];
      const fromPos = posRef.current.find((p) => p.id === tx.from);
      const toPos = posRef.current.find((p) => p.id === tx.to);
      if (!fromPos || !toPos) return;
      pList.push({
        x: fromPos.x,
        y: fromPos.y,
        tx: toPos.x,
        ty: toPos.y,
        progress: 0,
        suspicious: tx.suspicious,
        txId: tx.id,
      });
    };

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      bg.addColorStop(0, "#0a1428");
      bg.addColorStop(1, "#050912");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.02)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Draw edges
      activeTransactions.forEach((tx) => {
        const fromPos = posRef.current.find((p) => p.id === tx.from);
        const toPos = posRef.current.find((p) => p.id === tx.to);
        if (!fromPos || !toPos) return;

        const color = tx.suspicious ? "#ff2b4a" : "#0e6cc4";
        const alpha = hoveredNode
          ? tx.from === hoveredNode || tx.to === hoveredNode
            ? 0.7
            : 0.08
          : 0.3;

        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);

        // Curved line
        const mx = (fromPos.x + toPos.x) / 2 + (fromPos.y - toPos.y) * 0.15;
        const my = (fromPos.y + toPos.y) / 2 + (toPos.x - fromPos.x) * 0.15;
        ctx.quadraticCurveTo(mx, my, toPos.x, toPos.y);
        ctx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.lineWidth = tx.suspicious ? 1.5 : 0.8;
        ctx.setLineDash(tx.suspicious ? [] : [5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow
        const angle = Math.atan2(toPos.y - my, toPos.x - mx);
        const ar = 8;
        ctx.beginPath();
        ctx.moveTo(toPos.x, toPos.y);
        ctx.lineTo(
          toPos.x - ar * Math.cos(angle - Math.PI / 6),
          toPos.y - ar * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          toPos.x - ar * Math.cos(angle + Math.PI / 6),
          toPos.y - ar * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      });

      // Spawn particles
      if (animating && frame % 40 === 0) spawnParticle();
      frame++;

      // Update & draw particles
      pList = pList.filter((p) => p.progress <= 1);
      pList.forEach((p) => {
        p.progress += 0.012;
        p.x = p.x + (p.tx - p.x) * 0.012;
        p.y = p.y + (p.ty - p.y) * 0.012;

        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
        grd.addColorStop(0, p.suspicious ? "#ff2b4aee" : "#00ff9dee");
        grd.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.suspicious ? "#ff2b4a" : "#00ff9d";
        ctx.fill();
      });

      // Draw nodes
      walletNodes.forEach((node) => {
        const pos = posRef.current.find((p) => p.id === node.id);
        if (!pos) return;

        const isHovered = hoveredNode === node.id;
        const isSelected = selectedNode?.id === node.id;
        const riskColor = getRiskColor(node.risk);
        const r = node.risk >= 80 ? 22 : node.risk >= 40 ? 18 : 15;
        const glowR = r * 2.5;

        const dimmed = hoveredNode && !isHovered && !isSelected;

        // Glow
        const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR);
        grd.addColorStop(0, riskColor + (dimmed ? "18" : "44"));
        grd.addColorStop(1, riskColor + "00");
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Ring for selected
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = riskColor + "88";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Node body
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `#0a1628${dimmed ? "bb" : ""}`;
        ctx.fill();
        ctx.strokeStyle = riskColor + (dimmed ? "44" : "cc");
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Icon
        ctx.font = `${r - 2}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = dimmed ? 0.3 : 1;
        ctx.fillText(TYPE_ICON[node.type] || "⬡", pos.x, pos.y);
        ctx.globalAlpha = 1;

        // Label
        ctx.font = "11px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dimmed ? "#3d5a7a" : node.risk >= 80 ? "#ff6b7a" : "#a0c0e0";
        ctx.fillText(node.label, pos.x, pos.y + r + 6);

        // Risk badge
        if (node.risk >= 80) {
          ctx.font = "bold 9px 'Space Grotesk', sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ff2b4a";
          ctx.fillText(`●RISK ${node.risk}`, pos.x, pos.y + r + 18);
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [hoveredNode, selectedNode, showSuspiciousOnly, animating]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let found: WalletNode | null = null;
    walletNodes.forEach((node) => {
      const pos = posRef.current.find((p) => p.id === node.id);
      if (!pos) return;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 28) found = node;
    });
    setSelectedNode(found);
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let found: string | null = null;
    walletNodes.forEach((node) => {
      const pos = posRef.current.find((p) => p.id === node.id);
      if (!pos) return;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 28) found = node.id;
    });
    setHoveredNode(found);
  };

  const selectedTxs = selectedNode
    ? transactions.filter((t) => t.from === selectedNode.id || t.to === selectedNode.id)
    : [];

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Space Grotesk', sans-serif", background: "#050912", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ color: "#e2f0ff", margin: 0, fontSize: 22, fontWeight: 700 }}>
            Transaction <span style={{ color: "#00ff9d" }}>Flow Graph</span>
          </h1>
          <p style={{ color: "#5b7fa6", fontSize: 13, margin: "4px 0 0" }}>
            Interactive wallet-to-wallet network visualization
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowSuspiciousOnly(!showSuspiciousOnly)}
            style={{
              padding: "8px 16px",
              background: showSuspiciousOnly ? "rgba(255,43,74,0.15)" : "#0a1628",
              border: `1px solid ${showSuspiciousOnly ? "#ff2b4a" : "#1a3050"}`,
              borderRadius: 8,
              color: showSuspiciousOnly ? "#ff2b4a" : "#7a9cc0",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            <Filter size={13} />
            {showSuspiciousOnly ? "Suspicious Only" : "All Transactions"}
          </button>
          <button
            onClick={() => setAnimating(!animating)}
            style={{
              padding: "8px 16px",
              background: "#0a1628",
              border: "1px solid #1a3050",
              borderRadius: 8,
              color: animating ? "#00ff9d" : "#7a9cc0",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {animating ? <Eye size={13} /> : <EyeOff size={13} />}
            {animating ? "Live Particles" : "Paused"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Canvas area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            background: "linear-gradient(135deg, #090f1e 0%, #070d1a 100%)",
            border: "1px solid #1a3050",
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Legend */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: "rgba(5,9,18,0.85)",
              border: "1px solid #1a3050",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div style={{ color: "#3d5a7a", fontSize: 9, letterSpacing: "0.1em", marginBottom: 4 }}>LEGEND</div>
            {[
              { color: "#ff2b4a", label: "Critical risk (≥80)" },
              { color: "#ff7700", label: "High risk (60–79)" },
              { color: "#f5c518", label: "Medium risk (40–59)" },
              { color: "#00aaff", label: "Low risk (20–39)" },
              { color: "#00ff9d", label: "Clean (0–19)" },
            ].map((item) => (
              <div key={item.color} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: item.color,
                    boxShadow: `0 0 6px ${item.color}`,
                  }}
                />
                <span style={{ color: "#7a9cc0", fontSize: 10 }}>{item.label}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #1a3050", marginTop: 4, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 20, height: 1.5, background: "#ff2b4a" }} />
                <span style={{ color: "#7a9cc0", fontSize: 10 }}>Suspicious TX</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ width: 20, height: 1, background: "#0e6cc4", borderTop: "1px dashed #0e6cc4" }} />
                <span style={{ color: "#7a9cc0", fontSize: 10 }}>Normal TX</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 10,
              display: "flex",
              gap: 8,
            }}
          >
            {[
              { label: "Wallets", value: walletNodes.length, color: "#00aaff" },
              { label: "Transactions", value: transactions.length, color: "#00ff9d" },
              {
                label: "Flagged",
                value: walletNodes.filter((w) => w.flagged).length,
                color: "#ff2b4a",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "rgba(5,9,18,0.85)",
                  border: "1px solid #1a3050",
                  borderRadius: 8,
                  padding: "8px 14px",
                  textAlign: "center",
                }}
              >
                <div style={{ color: s.color, fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                <div style={{ color: "#5b7fa6", fontSize: 9, letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMove}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ width: "100%", height: "100%", minHeight: 520, cursor: hoveredNode ? "pointer" : "default" }}
          />
        </div>

        {/* Detail panel */}
        <div
          style={{
            width: 300,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {selectedNode ? (
            <>
              <div
                style={{
                  background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                  border: `1px solid ${getRiskColor(selectedNode.risk)}44`,
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{TYPE_ICON[selectedNode.type]}</div>
                    <div style={{ color: "#e2f0ff", fontWeight: 700, fontSize: 15 }}>{selectedNode.label}</div>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    style={{ background: "none", border: "none", color: "#5b7fa6", cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Risk meter */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#7a9cc0", fontSize: 11 }}>RISK SCORE</span>
                    <span
                      style={{
                        color: getRiskColor(selectedNode.risk),
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {getRiskLabel(selectedNode.risk)} — {selectedNode.risk}/100
                    </span>
                  </div>
                  <div style={{ height: 6, background: "#0f1e35", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${selectedNode.risk}%`,
                        background: `linear-gradient(90deg, #00ff9d, ${getRiskColor(selectedNode.risk)})`,
                        borderRadius: 3,
                        transition: "width 0.5s",
                      }}
                    />
                  </div>
                </div>

                {/* Info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Address", value: formatAddress(selectedNode.address), mono: true },
                    { label: "Type", value: selectedNode.type.toUpperCase() },
                    { label: "Balance", value: `${selectedNode.balance} ${selectedNode.currency}` },
                    { label: "Transactions", value: selectedNode.transactionCount.toLocaleString() },
                    { label: "First Seen", value: selectedNode.firstSeen },
                    { label: "Last Active", value: selectedNode.lastActive },
                  ].map((item) => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#5b7fa6", fontSize: 11 }}>{item.label}</span>
                      <span
                        style={{
                          color: "#e2f0ff",
                          fontSize: 11,
                          fontFamily: item.mono ? "'JetBrains Mono', monospace" : undefined,
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Tags */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                  {selectedNode.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: "2px 8px",
                        background: selectedNode.flagged ? "rgba(255,43,74,0.12)" : "rgba(0,170,255,0.1)",
                        border: `1px solid ${selectedNode.flagged ? "#ff2b4a44" : "#00aaff33"}`,
                        borderRadius: 9999,
                        color: selectedNode.flagged ? "#ff6b7a" : "#5bb0ff",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {selectedNode.flagged && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 12px",
                      background: "rgba(255,43,74,0.08)",
                      border: "1px solid rgba(255,43,74,0.25)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={14} color="#ff2b4a" />
                    <span style={{ color: "#ff6b7a", fontSize: 11 }}>
                      Wallet flagged in intelligence database
                    </span>
                  </div>
                )}
              </div>

              {/* Transactions involving this node */}
              <div
                style={{
                  background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                  border: "1px solid #1a3050",
                  borderRadius: 12,
                  padding: 16,
                  flex: 1,
                }}
              >
                <div style={{ color: "#e2f0ff", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                  Linked Transactions ({selectedTxs.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedTxs.map((tx) => {
                    const isFrom = tx.from === selectedNode.id;
                    const other = walletNodes.find((w) => w.id === (isFrom ? tx.to : tx.from));
                    return (
                      <div
                        key={tx.id}
                        style={{
                          padding: "8px 10px",
                          background: tx.suspicious ? "rgba(255,43,74,0.06)" : "rgba(0,0,0,0.2)",
                          border: `1px solid ${tx.suspicious ? "#ff2b4a22" : "#0f1e35"}`,
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: isFrom ? "#ff7700" : "#00ff9d", fontSize: 10, fontWeight: 600 }}>
                            {isFrom ? "→ OUT" : "← IN"}
                          </span>
                          <span style={{ color: "#5b7fa6", fontSize: 10 }}>{timeAgo(tx.timestamp)}</span>
                        </div>
                        <div style={{ color: "#e2f0ff", fontSize: 12, fontWeight: 600 }}>
                          {tx.amount} {tx.currency}
                        </div>
                        <div style={{ color: "#5b7fa6", fontSize: 10, marginTop: 2 }}>
                          {isFrom ? "To" : "From"}: {other?.label || "Unknown"}
                        </div>
                        {tx.reason && (
                          <div style={{ color: "#ff6b7a", fontSize: 10, marginTop: 4 }}>⚠ {tx.reason}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
                border: "1px solid #1a3050",
                borderRadius: 12,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                minHeight: 200,
                textAlign: "center",
              }}
            >
              <Shield size={32} color="#1a3050" />
              <div style={{ color: "#5b7fa6", fontSize: 13 }}>Click any node on the graph to inspect wallet details</div>
              <div style={{ color: "#3d5a7a", fontSize: 11 }}>Red nodes = high-risk wallets</div>
            </div>
          )}

          {/* Node list */}
          <div
            style={{
              background: "linear-gradient(135deg, #090f1e 0%, #0a1628 100%)",
              border: "1px solid #1a3050",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ color: "#e2f0ff", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Wallet Index
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {walletNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: selectedNode?.id === node.id ? "rgba(0,255,157,0.06)" : "transparent",
                    border: `1px solid ${selectedNode?.id === node.id ? "#00ff9d22" : "transparent"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: getRiskColor(node.risk),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "#a0c0e0", fontSize: 11, flex: 1 }}>{node.label}</span>
                  <span style={{ color: getRiskColor(node.risk), fontSize: 10, fontWeight: 700 }}>{node.risk}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
