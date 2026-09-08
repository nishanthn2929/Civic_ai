from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.core.config import settings

# SQLite configuration with thread check disabled and WAL mode enabled
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def apply_sqlite_migrations():
    """Ensure newly added columns exist in existing SQLite database tables."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    with engine.connect() as conn:
        try:
            reports_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(reports)").fetchall()}
            incidents_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(incidents)").fetchall()}

            col_defs = [
                ("gps_accuracy", "FLOAT"),
                ("location_source", "VARCHAR(50) DEFAULT 'GPS'"),
                ("ward_number", "INTEGER"),
                ("ward_name", "VARCHAR(150)"),
                ("ward_detection_method", "VARCHAR(50) DEFAULT 'POINT_IN_POLYGON'")
            ]

            for col, col_type in col_defs:
                if reports_cols and col not in reports_cols:
                    try:
                        conn.exec_driver_sql(f"ALTER TABLE reports ADD COLUMN {col} {col_type}")
                    except Exception as e:
                        print(f"[Migration] Note adding {col} to reports: {e}")

                if incidents_cols and col not in incidents_cols:
                    try:
                        conn.exec_driver_sql(f"ALTER TABLE incidents ADD COLUMN {col} {col_type}")
                    except Exception as e:
                        print(f"[Migration] Note adding {col} to incidents: {e}")
            conn.commit()
        except Exception as e:
            print(f"[Migration] Auto-migration check: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
