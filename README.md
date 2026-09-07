# AI-Powered Smart Civic Issue Reporting, Detection, Resolution & Transparency Platform

A production-quality, full-stack civic issue reporting and incident management platform for Bengaluru that bridges citizen reporting, real-time AI dashcam road damage detection, automated evidence verification, multi-signal duplicate incident aggregation, intelligent municipal department routing, and public governance transparency.

---

## Key Innovation Modules

### 1. Distinction: Detection $\to$ Report $\to$ Incident $\to$ Resolution
- **Observation / Detection:** Raw camera frame or citizen upload.
- **Report:** Individual citizen or dashcam observation.
- **Civic Incident:** The canonical physical civic defect on the road. Repeated frames or multiple citizen reports for the same pothole attach to the same incident, boosting confidence and dispatch priority without duplicating municipal tickets.

### 2. AI Dashcam Drive Mode (Reference: Pothole Reporter)
- Zero-touch, non-distracting driver HUD (`DRIVE MODE ACTIVE`, `AI Monitoring Road`, `Issues Detected: N`).
- Audio chime synthesized via Web Audio API for hands-free driver notification.
- **Temporal Filtering:** Consecutive video frames (within 2.5s and 15m) are merged into **one detection event** with the sharpest evidence frame selected.

### 3. Multi-Signal Duplicate Detection Engine
Calculates a composite similarity score:
$$\text{Score}_{\text{dup}} = w_{\text{loc}} \cdot S_{\text{loc}} + w_{\text{cat}} \cdot S_{\text{cat}} + w_{\text{vis}} \cdot S_{\text{vis}} + w_{\text{time}} \cdot S_{\text{time}}$$
- Geospatial Haversine distance
- Exact / related category matching
- Visual Perceptual Hash (64-bit dHash / Hamming distance)
- Exponential time decay over days

### 4. Bengaluru BBMP Ward Point-in-Polygon GIS
- Authentic BBMP ward geometries (Koramangala, HSR Layout, Indiranagar, Whitefield, Bellandur, BTM Layout, Jayanagar, Malleshwaram, Yelahanka, RR Nagar).
- Microsecond Point-in-Polygon spatial mapping (`shapely`).

### 5. Multi-Role Portals
- **Citizen Portal:** One-touch photo upload with AI pre-screening, Voice reporting with NLP (English & Kannada), AI Dashcam Drive Mode, My Reports with Citizen Verification on resolution.
- **Authority Dashboard:** KPI metrics, interactive map with clustering, triage table, officer assignment, and Before vs After resolution proof uploader.
- **Public Transparency Portal:** Aggregated civic statistics, BBMP ward scorecards, and public incident map with **strictly zero citizen PII**.
- **Administrator Panel:** Live tuning of AI confidence thresholds, duplicate search radius, duplicate weights, user roles, and audit trails.
- **Government Integration Adapter:** Compliant with Section 2 & 30 (no illegal scraping or portal abuse); features authorized API connector and citizen-assisted BBMP Sahaya complaint dossier generator.

---

## Quick Start Guide

### 1. Launch Full-Stack Application
```bash
python start.py
```
Open your browser at:
- **Full-Stack Application:** [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Pre-Seeded Test Credentials
Use the **"Login / Roles"** button in the navbar for one-click instant login:
- **Citizen:** `citizen.ananya@gmail.com` / `Citizen@123`
- **Authority Officer (BBMP Roads):** `officer.roads@bbmp.gov.in` / `Officer@123`
- **Admin:** `admin@bengaluru.gov.in` / `Admin@123`

---

## Automated Test Suite

Run the comprehensive test suite verifying GIS, Duplicate Detection, Authentication, Dashcam Temporal Suppression, Zero-PII Compliance, and Government Handoff:
```bash
python run_tests.py
```

---

## Computer Vision Training & Evaluation Pipeline

- **Evaluate Model:**
  ```bash
  python ml_pipeline/evaluate.py --weights yolov8n.pt --data ml_pipeline/sample_dataset/data.yaml
  ```
- **Train Custom Pothole Model:**
  ```bash
  python ml_pipeline/train.py --data ml_pipeline/sample_dataset/data.yaml --epochs 3 --batch 2
  ```
