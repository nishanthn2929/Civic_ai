from typing import Optional
from sqlalchemy.orm import Session
from backend.app.models.models import Department

class DepartmentRoutingService:
    # Mapping of civic category to municipal department code
    CATEGORY_TO_DEPT_CODE = {
        "Pothole": "BBMP_ROADS",
        "Road Damage": "BBMP_ROADS",
        "Road Crack": "BBMP_ROADS",
        "Garbage Overflow": "BBMP_SWM",
        "Illegal Dumping": "BBMP_SWM",
        "Water Leakage": "BWSSB",
        "Open Manhole": "BWSSB",
        "Drainage Problem": "BBMP_SWD",
        "Broken Streetlight": "BESCOM"
    }

    @classmethod
    def get_department_for_category(cls, db: Session, category: str) -> Optional[Department]:
        dept_code = cls.CATEGORY_TO_DEPT_CODE.get(category, "BBMP_ROADS")
        dept = db.query(Department).filter(Department.code == dept_code).first()
        if not dept:
            # Fallback to first available department
            dept = db.query(Department).first()
        return dept

routing_service = DepartmentRoutingService()
