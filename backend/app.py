"""
CryptoFlow Analyzer — Flask API
"""

import os
import re
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from analytics_data import build_analytics_dataset
from fraud_model import ModelNotTrainedError, predict_from_features, predict_from_wallet_address, train_wallet_risk_model
from multi_model_trainer import MODEL_FILES, predict_all_models_for_wallet, predict_all_models_for_wallets, train_all_models
from threat_intel import lookup_addresses
from wallet_analyzer import analyze_transactions

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# Load env from both backend/.env and project-root/.env (if present).
load_dotenv(os.path.join(BACKEND_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

app = Flask(__name__)

# Allow the React dev server (and any other origin in development).
# In production, restrict origins to your actual frontend domain:
#   CORS(app, origins=["https://yourapp.example.com"])
CORS(app, origins="*")

def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or not str(value).strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return str(value).strip()


ETHERSCAN_API_KEY = _require_env("ETHERSCAN_API_KEY")
ETHERSCAN_BASE_URL = _require_env("ETHERSCAN_BASE_URL")
ETHERSCAN_CHAIN_ID = _require_env("ETHERSCAN_CHAIN_ID")

# Basic Ethereum address pattern (0x followed by 40 hex chars)
_ETH_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "CryptoFlow Analyzer"}), 200


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "CryptoFlow Analyzer",
        "status": "running",
        "endpoints": [
            "/health",
            "/api/analytics",
            "/api/suspicious",
            "/api/alerts",
            "/analyze_wallet",
            "/api/ml/status",
            "/api/ml/train",
            "/api/ml/predict",
            "/api/ml/train-all",
            "/api/ml/models",
            "/api/ml/predict-all",
        ],
    }), 200


@app.route("/favicon.ico", methods=["GET"])
def favicon():
    return "", 204


@app.route("/api/analytics", methods=["GET"])
def analytics():
    """
    GET /api/analytics

    Returns a complete frontend-ready analytics dataset:
    {
      walletNodes: [...],
      transactions: [...],
      alerts: [...],
      volumeData: [...],
      riskDistData: [...],
      hourlyAlerts: [...]
    }
    """
    include_ai = (request.args.get("include_ai", "false") or "false").strip().lower() in {"1", "true", "yes"}
    ai_limit = max(1, min(200, int(request.args.get("ai_limit", default=20, type=int))))

    try:
        payload = build_analytics_dataset()
        if include_ai:
            model_errors = []
            addresses = [
                str(node.get("address", "")).strip().lower()
                for node in payload.get("walletNodes", [])
                if str(node.get("address", "")).strip()
            ][:ai_limit]

            batch_results = predict_all_models_for_wallets(addresses)
            insights = {item["wallet_address"]: item for item in batch_results}

            missing = [addr for addr in addresses if addr not in insights]
            for addr in missing:
                model_errors.append({"address": addr, "error": "Wallet not found in model dataset"})

            payload["aiInsights"] = insights
            payload["aiIntegration"] = {
                "enabled": True,
                "scored_wallets": len(insights),
                "scored_limit": ai_limit,
                "errors": model_errors,
            }
        return jsonify(payload), 200
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 500
    except ValueError as exc:
        return jsonify({"error": f"Invalid analytics dataset: {exc}"}), 500
    except Exception as exc:
        return jsonify({"error": f"Failed to build analytics dataset: {exc}"}), 500


@app.route("/api/suspicious", methods=["GET"])
def suspicious_transactions():
    """
    GET /api/suspicious?limit=200

    Returns suspicious transactions extracted from the analytics dataset.
    """
    limit = request.args.get("limit", default=200, type=int)
    limit = max(1, min(1000, limit))

    try:
        payload = build_analytics_dataset()
    except Exception as exc:
        return jsonify({"error": f"Failed to build analytics dataset: {exc}"}), 500

    suspicious = [tx for tx in payload.get("transactions", []) if tx.get("suspicious")]
    return jsonify({"count": len(suspicious), "items": suspicious[:limit]}), 200


@app.route("/api/alerts", methods=["GET"])
def alerts_feed():
    """
    GET /api/alerts?severity=critical|high|medium|low

    Returns alerts from the analytics dataset with optional severity filter.
    """
    severity = (request.args.get("severity") or "").strip().lower()
    allowed = {"critical", "high", "medium", "low"}

    if severity and severity not in allowed:
        return jsonify({"error": "severity must be one of: critical, high, medium, low"}), 400

    try:
        payload = build_analytics_dataset()
    except Exception as exc:
        return jsonify({"error": f"Failed to build analytics dataset: {exc}"}), 500

    alerts = payload.get("alerts", [])
    if severity:
        alerts = [a for a in alerts if str(a.get("severity", "")).lower() == severity]

    return jsonify({"count": len(alerts), "items": alerts}), 200


@app.route("/api/ml/train", methods=["POST"])
def train_ml_model():
    """
    POST /api/ml/train
    Optional JSON body:
    {
      "test_size": 0.2,
      "random_state": 42,
      "dataset_path": "...",
      "model_path": "..."
    }
    """
    body = request.get_json(silent=True) or {}

    test_size = body.get("test_size", 0.2)
    random_state = body.get("random_state", 42)
    dataset_path = body.get("dataset_path")
    model_path = body.get("model_path")

    try:
        metrics = train_wallet_risk_model(
            dataset_path=dataset_path,
            model_path=model_path,
            test_size=float(test_size),
            random_state=int(random_state),
        )
        return jsonify({"message": "Model trained successfully", "metrics": metrics}), 200
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Model training failed: {exc}"}), 500


@app.route("/api/ml/predict", methods=["POST"])
def ml_predict():
    """
    POST /api/ml/predict
    Body supports either:
    {
      "wallet_address": "0x..."
    }
    or
    {
      "features": {"Sent tnx": 10, "Received Tnx": 12, ...}
    }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON"}), 400

    wallet_address = (body.get("wallet_address") or "").strip()
    features = body.get("features")
    dataset_path = body.get("dataset_path")
    model_path = body.get("model_path")

    try:
        if wallet_address:
            if not _ETH_ADDRESS_RE.match(wallet_address):
                return jsonify({"error": "Invalid Ethereum wallet address format"}), 400
            result = predict_from_wallet_address(
                wallet_address=wallet_address,
                model_path=model_path,
                dataset_path=dataset_path,
            )
            return jsonify(result), 200

        if isinstance(features, dict):
            result = predict_from_features(features=features, model_path=model_path)
            return jsonify(result), 200

        return jsonify({"error": "Provide either wallet_address or features in request body"}), 400
    except ModelNotTrainedError as exc:
        return jsonify({"error": str(exc)}), 409
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Prediction failed: {exc}"}), 500


@app.route("/api/ml/status", methods=["GET"])
def ml_status():
    model_path = _require_env("WALLET_ML_MODEL_PATH")
    return jsonify({
        "model_path": model_path,
        "model_available": os.path.exists(model_path),
    }), 200


@app.route("/api/ml/train-all", methods=["POST"])
def ml_train_all():
    """
    POST /api/ml/train-all
    Optional JSON body:
    {
      "dataset_path": "...",
      "artifact_dir": "...",
      "fetch_external": true,
      "random_state": 42
    }
    """
    body = request.get_json(silent=True) or {}

    try:
        result = train_all_models(
            dataset_path=body.get("dataset_path"),
            artifact_dir=body.get("artifact_dir"),
            fetch_external=bool(body.get("fetch_external", True)),
            random_state=int(body.get("random_state", 42)),
        )
        return jsonify({"message": "All ML models trained successfully", "result": result}), 200
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Multi-model training failed: {exc}"}), 500


@app.route("/api/ml/models", methods=["GET"])
def ml_models_status():
    model_dir = _require_env("WALLET_ML_MODEL_DIR")
    payload = []
    for _, name in MODEL_FILES.items():
        path = os.path.join(model_dir, name)
        payload.append({
            "name": name,
            "path": path,
            "available": os.path.exists(path),
        })
    return jsonify({"model_dir": model_dir, "models": payload}), 200


@app.route("/api/ml/predict-all", methods=["POST"])
def ml_predict_all():
    """
    POST /api/ml/predict-all
    Body:
    {
      "wallet_address": "0x...",
      "dataset_path": "...",   # optional
      "artifact_dir": "..."    # optional
    }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON"}), 400

    wallet_address = (body.get("wallet_address") or "").strip()
    if not wallet_address:
        return jsonify({"error": "wallet_address is required"}), 400
    if not _ETH_ADDRESS_RE.match(wallet_address):
        return jsonify({"error": "Invalid Ethereum wallet address format"}), 400

    try:
        result = predict_all_models_for_wallet(
            wallet_address=wallet_address,
            dataset_path=body.get("dataset_path"),
            artifact_dir=body.get("artifact_dir"),
        )
        return jsonify(result), 200
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Predict-all failed: {exc}"}), 500


@app.route("/api/ml/predict-batch", methods=["POST"])
def ml_predict_batch():
    """
    POST /api/ml/predict-batch
    Body:
    {
      "wallet_addresses": ["0x...", "0x..."],
      "dataset_path": "...",   # optional
      "artifact_dir": "..."    # optional
    }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON"}), 400

    wallet_addresses = body.get("wallet_addresses")
    if not isinstance(wallet_addresses, list) or not wallet_addresses:
        return jsonify({"error": "wallet_addresses must be a non-empty array"}), 400

    dataset_path = body.get("dataset_path")
    artifact_dir = body.get("artifact_dir")

    valid_addresses = []
    errors = []
    for raw in wallet_addresses:
        wallet_address = str(raw or "").strip()
        if not _ETH_ADDRESS_RE.match(wallet_address):
            errors.append({"wallet_address": wallet_address, "error": "Invalid Ethereum wallet address format"})
            continue
        valid_addresses.append(wallet_address)

    try:
        results = predict_all_models_for_wallets(
            wallet_addresses=valid_addresses,
            dataset_path=dataset_path,
            artifact_dir=artifact_dir,
        )
        found = {item.get("wallet_address") for item in results}
        for wallet_address in valid_addresses:
            if wallet_address.lower() not in found:
                errors.append({"wallet_address": wallet_address, "error": "Wallet not found in model dataset"})
    except Exception as exc:
        return jsonify({"error": f"Batch prediction failed: {exc}"}), 500

    return jsonify({
        "count": len(results),
        "results": results,
        "errors": errors,
    }), 200


@app.route("/analyze_wallet", methods=["POST"])
def analyze_wallet():
    """
    POST /analyze_wallet
    Body (JSON): { "wallet_address": "0x..." }

    Returns:
    {
        "wallet_address":          str,
        "total_transactions":      int,
        "suspicious_transactions": list[dict],
        "risk_score":              int,   // 0-100
        "transaction_flow":        list[dict]
    }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON"}), 400

    wallet_address = (body.get("wallet_address") or "").strip()

    # Input validation — reject anything that doesn't look like an ETH address
    if not wallet_address:
        return jsonify({"error": "wallet_address is required"}), 400

    if not _ETH_ADDRESS_RE.match(wallet_address):
        return jsonify({"error": "Invalid Ethereum wallet address format"}), 400

    if not ETHERSCAN_API_KEY:
        return jsonify({"error": "ETHERSCAN_API_KEY environment variable is not set"}), 500

    # Fetch transactions from Etherscan
    raw_transactions, fetch_error = _fetch_transactions(wallet_address)
    if fetch_error:
        return jsonify({"error": fetch_error}), 502

    # Run analysis
    analysis = analyze_transactions(raw_transactions, wallet_address=wallet_address)

    # Threat-intel verification for analyzed wallet + suspicious counterparties.
    related_addresses = {wallet_address.strip().lower()}
    for tx in analysis.get("suspicious_transactions", []):
        frm = str(tx.get("from", "")).strip().lower()
        to = str(tx.get("to", "")).strip().lower()
        if frm:
            related_addresses.add(frm)
        if to:
            related_addresses.add(to)

    intel_map = lookup_addresses(sorted(related_addresses))
    high_conf_hits = [item for item in intel_map.values() if bool(item.get("is_flagged"))]
    score_boost = sum(int(item.get("score_boost", 0) or 0) for item in high_conf_hits)
    adjusted_risk = min(100, int(analysis["risk_score"]) + min(30, score_boost))

    reasons = list(analysis.get("explainability", {}).get("reasons", []))
    if high_conf_hits:
        reasons.insert(0, f"Threat-intel matched {len(high_conf_hits)} wallet(s) in external/watchlist datasets")

    explainability = {
        **analysis.get("explainability", {}),
        "reasons": reasons,
        "summary": f"Wallet {'flagged' if adjusted_risk >= 70 else 'under monitoring' if adjusted_risk >= 40 else 'low risk'} with adjusted risk score {adjusted_risk}/100",
    }

    return jsonify({
        "wallet_address": wallet_address,
        "total_transactions": analysis["total_transactions"],
        "suspicious_transactions": analysis["suspicious_transactions"],
        "risk_score": adjusted_risk,
        "transaction_flow": analysis["transaction_flow"],
        "explainability": explainability,
        "threat_intelligence": {
            "checked_addresses": len(related_addresses),
            "flagged_addresses": len(high_conf_hits),
            "sources": ["local_scam_datasets", "bitcoin_abuse", "chainabuse"],
            "matches": high_conf_hits,
            "results": intel_map,
        },
    }), 200


# ---------------------------------------------------------------------------
# Etherscan helper
# ---------------------------------------------------------------------------

def _fetch_transactions(address: str) -> tuple[list[dict], str | None]:
    """
    Fetch up to 10 000 normal transactions from Etherscan V2 for `address`.
    Returns (transactions, error_message).  error_message is None on success.
    """
    params = {
        "chainid": ETHERSCAN_CHAIN_ID,
        "module": "account",
        "action": "txlist",
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "page": 1,
        "offset": 10000,
        "sort": "asc",
        "apikey": ETHERSCAN_API_KEY,
    }

    try:
        resp = requests.get(ETHERSCAN_BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        return [], "Etherscan API request timed out"
    except requests.exceptions.RequestException as exc:
        return [], f"Etherscan API request failed: {exc}"

    try:
        data = resp.json()
    except ValueError:
        return [], "Etherscan returned a non-JSON response"

    # Etherscan returns status "0" with message "No transactions found" for
    # valid addresses that simply have no history — treat that as empty, not error.
    if data.get("status") == "0":
        message = data.get("message", "")
        result = str(data.get("result", ""))
        if "no transactions" in message.lower() or "no transactions" in result.lower():
            return [], None
        return [], f"Etherscan error: {result or message}"

    transactions = data.get("result", [])
    if not isinstance(transactions, list):
        return [], "Unexpected response format from Etherscan"

    return transactions, None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(_require_env("PORT"))
    debug = _require_env("FLASK_DEBUG").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
