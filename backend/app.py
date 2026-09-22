import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from agent import TransportAgent

load_dotenv()

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

agent = None
init_error = None
try:
    agent = TransportAgent(GROQ_API_KEY, TAVILY_API_KEY)
except Exception as exc:  # noqa: BLE001
    init_error = str(exc)


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/api/health")
def health():
    return jsonify(
        {
            "status": "ok" if agent else "not_configured",
            "detail": init_error,
            "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    if agent is None:
        return (
            jsonify(
                {
                    "error": (
                        "Agent not configured. Set GROQ_API_KEY and "
                        "TAVILY_API_KEY in backend/.env, then restart the "
                        "server."
                    )
                }
            ),
            500,
        )

    data = request.get_json(silent=True) or {}
    history = data.get("history", [])

    if not isinstance(history, list) or not history:
        return jsonify({"error": "Request must include a non-empty 'history' list."}), 400

    # Basic shape validation / sanitation
    clean_history = []
    for turn in history[-20:]:  # cap context window sent to the model
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            clean_history.append({"role": role, "content": content})

    if not clean_history:
        return jsonify({"error": "No valid messages found in history."}), 400

    try:
        result = agent.chat(clean_history)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Agent error: {exc}"}), 500

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
