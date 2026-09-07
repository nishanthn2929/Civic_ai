import io
from typing import Optional, Dict, Any, Tuple
from PIL import Image, ExifTags

try:
    import exifread
    HAS_EXIFREAD = True
except ImportError:
    HAS_EXIFREAD = False

class ExifMetadataService:
    """Extracts geospatial and capture metadata from image EXIF headers using multi-engine fallbacks."""

    @staticmethod
    def _ratio_to_float(val) -> float:
        try:
            if hasattr(val, 'num') and hasattr(val, 'den'):
                return float(val.num) / float(val.den) if val.den != 0 else 0.0
            return float(val)
        except Exception:
            return 0.0

    @classmethod
    def _parse_with_exifread(cls, image_bytes: bytes) -> Optional[Dict[str, Any]]:
        """Primary parser using pure-Python exifread engine."""
        if not HAS_EXIFREAD:
            return None
        try:
            tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
            if 'GPS GPSLatitude' in tags and 'GPS GPSLongitude' in tags:
                lat_vals = tags['GPS GPSLatitude'].values
                lat_ref = str(tags.get('GPS GPSLatitudeRef', 'N')).strip().upper()
                lon_vals = tags['GPS GPSLongitude'].values
                lon_ref = str(tags.get('GPS GPSLongitudeRef', 'E')).strip().upper()

                if len(lat_vals) >= 3 and len(lon_vals) >= 3:
                    lat = cls._ratio_to_float(lat_vals[0]) + (cls._ratio_to_float(lat_vals[1]) / 60.0) + (cls._ratio_to_float(lat_vals[2]) / 3600.0)
                    lon = cls._ratio_to_float(lon_vals[0]) + (cls._ratio_to_float(lon_vals[1]) / 60.0) + (cls._ratio_to_float(lon_vals[2]) / 3600.0)

                    if 'S' in lat_ref:
                        lat = -lat
                    if 'W' in lon_ref:
                        lon = -lon

                    dt = str(tags.get('EXIF DateTimeOriginal') or tags.get('Image DateTime') or '')
                    if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                        return {
                            "has_gps": True,
                            "latitude": round(lat, 6),
                            "longitude": round(lon, 6),
                            "source": "EXIF_PHOTO_GEOTAG",
                            "capture_datetime": dt or None
                        }
        except Exception as e:
            print(f"[ExifRead Engine Warning] {e}")
        return None

    @classmethod
    def _dms_to_dd(cls, dms, ref) -> Optional[float]:
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

            # Handle bytes or string ref
            ref_str = ref.decode("utf-8", errors="ignore") if isinstance(ref, bytes) else str(ref)
            if ref_str.strip().upper() in ["S", "W"]:
                dd = -dd
            return dd
        except Exception:
            return None

    @classmethod
    def extract_image_metadata(cls, image_bytes: bytes) -> Dict[str, Any]:
        """
        Inspect image EXIF tags for GPS coordinates and timestamp.
        Runs exifread engine first, with seamless fallback to Pillow IFD/legacy parsers.
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

        # 1. Attempt exifread engine
        exifread_res = cls._parse_with_exifread(image_bytes)
        if exifread_res and exifread_res.get("has_gps"):
            return exifread_res

        # 2. Attempt Pillow engine fallback
        try:
            img = Image.open(io.BytesIO(image_bytes))
            exif = img.getexif()
            if not exif:
                return result

            # Capture Date & Time (DateTimeOriginal 36867 or DateTime 306)
            date_time = exif.get(36867) or exif.get(306)
            if date_time:
                result["capture_datetime"] = str(date_time)

            # GPS IFD Extraction
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
            lat_ref = gps_ifd.get(ExifTags.GPS.GPSLatitudeRef, gps_ifd.get(1, "N"))
            lat_dms = gps_ifd.get(ExifTags.GPS.GPSLatitude, gps_ifd.get(2))
            lon_ref = gps_ifd.get(ExifTags.GPS.GPSLongitudeRef, gps_ifd.get(3, "E"))
            lon_dms = gps_ifd.get(ExifTags.GPS.GPSLongitude, gps_ifd.get(4))

            lat = cls._dms_to_dd(lat_dms, lat_ref)
            lon = cls._dms_to_dd(lon_dms, lon_ref)

            if lat is not None and lon is not None:
                if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                    result["has_gps"] = True
                    result["latitude"] = round(lat, 6)
                    result["longitude"] = round(lon, 6)
                    result["source"] = "EXIF_PHOTO_GEOTAG"
        except Exception as e:
            print(f"[Pillow Exif Fallback Warning] {e}")

        return result

exif_service = ExifMetadataService()
