import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Upload, MapPin, Sparkles, AlertTriangle, CheckCircle2,
  RefreshCw, Send, ShieldAlert, Info, Layers, Check, ShieldCheck,
  Navigation, Search, Crosshair, Compass, ChevronDown, ChevronUp, Lock
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { citizenService } from '../../services/api';

// Custom Pinpoint Marker with glowing animated pulse effect
const pinpointIcon = L.divIcon({
  className: 'pinpoint-marker',
  html: `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -100%);">
      <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 14px; height: 6px; background: rgba(0,0,0,0.4); border-radius: 50%; filter: blur(1px);"></div>
      <div style="width: 30px; height: 30px; border-radius: 50% 50% 50% 0; background: linear-gradient(135deg, #10b981 0%, #059669 100%); transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.6); display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #ffffff; transform: rotate(45deg);"></div>
      </div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 34]
});

// Map Controller for smooth flyTo animations and click-to-pin events
function MapController({ center, zoom, onLocationSelect }) {
  const map = useMap();

  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom || map.getZoom(), { duration: 0.8 });
    }
  }, [center, zoom, map]);

  useMapEvents({
    click(e) {
      if (onLocationSelect) {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      }
    }
  });

  return null;
}

// Pure JavaScript client-side EXIF GPS extractor (parses JPEG APP1 marker within 2ms)
function extractClientExifGps(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.includes('jpeg') && !file.type.includes('jpg')) {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xFFD8) return resolve(null);
        let offset = 2;
        const length = view.byteLength;
        while (offset < length - 4) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          if (marker === 0xFFE1) {
            const exifLength = view.getUint16(offset, false);
            offset += 2;
            if (view.getUint32(offset, false) === 0x45786966 && view.getUint16(offset + 4, false) === 0x0000) {
              const tiffOffset = offset + 6;
              const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
              const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
              const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);
              let gpsOffset = 0;
              for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
                const tag = view.getUint16(entryOffset, littleEndian);
                if (tag === 0x8825) {
                  gpsOffset = view.getUint32(entryOffset + 8, littleEndian);
                  break;
                }
              }
              if (gpsOffset) {
                const numGpsEntries = view.getUint16(tiffOffset + gpsOffset, littleEndian);
                let latRef = 'N', lonRef = 'E', latDMS = null, lonDMS = null;
                for (let i = 0; i < numGpsEntries; i++) {
                  const entryOffset = tiffOffset + gpsOffset + 2 + i * 12;
                  const tag = view.getUint16(entryOffset, littleEndian);
                  const valOffset = view.getUint32(entryOffset + 8, littleEndian);
                  if (tag === 1) {
                    latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
                  } else if (tag === 2) {
                    const o = tiffOffset + valOffset;
                    const d = view.getUint32(o, littleEndian) / Math.max(1, view.getUint32(o + 4, littleEndian));
                    const m = view.getUint32(o + 8, littleEndian) / Math.max(1, view.getUint32(o + 12, littleEndian));
                    const s = view.getUint32(o + 16, littleEndian) / Math.max(1, view.getUint32(o + 20, littleEndian));
                    latDMS = d + (m / 60.0) + (s / 3600.0);
                  } else if (tag === 3) {
                    lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
                  } else if (tag === 4) {
                    const o = tiffOffset + valOffset;
                    const d = view.getUint32(o, littleEndian) / Math.max(1, view.getUint32(o + 4, littleEndian));
                    const m = view.getUint32(o + 8, littleEndian) / Math.max(1, view.getUint32(o + 12, littleEndian));
                    const s = view.getUint32(o + 16, littleEndian) / Math.max(1, view.getUint32(o + 20, littleEndian));
                    lonDMS = d + (m / 60.0) + (s / 3600.0);
                  }
                }
                if (latDMS !== null && lonDMS !== null) {
                  if (latRef.toUpperCase() === 'S') latDMS = -latDMS;
                  if (lonRef.toUpperCase() === 'W') lonDMS = -lonDMS;
                  return resolve({
                    latitude: Number(latDMS.toFixed(6)),
                    longitude: Number(lonDMS.toFixed(6))
                  });
                }
              }
            }
            break;
          } else if ((marker & 0xFF00) !== 0xFF00) {
            break;
          } else {
            offset += view.getUint16(offset, false);
          }
        }
      } catch (err) {
        console.warn('Client-side EXIF parse notice:', err);
      }
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

export default function ManualReportPage({ currentUser, onReportSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [category, setCategory] = useState('Pothole');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [severityReason, setSeverityReason] = useState('');

  // GPS Device & Location Validation States (Requirements 1, 2, 3, 5, 12)
  const [deviceGps, setDeviceGps] = useState(null); // { latitude, longitude, accuracy, timestamp }
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsTimestamp, setGpsTimestamp] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [locationSource, setLocationSource] = useState('GPS'); // 'GPS' | 'MANUAL'
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Photo Geotag state (never silently overwrites device GPS)
  const [photoExifGps, setPhotoExifGps] = useState(null);
  const [exifGpsDetected, setExifGpsDetected] = useState(false);

  // Coordinates for Map and Ward Resolution (Starts at live GPS or central Bengaluru fallback)
  const [latitude, setLatitude] = useState(12.9715987);
  const [longitude, setLongitude] = useState(77.5945627);
  const [address, setAddress] = useState('Acquiring live device GPS...');
  const [mapCenter, setMapCenter] = useState([12.9715987, 77.5945627]);
  const [mapZoom, setMapZoom] = useState(16);
  const [locationDetails, setLocationDetails] = useState(null);
  const [detectedOutsideGeo, setDetectedOutsideGeo] = useState(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [deviceOutsideNotice, setDeviceOutsideNotice] = useState(null);

  // Search & Loading States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const [isPreScreening, setIsPreScreening] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // Centralized coordinate update & point-in-polygon reverse-geocoding
  const updateExactCoordinates = useCallback(async (newLat, newLon, source = 'MANUAL', newZoom = null) => {
    const lat = Number(newLat);
    const lng = Number(newLon);
    setLatitude(lat);
    setLongitude(lng);
    setMapCenter([lat, lng]);
    if (newZoom) setMapZoom(newZoom);
    setLocationSource(source === 'GPS' ? 'GPS' : (source === 'DEFAULT' ? 'DEFAULT' : 'MANUAL'));
    setIsLocationConfirmed(false);
    setIsResolvingLocation(true);

    try {
      const geo = await citizenService.reverseGeocode(lat, lng);
      setLocationDetails(geo);
      if (geo.is_within_bengaluru) {
        setDetectedOutsideGeo(null);
      } else {
        setDetectedOutsideGeo({ lat, lng, geo });
      }
      if (geo.formatted_address) {
        setAddress(geo.formatted_address);
      } else if (geo.ward_name && geo.ward_name !== 'BBMP ward could not be determined.') {
        setAddress(`${geo.ward_name}, Bengaluru`);
      } else {
        setAddress(`Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
      setAddress(`Pinned (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
    } finally {
      setIsResolvingLocation(false);
    }
  }, []);

  // One-tap quick reset back to central Bengaluru
  const snapToBengaluruCentral = useCallback(() => {
    setDetectedOutsideGeo(null);
    updateExactCoordinates(12.9715987, 77.5945627, 'MANUAL', 15);
  }, [updateExactCoordinates]);

  // Fetch live browser GPS with high precision and reverse-geocode (Requirements 1 & 2)
  const handleGetLocation = useCallback(() => {
    setIsLocating(true);
    setGpsError(null);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy * 10) / 10;
          const timestamp = new Date(pos.timestamp || Date.now()).toISOString();

          setDeviceGps({ latitude: lat, longitude: lng, accuracy, timestamp });
          setGpsAccuracy(accuracy);
          setGpsTimestamp(timestamp);
          setIsLocating(false);

          try {
            const geo = await citizenService.reverseGeocode(lat, lng);
            if (geo.is_within_bengaluru) {
              // Device is physically inside BBMP boundaries
              setDeviceOutsideNotice(null);
              setDetectedOutsideGeo(null);
              setLatitude(lat);
              setLongitude(lng);
              setMapCenter([lat, lng]);
              setMapZoom(17);
              setLocationSource('GPS');
              setIsLocationConfirmed(false);
              setLocationDetails(geo);
              if (geo.formatted_address) {
                setAddress(geo.formatted_address);
              } else if (geo.ward_name && geo.ward_name !== 'BBMP ward could not be determined.') {
                setAddress(`${geo.ward_name}, Bengaluru`);
              } else {
                setAddress(`Device GPS (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
              }
            } else {
              // Device GPS is outside BBMP (e.g. testing remotely from Mumbai, Delhi, or outer region)
              // Keep map active in Central Bengaluru so the reporting workflow remains fully functional
              setDeviceOutsideNotice({
                lat,
                lng,
                accuracy,
                region_name: geo.region_name || 'Non-BBMP Area',
                formatted_address: geo.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
              });
              setLocationDetails((prev) => {
                if (!prev || !prev.is_within_bengaluru) {
                  updateExactCoordinates(12.9715987, 77.5945627, 'DEFAULT', 15);
                }
                return prev;
              });
            }
          } catch (e) {
            console.warn('Reverse geocode error for GPS:', e);
            setLocationDetails((prev) => {
              if (!prev) updateExactCoordinates(12.9715987, 77.5945627, 'DEFAULT', 15);
              return prev;
            });
          }
        },
        (err) => {
          console.warn('Location access notice: ', err.message);
          setIsLocating(false);
          let msg = 'Unable to acquire device GPS.';
          if (err.code === 1) msg = 'Location access permission was denied. Position the pin manually or use Quick Jump.';
          else if (err.code === 2) msg = 'Device GPS position unavailable. Check location services or position the pin manually.';
          else if (err.code === 3) msg = 'GPS acquisition timed out. Position the pin manually or retry.';
          setGpsError(msg);
          setLocationDetails((prev) => {
            if (!prev) updateExactCoordinates(12.9715987, 77.5945627, 'DEFAULT', 15);
            return prev;
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } else {
      setIsLocating(false);
      setGpsError('Geolocation is not supported by your browser.');
      setLocationDetails((prev) => {
        if (!prev) updateExactCoordinates(12.9715987, 77.5945627, 'DEFAULT', 15);
        return prev;
      });
    }
  }, [updateExactCoordinates]);

  // Use Current Location action: restores marker to genuine device GPS coordinates
  const handleUseCurrentLocation = useCallback(() => {
    if (deviceGps) {
      updateExactCoordinates(deviceGps.latitude, deviceGps.longitude, 'GPS', 17);
      setGpsAccuracy(deviceGps.accuracy);
      setGpsTimestamp(deviceGps.timestamp);
    } else {
      handleGetLocation();
    }
  }, [deviceGps, handleGetLocation, updateExactCoordinates]);

  // Action to intentionally move pin to outside-BBMP device GPS
  const handlePinToOutsideDeviceGps = useCallback(() => {
    if (deviceOutsideNotice) {
      updateExactCoordinates(deviceOutsideNotice.lat, deviceOutsideNotice.lng, 'GPS', 17);
      setGpsAccuracy(deviceOutsideNotice.accuracy);
    }
  }, [deviceOutsideNotice, updateExactCoordinates]);

  // Confirm location action
  const handleConfirmLocation = useCallback(() => {
    setIsLocationConfirmed(true);
  }, []);

  // Auto-resolve initial coordinates immediately on mount and query device GPS
  useEffect(() => {
    updateExactCoordinates(12.9715987, 77.5945627, 'DEFAULT', 15);
    handleGetLocation();
  }, [handleGetLocation, updateExactCoordinates]);

  // Map Drag and Click handlers (Mark source as MANUAL per Requirement 3)
  const handleMarkerDragEnd = useCallback((e) => {
    const marker = e.target;
    if (marker) {
      const pos = marker.getLatLng();
      updateExactCoordinates(pos.lat, pos.lng, 'MANUAL');
    }
  }, [updateExactCoordinates]);

  const handleMapClick = useCallback((lat, lng) => {
    updateExactCoordinates(lat, lng, 'MANUAL');
  }, [updateExactCoordinates]);

  // Street / Landmark forward search
  const handleSearchExecute = useCallback(async (queryText) => {
    const q = (queryText || searchQuery).trim();
    if (!q || q.length < 2) return;
    setIsSearching(true);
    try {
      const results = await citizenService.searchLocation(q);
      setSearchResults(results);
    } catch (err) {
      console.warn('Location search error:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleSelectSearchResult = useCallback((item) => {
    setSearchResults([]);
    setSearchQuery(item.title || item.road || '');
    updateExactCoordinates(item.latitude, item.longitude, 'MANUAL', 17);
  }, [updateExactCoordinates]);

  // Handle image selection & trigger automatic AI pre-screening + EXIF geotag inspection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setAiSuggestion(null);

    // 1. Client-side EXIF GPS check (Never silently overwrite device GPS)
    const clientGps = await extractClientExifGps(file);
    if (clientGps) {
      setPhotoExifGps(clientGps);
      setExifGpsDetected(true);
      // Only set initial map coordinates if device GPS has not been acquired
      if (!deviceGps) {
        updateExactCoordinates(clientGps.latitude, clientGps.longitude, 'MANUAL', 17);
      }
    } else {
      setPhotoExifGps(null);
      setExifGpsDetected(false);
    }

    // 2. Trigger backend AI pre-screening with defect analysis
    setIsPreScreening(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const targetLat = latitude;
      const targetLon = longitude;
      if (targetLat) formData.append('latitude', targetLat.toString());
      if (targetLon) formData.append('longitude', targetLon.toString());

      const res = await citizenService.prescreen(formData);
      setAiSuggestion(res);

      // Geotag Location Recognition from Photo EXIF
      if (res.has_exif_gps && res.resolved_latitude && res.resolved_longitude) {
        setPhotoExifGps({ latitude: res.resolved_latitude, longitude: res.resolved_longitude });
        setExifGpsDetected(true);
        if (!deviceGps && !clientGps) {
          updateExactCoordinates(res.resolved_latitude, res.resolved_longitude, 'MANUAL', 17);
        }
      }

      // Category & Severity
      if (res.detected_category) {
        setCategory(res.detected_category);
      }
      if (res.suggested_severity) {
        setSeverity(res.suggested_severity);
      }
      if (res.severity_reason) {
        setSeverityReason(res.severity_reason);
      }
    } catch (err) {
      console.warn('AI Pre-screening error:', err);
    } finally {
      setIsPreScreening(false);
    }
  };

  const handleApplyPhotoGeotag = useCallback(() => {
    if (photoExifGps) {
      updateExactCoordinates(photoExifGps.latitude, photoExifGps.longitude, 'MANUAL', 17);
    }
  }, [photoExifGps, updateExactCoordinates]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      if (gpsAccuracy !== null && gpsAccuracy !== undefined) {
        formData.append('gps_accuracy', gpsAccuracy.toString());
      }
      formData.append('location_source', locationSource === 'GPS' ? 'GPS' : 'MANUAL');
      formData.append('raw_text', description);
      formData.append('address', address);
      formData.append('severity', severity);
      if (severityReason) {
        formData.append('severity_reason', severityReason);
      }
      formData.append('source', 'manual');
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const res = await citizenService.createReport(formData);
      setSubmissionResult(res);
      if (onReportSuccess) onReportSuccess(res);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit civic report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Report a Civic Issue</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Bengaluru BBMP
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Photos are analyzed by AI to extract defect category, severity, and point-in-polygon ward routing.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isLocating}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-400 border border-emerald-500/30 transition-all disabled:opacity-50 shadow-sm"
          >
            {isLocating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Acquiring Live GPS...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 animate-pulse" />
                <span>Detect My Live GPS</span>
              </>
            )}
          </button>
        </div>
      </div>

      {submissionResult ? (
        /* Submission Success Screen */
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white">Civic Report Logged Successfully!</h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            Your report for <span className="font-semibold text-emerald-400">{submissionResult.category}</span> has been verified and processed by the Civic Intelligence Engine.
          </p>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-w-md mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Report ID:</span>
              <span className="font-mono text-white">#{submissionResult.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Civic Incident Reference:</span>
              <span className="font-mono font-bold text-emerald-400">INC-{submissionResult.incident_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">BBMP Ward:</span>
              <span className="text-white">{submissionResult.ward_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="font-semibold text-cyan-400">{submissionResult.status.toUpperCase()}</span>
            </div>
          </div>

          <div className="pt-4 flex justify-center gap-3">
            <button
              onClick={() => {
                setSubmissionResult(null);
                setSelectedFile(null);
                setPreviewUrl(null);
                setAiSuggestion(null);
                setDescription('');
              }}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
            >
              Report Another Issue
            </button>
          </div>
        </div>
      ) : (
        /* Reporting Form */
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Photo Upload & AI Scanner Box */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                1. Capture or Upload Road Evidence
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-6 text-center cursor-pointer transition-all bg-slate-950/60 group relative overflow-hidden min-h-[220px] flex flex-col items-center justify-center"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative w-full h-48 rounded-lg overflow-hidden">
                    <img src={previewUrl} alt="Evidence Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition-opacity">
                      Click to Change Photo
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-emerald-500/20 text-slate-400 group-hover:text-emerald-400 flex items-center justify-center mx-auto transition-colors">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      Take Photo or Browse Gallery
                    </div>
                    <p className="text-[10px] text-slate-500">Supports JPG, PNG with auto blur & EXIF GPS detection</p>
                  </div>
                )}
              </div>

              {/* Photo Geotag Recognition Card */}
              {exifGpsDetected && photoExifGps && (
                <div className={`border rounded-xl p-3.5 flex items-start gap-3 shadow-lg animate-in fade-in ${
                  aiSuggestion && !aiSuggestion.is_within_bengaluru
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                }`}>
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    aiSuggestion && !aiSuggestion.is_within_bengaluru ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    <MapPin className="w-5 h-5 animate-bounce" />
                  </div>
                  <div className="text-xs space-y-1.5 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          {aiSuggestion && !aiSuggestion.is_within_bengaluru ? 'Photo Geotag (Non-BBMP)' : 'Photo Geotag Detected'}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 border border-current">EXIF GPS</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyPhotoGeotag}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors shadow-sm shrink-0"
                      >
                        Apply Photo Coords
                      </button>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      Camera coordinates detected: <span className="font-mono font-semibold text-white">{photoExifGps.latitude.toFixed(6)}° N, {photoExifGps.longitude.toFixed(6)}° E</span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Live device GPS is prioritized. Click "Apply Photo Coords" only if you want to pin the issue at the photo capture spot.
                    </p>
                    {aiSuggestion && !aiSuggestion.is_within_bengaluru && (
                      <p className="text-[10px] text-amber-400/90 pt-1">
                        ⚠️ Note: This image was captured outside Bengaluru BBMP municipal boundaries.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!exifGpsDetected && selectedFile && !isPreScreening && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2 text-[11px]">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>No camera GPS tag in photo. Using your live device location ({latitude.toFixed(4)}, {longitude.toFixed(4)}).</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    className="px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 shrink-0"
                  >
                    Refresh GPS
                  </button>
                </div>
              )}

              {/* AI Pre-Screening Live Card */}
              {isPreScreening && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                  <div className="text-xs">
                    <div className="font-bold text-emerald-400">YOLO AI Analyzing Road Surface & EXIF...</div>
                    <div className="text-slate-400 text-[11px]">Evaluating road cavities, blur variance, and GIS boundaries</div>
                  </div>
                </div>
              )}

              {aiSuggestion && (
                <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 space-y-3 shadow-lg animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <Sparkles className="w-4 h-4" />
                      <span>AI Pre-Screening Suggestion</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {(aiSuggestion.confidence * 100).toFixed(0)}% Confidence
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900 p-2 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Detected Defect</span>
                      <span className="font-semibold text-white">{aiSuggestion.detected_category}</span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Suggested Severity</span>
                      <span className={`font-semibold ${
                        aiSuggestion.suggested_severity === 'HIGH' ? 'text-rose-400' : aiSuggestion.suggested_severity === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {aiSuggestion.suggested_severity}
                      </span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded-lg">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-400 text-[10px] block">BBMP Ward</span>
                        {(locationDetails?.is_within_bengaluru || aiSuggestion.is_within_bengaluru) && (locationDetails?.ward_name || (aiSuggestion.bengaluru_ward && aiSuggestion.bengaluru_ward !== 'BBMP ward could not be determined.')) ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                            {(locationDetails?.is_within_bengaluru ? locationDetails.ward_number : aiSuggestion.ward_number) ? `#${locationDetails?.is_within_bengaluru ? locationDetails.ward_number : aiSuggestion.ward_number}` : 'BBMP'}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                            Outside BBMP
                          </span>
                        )}
                      </div>
                      {(locationDetails?.is_within_bengaluru || aiSuggestion.is_within_bengaluru) && (locationDetails?.ward_name || (aiSuggestion.bengaluru_ward && aiSuggestion.bengaluru_ward !== 'BBMP ward could not be determined.')) ? (
                        <span className="font-semibold text-emerald-400 text-xs block truncate" title={locationDetails?.is_within_bengaluru ? locationDetails.ward_name : aiSuggestion.bengaluru_ward}>
                          {locationDetails?.is_within_bengaluru ? locationDetails.ward_name : aiSuggestion.bengaluru_ward}
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="font-semibold text-amber-400 text-[11px] block leading-tight" title="BBMP ward could not be determined for this location.">
                            Outside BBMP Limits
                          </span>
                          <button
                            type="button"
                            onClick={snapToBengaluruCentral}
                            className="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-medium block"
                          >
                            Snap to Central &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-900 p-2 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Laplacian Clarity</span>
                      <span className="font-semibold text-emerald-400">
                        {aiSuggestion.is_clear ? 'Clear (Sharp)' : 'Low Blur'} ({aiSuggestion.blur_score})
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Incident Details & Coordinates */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Issue Details & Ward Verification
              </label>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {error}
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Issue Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Pothole">Pothole (Road Cavity)</option>
                  <option value="Road Damage">Road Damage (Broken Asphalt)</option>
                  <option value="Road Crack">Road Crack / Fissure</option>
                  <option value="Garbage Overflow">Garbage Overflow (Solid Waste)</option>
                  <option value="Water Leakage">Water Pipeline Leakage (BWSSB)</option>
                  <option value="Open Manhole">Open Manhole / Chamber</option>
                  <option value="Broken Streetlight">Broken Streetlight (BESCOM)</option>
                  <option value="Drainage Problem">Storm Water Drainage Block</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Citizen Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Deep pothole near junction. Two wheelers skidding during evening traffic."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Severity Clarification (LOW / MEDIUM / HIGH) */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Severity Clarification
                  </label>
                  {aiSuggestion?.suggested_severity && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Suggested: {aiSuggestion.suggested_severity}
                    </span>
                  )}
                </div>

                {/* 3 Selectable Tiers */}
                <div className="grid grid-cols-3 gap-2">
                  {/* LOW */}
                  <button
                    type="button"
                    onClick={() => setSeverity('LOW')}
                    className={`p-2.5 rounded-xl border text-left transition-all relative ${
                      severity === 'LOW'
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${severity === 'LOW' ? 'text-emerald-400' : 'text-slate-300'}`}>LOW</span>
                      {severity === 'LOW' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">Minor wear, surface cracks, safe transit</p>
                    {aiSuggestion?.suggested_severity === 'LOW' && (
                      <span className="absolute -top-1.5 -right-1 text-[8px] bg-emerald-500 text-slate-950 font-bold px-1 rounded">AI</span>
                    )}
                  </button>

                  {/* MEDIUM */}
                  <button
                    type="button"
                    onClick={() => setSeverity('MEDIUM')}
                    className={`p-2.5 rounded-xl border text-left transition-all relative ${
                      severity === 'MEDIUM'
                        ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/50'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-300'}`}>MEDIUM</span>
                      {severity === 'MEDIUM' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">Moderate cavity, rim impact risk</p>
                    {aiSuggestion?.suggested_severity === 'MEDIUM' && (
                      <span className="absolute -top-1.5 -right-1 text-[8px] bg-amber-500 text-slate-950 font-bold px-1 rounded">AI</span>
                    )}
                  </button>

                  {/* HIGH */}
                  <button
                    type="button"
                    onClick={() => setSeverity('HIGH')}
                    className={`p-2.5 rounded-xl border text-left transition-all relative ${
                      severity === 'HIGH'
                        ? 'bg-rose-950/40 border-rose-500 shadow-md shadow-rose-950/50'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${severity === 'HIGH' ? 'text-rose-400' : 'text-slate-300'}`}>HIGH</span>
                      {severity === 'HIGH' && <Check className="w-3.5 h-3.5 text-rose-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">Deep crater, two-wheeler fall risk</p>
                    {aiSuggestion?.suggested_severity === 'HIGH' && (
                      <span className="absolute -top-1.5 -right-1 text-[8px] bg-rose-500 text-slate-950 font-bold px-1 rounded">AI</span>
                    )}
                  </button>
                </div>

                {/* Explainable Rationale Box */}
                {(severityReason || aiSuggestion?.severity_reason) && (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Severity Assessment & Rationale:</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {severityReason || aiSuggestion?.severity_reason}
                    </p>
                    {aiSuggestion?.severity_factors && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-900 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                          Cavity Area: <strong className="text-emerald-400">{aiSuggestion.severity_factors.defect_area_pct}%</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                          Target Action: <strong className="text-cyan-400">{aiSuggestion.severity_factors.recommended_action}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Exact Defect Location, Interactive Leaflet Map, GPS Accuracy & Controls */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      3. Device GPS & Ward Verification
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isLocationConfirmed && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Location Confirmed</span>
                      </span>
                    )}
                    {/* Source Badge */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                      locationSource === 'GPS'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {locationSource === 'GPS' ? '📍 Device GPS' : '🎯 Manual Pin'}
                    </span>
                  </div>
                </div>

                {/* GPS Accuracy Validation & Location Status Banners (Requirements 1 & 2) */}
                {isLocating && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-300 animate-pulse">
                    <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                    <div>
                      <div className="font-bold">Acquiring High-Precision Device GPS...</div>
                      <div className="text-[11px] text-slate-400">Requesting satellite coordinates from your device's browser Geolocation API</div>
                    </div>
                  </div>
                )}

                {gpsError && !isLocating && (
                  <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-rose-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">GPS Location Notice</div>
                        <p className="text-slate-300 text-[11px] mt-0.5">{gpsError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      className="px-2.5 py-1 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg shrink-0 transition-colors"
                    >
                      Retry GPS
                    </button>
                  </div>
                )}

                {!isLocating && locationSource === 'GPS' && gpsAccuracy !== null && (
                  <>
                    {/* Tier 1: High Accuracy (<= 20m) */}
                    {gpsAccuracy <= 20 && (
                      <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-emerald-300 shadow-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            <strong className="font-mono">📍 GPS Accuracy: {gpsAccuracy}m</strong> • ✓ High accuracy location detected (&le; 20m)
                          </span>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                          Accepted
                        </span>
                      </div>
                    )}

                    {/* Tier 2: Moderate Accuracy (20 - 50m) */}
                    {gpsAccuracy > 20 && gpsAccuracy <= 50 && (
                      <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-amber-300 shadow-sm">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            <strong className="font-mono">⚠️ GPS Accuracy: {gpsAccuracy}m</strong> • Moderate accuracy (20–50m). You can drag the pin on the map for better precision.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 shrink-0 transition-colors"
                        >
                          Retry High-Acc
                        </button>
                      </div>
                    )}

                    {/* Tier 3: Low Accuracy (> 50m) */}
                    {gpsAccuracy > 50 && (
                      <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-rose-300 shadow-sm">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">⚠️ GPS accuracy is currently {gpsAccuracy}m (&gt; 50m)</div>
                            <p className="text-slate-300 text-[11px] mt-0.5">
                              Please enable precise/high-accuracy location on your device and retry, or position the pin manually on the map.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold rounded-lg text-xs shrink-0 transition-colors shadow"
                        >
                          Enable High-Acc & Retry
                        </button>
                      </div>
                    )}
                  </>
                )}

                {locationSource === 'MANUAL' && (
                  <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-cyan-300 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>
                        <strong>🎯 Manual Pin Position</strong> • Exact coordinates ({latitude.toFixed(6)}, {longitude.toFixed(6)})
                      </span>
                    </div>
                    {deviceGps && (
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        className="text-[10px] font-semibold px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 shrink-0 transition-colors"
                      >
                        Reset to Device GPS
                      </button>
                    )}
                  </div>
                )}

                {/* Location Controls Row (Requirements 1, 2 & 5) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isLocating}
                      title="Request fresh device coordinates using Geolocation API"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-emerald-400' : ''}`} />
                      <span>Refresh GPS</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      title="Reset marker to genuine device GPS coordinates"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Use Current Location</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmLocation}
                      title="Validate and confirm location before submitting"
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow ${
                        isLocationConfirmed
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isLocationConfirmed ? 'Location Confirmed ✓' : 'Confirm Location'}</span>
                    </button>
                  </div>
                </div>

                {/* Street / Landmark Search Bar */}
                <div className="relative">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          if (e.target.value.length >= 3) {
                            handleSearchExecute(e.target.value);
                          } else {
                            setSearchResults([]);
                          }
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchExecute())}
                        placeholder="Search road, junction, or landmark (e.g., 100ft Rd Indiranagar)..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      {isSearching && (
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin absolute right-2.5 top-2.5" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearchExecute()}
                      disabled={isSearching}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 shrink-0 transition-colors"
                    >
                      Search
                    </button>
                  </div>

                  {/* Autocomplete Search Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute z-[1000] top-full mt-1.5 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 max-h-52 overflow-y-auto">
                      {searchResults.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSearchResult(item)}
                          className="w-full text-left p-2.5 hover:bg-emerald-500/10 transition-colors flex items-start gap-2.5"
                        >
                          <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                            <div className="text-[10px] text-slate-400 truncate">{item.display_name}</div>
                            {item.ward_name && (
                              <span className="inline-block mt-0.5 text-[9px] font-mono bg-slate-800 text-emerald-300 px-1.5 py-0.2 rounded">
                                {item.ward_name} {item.zone_name ? `(${item.zone_name} Zone)` : ''}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick-Jump Locality Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold">Quick Jump:</span>
                  {[
                    { name: 'Koramangala', lat: 12.9352, lon: 77.6245 },
                    { name: 'Indiranagar', lat: 12.9784, lon: 77.6408 },
                    { name: 'Whitefield', lat: 12.9698, lon: 77.7500 },
                    { name: 'HSR Layout', lat: 12.9120, lon: 77.6450 },
                    { name: 'MG Road', lat: 12.9716, lon: 77.5946 },
                    { name: 'Jayanagar', lat: 12.9308, lon: 77.5838 },
                    { name: 'Malleshwaram', lat: 13.0031, lon: 77.5643 },
                    { name: 'Electronic City', lat: 12.8800, lon: 77.6528 },
                    { name: 'Hebbal', lat: 13.0358, lon: 77.5970 },
                  ].map((loc) => (
                    <button
                      key={loc.name}
                      type="button"
                      onClick={() => {
                        setDetectedOutsideGeo(null);
                        updateExactCoordinates(loc.lat, loc.lon, 'MANUAL', 16);
                      }}
                      className="px-2 py-0.5 rounded-md bg-slate-950 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 text-[10px] border border-slate-800 hover:border-emerald-500/30 transition-colors"
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>

                {/* Device Outside Notice Banner */}
                {deviceOutsideNotice && locationDetails?.is_within_bengaluru && (
                  <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-sm">
                    <div className="flex items-start gap-2">
                      <Crosshair className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-blue-300">Live Device GPS: {deviceOutsideNotice.region_name}</span>
                        <p className="text-[11px] text-slate-300">
                          Your browser GPS is located outside BBMP municipal boundaries. The map pin is kept at Central Bengaluru (<strong>Ward #111 Shantala Nagar</strong>) for reporting civic defects.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={handlePinToOutsideDeviceGps}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700 font-medium transition-colors"
                      >
                        Pin to My GPS ({deviceOutsideNotice.region_name.split(',')[0]})
                      </button>
                    </div>
                  </div>
                )}

                {/* Embedded Interactive Leaflet Pinpoint Map */}
                <div className="relative rounded-xl overflow-hidden border border-slate-800 h-64 bg-slate-950 shadow-inner">
                  <MapContainer
                    center={mapCenter}
                    zoom={mapZoom}
                    scrollWheelZoom={true}
                    className="w-full h-full z-0"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                    <MapController
                      center={mapCenter}
                      zoom={mapZoom}
                      onLocationSelect={handleMapClick}
                    />
                    {locationDetails?.geometry && (
                      <GeoJSON
                        key={`ward-${locationDetails.ward_number || 'geo'}`}
                        data={locationDetails.geometry}
                        style={{
                          color: '#10b981',
                          weight: 2,
                          fillColor: '#10b981',
                          fillOpacity: 0.12
                        }}
                      />
                    )}
                    <Marker
                      position={[latitude, longitude]}
                      draggable={true}
                      eventHandlers={{
                        dragend: handleMarkerDragEnd
                      }}
                      icon={pinpointIcon}
                    />
                  </MapContainer>

                  {/* Top Map Helper Overlay */}
                  <div className="absolute top-2 left-2 right-2 pointer-events-none z-[400] flex justify-between items-center gap-2">
                    <span className="bg-slate-950/85 backdrop-blur text-[10px] text-slate-200 px-2.5 py-1 rounded-md border border-slate-800 shadow flex items-center gap-1.5">
                      <Crosshair className="w-3 h-3 text-emerald-400" />
                      <span>Drag pin or click map to fine-tune exact defect spot</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={snapToBengaluruCentral}
                        className="pointer-events-auto bg-slate-950/90 hover:bg-emerald-500 hover:text-slate-950 text-[10px] text-emerald-400 px-2 py-1 rounded-md border border-slate-700 shadow font-semibold transition-colors flex items-center gap-1"
                        title="Reset map center to Bengaluru Central"
                      >
                        <Compass className="w-3 h-3" />
                        <span>Central</span>
                      </button>
                      <span className="bg-slate-950/85 backdrop-blur font-mono text-[10px] text-emerald-400 px-2 py-1 rounded-md border border-slate-800 shadow shrink-0">
                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resolved Exact Street Address & Ward Jurisdiction (Requirements 4 & 9) */}
                <div className="space-y-2">
                  {isResolvingLocation || isLocating ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                      <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                      <span className="text-xs text-slate-300">Resolving BBMP ward jurisdiction...</span>
                    </div>
                  ) : locationDetails?.is_within_bengaluru ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>BBMP Ward Jurisdiction (Point-in-Polygon):</span>
                        </span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                          {locationDetails.ward_number ? `Ward #${locationDetails.ward_number}` : 'BBMP Ward'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <div className="text-sm font-bold text-white">
                          {locationDetails.ward_name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {locationDetails.zone_name ? `${locationDetails.zone_name} Zone` : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-950/40 border border-rose-500/50 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>BBMP ward could not be determined for this location.</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        The pin ({latitude.toFixed(6)}, {longitude.toFixed(6)}) lies outside BBMP municipal ward boundaries ({locationDetails?.region_name || 'Non-BBMP Area'}).
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={snapToBengaluruCentral}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Snap Pin to Bengaluru Central</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700"
                        >
                          Retry Device GPS
                        </button>
                      </div>
                    </div>
                  )}

                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 100 Feet Rd, near Sony World Signal, 4th Block, Koramangala"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Lat / Lon Numerical Precise Controls */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">LAT:</span>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) updateExactCoordinates(val, longitude, 'MANUAL');
                      }}
                      className="bg-transparent text-right font-mono text-emerald-400 w-28 focus:outline-none text-xs"
                    />
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">LON:</span>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) updateExactCoordinates(latitude, val, 'MANUAL');
                      }}
                      className="bg-transparent text-right font-mono text-emerald-400 w-28 focus:outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Developer / GIS Debug Panel (Requirement 12) */}
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                  <button
                    type="button"
                    onClick={() => setShowDebugPanel(!showDebugPanel)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-bold text-slate-400 hover:text-emerald-400 hover:bg-slate-900/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span>DEVELOPER / GIS DEBUG PANEL (REQ 12)</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-sans flex items-center gap-1">
                      {showDebugPanel ? (
                        <><span>Hide</span><ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <><span>Inspect Raw GPS & GIS Data</span><ChevronDown className="w-3 h-3" /></>
                      )}
                    </span>
                  </button>

                  {showDebugPanel && (
                    <div className="p-4 border-t border-slate-800/80 bg-black/40 space-y-3 text-xs font-mono">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Raw GPS Coordinates */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Raw Device GPS Coordinates</div>
                          <div className="text-emerald-400 font-bold">
                            LAT: <span className="text-white">{deviceGps ? deviceGps.latitude : latitude}</span>
                          </div>
                          <div className="text-emerald-400 font-bold">
                            LON: <span className="text-white">{deviceGps ? deviceGps.longitude : longitude}</span>
                          </div>
                        </div>

                        {/* GPS Accuracy & Timestamp */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">GPS Accuracy & Timestamp</div>
                          <div className="text-cyan-400">
                            Accuracy: <span className="text-white font-bold">{gpsAccuracy !== null ? `${gpsAccuracy} meters` : 'N/A'}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] truncate">
                            Timestamp: <span className="text-slate-200">{gpsTimestamp || 'N/A'}</span>
                          </div>
                        </div>

                        {/* CRS & Dataset Source */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">CRS & Dataset Source</div>
                          <div className="text-purple-400">
                            CRS: <span className="text-white font-bold">{locationDetails?.crs || 'EPSG:4326 (WGS84)'}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] truncate">
                            Source: <span className="text-slate-200">{locationDetails?.dataset_source || 'BBMP GIS Cell / Govt of Karnataka'}</span>
                          </div>
                        </div>

                        {/* Point-in-Polygon & Method */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Point-in-Polygon Result</div>
                          <div className={locationDetails?.is_within_bengaluru ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            Status: {locationDetails?.is_within_bengaluru ? 'INSIDE BBMP (Point matched)' : 'OUTSIDE BBMP'}
                          </div>
                          <div className="text-slate-400 text-[10px]">
                            Method: <span className="text-amber-400 font-bold">{locationDetails?.ward_detection_method || (locationDetails?.is_within_bengaluru ? 'POINT_IN_POLYGON' : 'OUTSIDE_BBMP')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Selected Ward Polygon Details */}
                      <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Selected Ward Boundary Polygon</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                          <div>
                            <span className="text-slate-500">Ward Number: </span>
                            <span className="text-white font-bold">{locationDetails?.ward_number ?? 'None'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Ward Name: </span>
                            <span className="text-white font-bold truncate block">{locationDetails?.ward_name || 'BBMP ward could not be determined for this location.'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Location Source: </span>
                            <span className="text-cyan-400 font-bold">{locationSource}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Geometry Type: </span>
                            <span className="text-emerald-400 font-bold">{locationDetails?.geometry?.type || (locationDetails?.is_within_bengaluru ? 'Polygon' : 'None')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying & Merging Incident...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Confirm & Submit Civic Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
