@echo off
echo ===============================================================
echo  Starting Bengaluru Civic AI Platform (Backend + Frontend)
echo ===============================================================

cd /d "%~dp0"

echo [1/2] Launching Backend on http://localhost:8000 ...
start "CivicAI Backend (FastAPI)" cmd /k "cd /d %~dp0 && .\.venv\Scripts\python.exe start.py"

echo [2/2] Launching Frontend on http://localhost:5173 ...
start "CivicAI Frontend (Vite)" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo Both servers are starting up in dedicated windows!
echo  - Backend API: http://localhost:8000 (Docs: http://localhost:8000/docs)
echo  - Frontend UI: http://localhost:5173
echo ===============================================================
