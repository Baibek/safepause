#!/usr/bin/env bash
# Builds the web app (once) and starts Senim on http://localhost:8000
set -e
cd "$(dirname "$0")"
# secrets and settings come only from .env (see .env.example)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
pip install -q -r backend/requirements.txt
[ -f backend/model.json ] || (cd backend && python train.py)
[ -d frontend/dist ] || (cd frontend && npm install --no-audit --no-fund && npm run build)
cd backend && exec uvicorn main:app --port 8000
