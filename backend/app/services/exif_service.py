import io
from typing import Optional, Dict, Any, Tuple
from PIL import Image, ExifTags

class ExifMetadataService:
    """Extracts geospatial and capture metadata from image EXIF headers."""

    @staticmethod
    def _dms_to_dd(dms, ref: str) -> Optional[float]:
        """Convert degrees/minutes/seconds to decimal degrees."""
        if dms is None:
            return None
        try:
            if isinstance(dms, (tuple, list)):
                d = float(dms[0])
                m = float(dms[1]) if len(dms) > 1 else 0.0
                s = float(dms[2]) if len(dms) > 2 else 0.0
                dd = d + (m / 60.0) + (s / 3600.0)
            elif isinstance(dms, (int, float)):
                dd = float(dms)
            else:
                return None

            if str(ref).strip().upper() in ["S", "W"]:
                dd = -dd
            return dd
        except Exception:
            return None

    @classmethod
    def extract_image_metadata(cls, image_bytes: bytes) -> Dict[str, Any]:
        """
        Inspect image EXIF tags for GPS coordinates and timestamp.
        """
        result = {
            "has_gps": False,
            "latitude": None,
            "longitude": None,
            "source": None,
            "capture_datetime": None
        }

        if not image_bytes:
            return result

        try:
            img = Image.open(io.BytesIO(image_bytes))
            exif = img.getexif()
            if not exif:
                return result

            # 1. Capture Date & Time (DateTimeOriginal 36867 or DateTime 306)
            date_time = exif.get(36867) or exif.get(306)
            if date_time:
                result["capture_datetime"] = str(date_time)

            # 2. GPS IFD Extraction
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            if not gps_ifd and hasattr(img, "_getexif"):
                legacy = img._getexif()
                if legacy and 34853 in legacy:  # 34853 is GPSInfo
                    gps_ifd = legacy[34853]

            if not gps_ifd:
                return result

            # GPS Tag IDs:
            # 1: GPSLatitudeRef ('N' or 'S')
            # 2: GPSLatitude ((deg, 1), (min, 1), (sec, 1))
            # 3: GPSLongitudeRef ('E' or 'W')
            # 4: GPSLongitude ((deg, 1), (min, 1), (sec, 1))
            lat_ref = gps_ifd.get(ExifTags.GPS.GPSLatitudeRef, "N")
            lat_dms = gps_ifd.get(ExifTags.GPS.GPSLatitude)
            lon_ref = gps_ifd.get(ExifTags.GPS.GPSLongitudeRef, "E")
            lon_dms = gps_ifd.get(ExifTags.GPS.GPSLongitude)

            lat = cls._dms_to_dd(lat_dms, lat_ref)
            lon = cls._dms_to_dd(lon_dms, lon_ref)

            if lat is not None and lon is not None:
                # Planetary coordinate bounds check
                if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                    result["has_gps"] = True
                    result["latitude"] = round(lat, 6)
                    result["longitude"] = round(lon, 6)
                    result["source"] = "EXIF_PHOTO_GEOTAG"
        except Exception as e:
            print(f"[ExifService Warning] Could not parse EXIF: {e}")

        return result

exif_service = ExifMetadataService()
