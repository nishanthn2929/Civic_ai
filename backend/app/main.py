import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.app.core.config import settings, BASE_DIR
from backend.app.core.database import Base, engine, apply_sqlite_migrations
from backend.app.api import auth, reports, voice, drive, incidents, authority, public, admin, chat

# Create tables & migrate schema
Base.metadata.create_all(bind=engine)
apply_sqlite_migrations()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="AI-Powered Smart Civic Issue Reporting, Detection, Resolution & Transparency Platform for Bengaluru",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def drive_mode_logging_middleware(request, call_next):
    is_drive_init = "/drive/sessions/start" in request.url.path
    auth_header = request.headers.get("Authorization")
    auth_state = "present" if auth_header else "missing"

    response = await call_next(request)

    if is_drive_init:
        resp_msg = (
            "Session initialized successfully."
            if response.status_code == 200
            else ("Authentication credentials were not provided or have expired." if response.status_code == 401 else f"HTTP Status {response.status_code}")
        )
        print(f"[Drive Mode]\nInitialization request\nEndpoint: {request.url.path}\nAuthentication: {auth_state}\nResponse status: {response.status_code}\nResponse message: {resp_msg}")

    return response

# Ensure upload directory exists and mount static media serving
os.makedirs(settings.MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")

# Include Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(voice.router, prefix=settings.API_V1_STR)
app.include_router(drive.router, prefix=settings.API_V1_STR)
app.include_router(incidents.router, prefix=settings.API_V1_STR)
app.include_router(authority.router, prefix=settings.API_V1_STR)
app.include_router(public.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "city": "Bengaluru",
        "version": "1.0.0"
    }

# Mount Frontend distribution if built
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API or Media routes
        if full_path.startswith("api") or full_path.startswith("media") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        dist_file = FRONTEND_DIST / full_path
        if full_path and dist_file.is_file():
            return FileResponse(str(dist_file))
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"message": "Frontend built assets not found"}
else:
    @app.get("/")
    def root():
        return {
            "platform": settings.PROJECT_NAME,
            "status": "online",
            "city": "Bengaluru, Karnataka",
            "docs_url": "/docs",
            "api_v1": settings.API_V1_STR
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
