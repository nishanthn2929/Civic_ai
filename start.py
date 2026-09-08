import os
import sys
import uvicorn
from backend.seed_data import seed

def main():
    print("=" * 70)
    print(" BENGALURU CIVIC AI INCIDENT & ROAD INTELLIGENCE PLATFORM")
    print("=" * 70)
    
    # Run seed data if needed
    print("\n[1/2] Verifying database and initializing seed data...")
    seed()

    # Launch Uvicorn server
    print("\n[2/2] Starting Full-Stack Server on http://localhost:8000 ...")
    print(" -> Web App UI:       http://localhost:8000")
    print(" -> Interactive APIs: http://localhost:8000/docs")
    print(" -> Public Portal:    http://localhost:8000 (Default view)")
    print("\nPress Ctrl+C to stop the server.\n")

    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
