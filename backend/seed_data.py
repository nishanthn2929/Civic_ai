import os
import json
import uuid
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from backend.app.core.database import SessionLocal, Base, engine
from backend.app.core.security import get_password_hash
from backend.app.models.models import (
    User, UserRole, Department, Ward, Incident, IncidentStatus, IncidentSeverity,
    IncidentStatusHistory, Resolution, Report, ReportMedia, ConfigSetting, AuditLog,
    BBMPWard, BBMPWardDataset
)
from backend.app.core.config import settings

def create_sample_image(filename: str, text: str, bg_color: tuple, defect_type: str = "pothole"):
    """Generate a clean visual placeholder image for seeded incidents/resolutions."""
    filepath = os.path.join(settings.MEDIA_DIR, filename)
    img = Image.new("RGB", (640, 480), color=bg_color)
    draw = ImageDraw.Draw(img)

    # Draw simulated road surface
    draw.rectangle([0, 0, 640, 480], fill=bg_color)
    
    if defect_type == "pothole":
        # Draw road cavity depression
        draw.ellipse([200, 180, 440, 320], fill=(45, 45, 45), outline=(20, 20, 20), width=4)
        draw.ellipse([230, 210, 410, 290], fill=(25, 25, 25))
    elif defect_type == "repaired":
        # Draw freshly laid asphalt patch
        draw.rectangle([180, 160, 460, 340], fill=(50, 52, 55), outline=(80, 85, 90), width=3)
        draw.line([160, 250, 480, 250], fill=(230, 230, 230), width=6)  # Fresh lane marking

    # Draw text banner
    draw.rectangle([20, 20, 620, 70], fill=(0, 0, 0, 180))
    draw.text((30, 35), text, fill=(255, 255, 255))
    draw.text((30, 440), "Bengaluru Civic AI Intelligence Platform • Evidence Capture", fill=(200, 200, 200))

    img.save(filepath, format="JPEG", quality=85)
    return f"/media/{filename}"

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Avoid duplicate seeding
    if db.query(User).filter(User.email == "admin@bengaluru.gov.in").first():
        print("Database already seeded.")
        db.close()
        return

    print("Seeding initial Bengaluru civic platform data...")

    # 1. Departments
    dept_roads = Department(
        code="BBMP_ROADS",
        name="BBMP Road Infrastructure Department",
        description="Responsible for arterial roads, pothole repairs, asphalt resurfacing, and pedestrian paths.",
        contact_email="chief.engineer.roads@bbmp.gov.in",
        escalation_sla_hours=48
    )
    dept_swm = Department(
        code="BBMP_SWM",
        name="BBMP Solid Waste Management",
        description="Garbage collection, black spot clearance, and waste processing in wards.",
        contact_email="swm.operations@bbmp.gov.in",
        escalation_sla_hours=24
    )
    dept_bwssb = Department(
        code="BWSSB",
        name="Bangalore Water Supply and Sewerage Board",
        description="Drinking water pipelines, sewer lines, open manholes, and valve leaks.",
        contact_email="water.complaints@bwssb.gov.in",
        escalation_sla_hours=36
    )
    dept_bescom = Department(
        code="BESCOM",
        name="Bangalore Electricity Supply Company Ltd",
        description="Streetlights, electric poles, transformer safety, and power lines.",
        contact_email="helpline@bescom.karnataka.gov.in",
        escalation_sla_hours=24
    )
    dept_swd = Department(
        code="BBMP_SWD",
        name="BBMP Storm Water Drains",
        description="Primary and secondary rajakaluve storm drains, flood prevention, and desilting.",
        contact_email="swd.monitoring@bbmp.gov.in",
        escalation_sla_hours=48
    )
    db.add_all([dept_roads, dept_swm, dept_bwssb, dept_bescom, dept_swd])
    db.flush()

    # 2. Bengaluru BBMP Wards
    geojson_path = os.path.join(settings.DATA_DIR, "bengaluru_wards.geojson")
    wards_map = {}
    if os.path.exists(geojson_path):
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            meta = data.get("metadata", {})
            features = data.get("features", [])

            # Active dataset record
            if not db.query(BBMPWardDataset).filter(BBMPWardDataset.is_active == True).first():
                ds_rec = BBMPWardDataset(
                    source_name=meta.get("source_name", "BBMP Ward Map - 198 Wards"),
                    source_organization=meta.get("source_organization", "Bruhat Bengaluru Mahanagara Palike (BBMP) GIS Cell / Government of Karnataka"),
                    source_url=meta.get("source_url", "https://data.opencity.in/dataset/bbmp-ward-information"),
                    dataset_version=meta.get("dataset_version", "BBMP-198-2015-V1"),
                    dataset_date=meta.get("dataset_date", "2015-10-01"),
                    download_date=meta.get("download_date", "2026-09-08"),
                    coordinate_system=meta.get("coordinate_system", "EPSG:4326 (WGS84)"),
                    ward_count=len(features),
                    valid_wards=len(features),
                    invalid_wards=0,
                    license_info=meta.get("license", "Open Government Data (OGD) Karnataka / Public Record"),
                    is_active=True
                )
                db.add(ds_rec)

            for feat in features:
                p = feat["properties"]
                geom_str = json.dumps(feat["geometry"])
                w = Ward(
                    ward_number=p["ward_number"],
                    ward_name=p["ward_name"],
                    zone_name=p.get("zone_name") or "Bengaluru",
                    boundary_geojson=geom_str
                )
                db.add(w)
                db.flush()
                wards_map[p["ward_number"]] = w

                bw = BBMPWard(
                    ward_number=p["ward_number"],
                    ward_name=p["ward_name"],
                    zone_name=p.get("zone_name") or "Bengaluru",
                    assembly_constituency=p.get("assembly_constituency"),
                    parliament_constituency=p.get("parliament_constituency"),
                    geometry=geom_str,
                    source=meta.get("source_name", "BBMP Ward Map - 198 Wards"),
                    source_url=meta.get("source_url", "https://data.opencity.in/dataset/bbmp-ward-information"),
                    dataset_version=meta.get("dataset_version", "BBMP-198-2015-V1"),
                    dataset_date=meta.get("dataset_date", "2015-10-01")
                )
                db.add(bw)

    # 3. Users (Admin, Officers, Citizens)
    admin_user = User(
        name="BBMP Central Admin",
        email="admin@bengaluru.gov.in",
        hashed_password=get_password_hash("Admin@123"),
        phone="+91-80-22221188",
        role=UserRole.ADMIN.value
    )
    officer_roads = User(
        name="Er. Ramesh Kumar (Roads)",
        email="officer.roads@bbmp.gov.in",
        hashed_password=get_password_hash("Officer@123"),
        phone="+91-9880112233",
        role=UserRole.AUTHORITY.value,
        department_id=dept_roads.id,
        ward_id=wards_map.get(151, list(wards_map.values())[0]).id
    )
    officer_swm = User(
        name="Smt. Kavitha Reddy (SWM)",
        email="officer.swm@bbmp.gov.in",
        hashed_password=get_password_hash("Officer@123"),
        phone="+91-9880223344",
        role=UserRole.AUTHORITY.value,
        department_id=dept_swm.id,
        ward_id=wards_map.get(174, list(wards_map.values())[0]).id
    )
    citizen_ananya = User(
        name="Ananya Sharma",
        email="citizen.ananya@gmail.com",
        hashed_password=get_password_hash("Citizen@123"),
        phone="+91-9988776655",
        role=UserRole.CITIZEN.value
    )
    citizen_rahul = User(
        name="Rahul Verma",
        email="citizen.rahul@gmail.com",
        hashed_password=get_password_hash("Citizen@123"),
        phone="+91-9944332211",
        role=UserRole.CITIZEN.value
    )
    db.add_all([admin_user, officer_roads, officer_swm, citizen_ananya, citizen_rahul])
    db.flush()

    # 4. Tunable Configuration Settings
    default_configs = [
        ConfigSetting(key="CONFIDENCE_THRESHOLD", value="0.50", description="Minimum RT-DETR confidence to accept detection"),
        ConfigSetting(key="BLUR_THRESHOLD", value="100.0", description="Laplacian variance threshold for image clarity"),
        ConfigSetting(key="DUPLICATE_RADIUS_METERS", value="25.0", description="Spatial search radius for duplicate grouping"),
        ConfigSetting(key="DUPLICATE_SCORE_THRESHOLD", value="0.70", description="Composite similarity threshold to merge reports"),
        ConfigSetting(key="GOVT_INTEGRATION_MODE", value="OFFICIAL_API_AND_HANDOFF", description="Operational integration policy")
    ]
    db.add_all(default_configs)

    # 5. Create Sample Evidence Images
    pothole_img1 = create_sample_image("sample_pothole_koramangala.jpg", "Koramangala 80ft Rd - Deep Pothole (Conf: 94%)", (80, 80, 85), "pothole")
    pothole_img2 = create_sample_image("sample_pothole_hsr_before.jpg", "HSR 27th Main - Road Defect Before Repair", (75, 75, 80), "pothole")
    repaired_img = create_sample_image("sample_hsr_after_repair.jpg", "HSR 27th Main - Asphalt Patch Completed", (60, 65, 70), "repaired")
    damage_img = create_sample_image("sample_whitefield_damage.jpg", "Whitefield Main Rd - Severe Road Crack & Damage", (85, 85, 90), "pothole")

    # 6. Sample Realistic Civic Incidents
    now = datetime.now(timezone.utc)

    # Incident 1: High Priority Pothole in Koramangala with 3 merged reports
    inc1 = Incident(
        incident_code="BLR-PTH-2026-0042",
        category="Pothole",
        title="Severe Pothole on 80ft Road, 4th Block Koramangala",
        description="Deep crater on main traffic corridor causing severe hazard for two-wheelers during peak hours.",
        severity=IncidentSeverity.HIGH.value,
        priority_score=82.5,
        status=IncidentStatus.VERIFIED.value,
        latitude=12.9352,
        longitude=77.6245,
        address="80 Feet Road, 4th Block, Koramangala, Bengaluru",
        ward_id=wards_map.get(151).id if 151 in wards_map else None,
        department_id=dept_roads.id,
        reports_count=3,
        primary_media_url=pothole_img1,
        created_at=now - timedelta(days=2, hours=4)
    )
    db.add(inc1)
    db.flush()

    db.add(IncidentStatusHistory(
        incident_id=inc1.id,
        old_status=None,
        new_status=IncidentStatus.DETECTED.value,
        comment="Incident detected via citizen manual report.",
        created_at=now - timedelta(days=2, hours=4)
    ))
    db.add(IncidentStatusHistory(
        incident_id=inc1.id,
        old_status=IncidentStatus.DETECTED.value,
        new_status=IncidentStatus.VERIFIED.value,
        comment="Automated verification passed: high AI confidence (94%) and GPS validated.",
        created_at=now - timedelta(days=2, hours=3)
    ))

    # Incident 2: Resolved Pothole in HSR Layout with Before & After evidence awaiting citizen verification
    inc2 = Incident(
        incident_code="BLR-PTH-2026-0038",
        category="Pothole",
        title="Road cavity near HSR 27th Main junction",
        description="Hazardous cavity patched with hot-mix asphalt by BBMP Road division.",
        severity=IncidentSeverity.MEDIUM.value,
        priority_score=68.0,
        status=IncidentStatus.CITIZEN_VERIFICATION.value,
        latitude=12.9128,
        longitude=77.6445,
        address="27th Main, Sector 1, HSR Layout, Bengaluru",
        ward_id=wards_map.get(174).id if 174 in wards_map else None,
        department_id=dept_roads.id,
        assigned_to_id=officer_roads.id,
        reports_count=2,
        primary_media_url=pothole_img2,
        created_at=now - timedelta(days=4),
        resolved_at=now - timedelta(hours=12)
    )
    db.add(inc2)
    db.flush()

    res2 = Resolution(
        incident_id=inc2.id,
        officer_id=officer_roads.id,
        before_media_url=pothole_img2,
        after_media_url=repaired_img,
        work_notes="Completed cold-mix and asphalt sealing. Cavity leveled with road grade. Traffic restored.",
        repair_cost=4500.0,
        completed_at=now - timedelta(hours=12),
        citizen_verified=None
    )
    db.add(res2)

    db.add(IncidentStatusHistory(
        incident_id=inc2.id,
        old_status=IncidentStatus.IN_PROGRESS.value,
        new_status=IncidentStatus.CITIZEN_VERIFICATION.value,
        changed_by_id=officer_roads.id,
        comment="Repair completed. After-repair proof uploaded. Awaiting citizen confirmation.",
        created_at=now - timedelta(hours=12)
    ))

    # Incident 3: Critical Whitefield Road Damage assigned and in progress
    inc3 = Incident(
        incident_code="BLR-DMG-2026-0019",
        category="Road Damage",
        title="Severe asphalt subsidence on Whitefield Main Road",
        description="Subsidence following utility cable trenching. Heavy bus and tech shuttle traffic impacted.",
        severity=IncidentSeverity.CRITICAL.value,
        priority_score=92.0,
        status=IncidentStatus.IN_PROGRESS.value,
        latitude=12.9698,
        longitude=77.7499,
        address="Whitefield Main Road, near ITPL, Bengaluru",
        ward_id=wards_map.get(85).id if 85 in wards_map else None,
        department_id=dept_roads.id,
        assigned_to_id=officer_roads.id,
        reports_count=5,
        primary_media_url=damage_img,
        created_at=now - timedelta(days=1, hours=10)
    )
    db.add(inc3)
    db.flush()

    db.add(IncidentStatusHistory(
        incident_id=inc3.id,
        old_status=IncidentStatus.ASSIGNED.value,
        new_status=IncidentStatus.IN_PROGRESS.value,
        changed_by_id=officer_roads.id,
        comment="Repair machinery deployed on site. Night resurfacing underway.",
        created_at=now - timedelta(hours=4)
    ))

    # 7. Seed Citizen Reports linked to Canonical Incidents
    rep1 = Report(
        user_id=citizen_ananya.id,
        source="manual",
        raw_text="Dangerous crater pothole on 80ft Road Koramangala. Two-wheelers skidding frequently.",
        category="Pothole",
        ai_confidence=0.94,
        latitude=12.9352,
        longitude=77.6245,
        gps_accuracy=8.2,
        location_source="GPS",
        ward_number=151,
        ward_name="Koramangala",
        ward_detection_method="POINT_IN_POLYGON",
        assembly_constituency_number=172,
        assembly_constituency_name="BTM Layout",
        mla_name="Ramalinga Reddy",
        mla_party="INC",
        parliamentary_constituency_number=26,
        parliamentary_constituency_name="Bangalore South",
        mp_name="Tejasvi Surya",
        mp_party="BJP",
        address="80 Feet Road, 4th Block, Koramangala, Bengaluru",
        ward_id=wards_map.get(151).id if 151 in wards_map else None,
        incident_id=inc1.id,
        quality_score=0.95,
        status="verified",
        created_at=now - timedelta(days=2, hours=4)
    )
    db.add(rep1)
    db.flush()
    db.add(ReportMedia(report_id=rep1.id, media_url=pothole_img1, blur_score=160.0))

    # Report 2 awaiting Citizen Verification sign-off
    rep2 = Report(
        user_id=citizen_ananya.id,
        source="manual",
        raw_text="Road cavity near HSR 27th Main junction causing severe traffic slowdowns.",
        category="Pothole",
        ai_confidence=0.91,
        latitude=12.9128,
        longitude=77.6445,
        gps_accuracy=7.5,
        location_source="GPS",
        ward_number=174,
        ward_name="HSR Layout",
        ward_detection_method="POINT_IN_POLYGON",
        assembly_constituency_number=175,
        assembly_constituency_name="Bommanahalli",
        mla_name="M. Satish Reddy",
        mla_party="BJP",
        parliamentary_constituency_number=26,
        parliamentary_constituency_name="Bangalore South",
        mp_name="Tejasvi Surya",
        mp_party="BJP",
        address="27th Main, Sector 1, HSR Layout, Bengaluru",
        ward_id=wards_map.get(174).id if 174 in wards_map else None,
        incident_id=inc2.id,
        quality_score=0.92,
        status="verified",
        created_at=now - timedelta(days=4)
    )
    db.add(rep2)
    db.flush()
    db.add(ReportMedia(report_id=rep2.id, media_url=pothole_img2, blur_score=150.0))

    # Report 3 on Whitefield Road Damage
    rep3 = Report(
        user_id=citizen_rahul.id,
        source="voice",
        raw_text="Severe asphalt subsidence on Whitefield Main Road near ITPL following utility trenching.",
        category="Road Damage",
        ai_confidence=0.88,
        latitude=12.9698,
        longitude=77.7499,
        gps_accuracy=9.0,
        location_source="DEVICE_GPS",
        ward_number=85,
        ward_name="Doddanekkundi",
        ward_detection_method="POINT_IN_POLYGON",
        address="Whitefield Main Road, near ITPL, Bengaluru",
        ward_id=wards_map.get(85).id if 85 in wards_map else None,
        incident_id=inc3.id,
        quality_score=0.90,
        status="verified",
        created_at=now - timedelta(days=1, hours=10)
    )
    db.add(rep3)
    db.flush()
    db.add(ReportMedia(report_id=rep3.id, media_url=damage_img, blur_score=140.0))

    db.commit()
    db.close()
    print("Seeding completed successfully!")

if __name__ == "__main__":
    seed()
