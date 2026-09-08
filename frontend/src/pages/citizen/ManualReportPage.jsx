import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, MapPin, Sparkles, AlertTriangle, CheckCircle2, RefreshCw, Send, ShieldAlert, Info, Layers, Check, ShieldCheck, Navigation, Search, Crosshair, Compass } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
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
  const [exifGpsDetected, setExifGpsDetected] = useState(false);
  const [locationSource, setLocationSource] = useState('DEVICE_GPS'); // 'DEVICE_GPS' | 'PHOTO_EXIF' | 'MANUAL'
  const [isLocating, setIsLocating] = useState(false);
  
  // Coordinates start at null/default and auto-detect from browser GPS
  const [latitude, setLatitude] = useState(12.9352);
  const [longitude, setLongitude] = useState(77.6245);
  const [address, setAddress] = useState('Detecting current location...');
  const [mapCenter, setMapCenter] = useState([12.9352, 77.6245]);
  const [mapZoom, setMapZoom] = useState(15);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationDetails, setLocationDetails] = useState(null);
  const [detectedOutsideGeo, setDetectedOutsideGeo] = useState(null);
  
  const [isPreScreening, setIsPreScreening] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // Centralized coordinate update & reverse-geocoding
  const updateExactCoordinates = useCallback(async (newLat, newLon, source = 'PIN_DRAGGED', newZoom = null) => {
    const lat = Number(Number(newLat).toFixed(6));
    const lng = Number(Number(newLon).toFixed(6));
    setLatitude(lat);
    setLongitude(lng);
    setMapCenter([lat, lng]);
    if (newZoom) setMapZoom(newZoom);
    setLocationSource(source);

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
      } else if (geo.ward_name) {
        setAddress(`${geo.ward_name}, Bengaluru`);
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
      setAddress(`Pinned (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    }
  }, []);

  // One-tap quick reset back to central Bengaluru
  const snapToBengaluruCentral = useCallback(() => {
    setDetectedOutsideGeo(null);
    updateExactCoordinates(12.9716, 77.5946, 'BENGALURU_RESET', 15);
  }, [updateExactCoordinates]);

  // Fetch live browser GPS with high precision and reverse-geocode
  const handleGetLocation = useCallback(() => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const accuracy = Math.round(pos.coords.accuracy);
          setGpsAccuracy(accuracy);
          setIsLocating(false);
          setExifGpsDetected(false);

          try {
            const geo = await citizenService.reverseGeocode(lat, lng);
            setLocationDetails(geo);
            if (!geo.is_within_bengaluru) {
              // Device or Wi-Fi IP is outside Bengaluru (e.g. Tamil Nadu)
              setDetectedOutsideGeo({ lat, lng, geo });
            } else {
              setDetectedOutsideGeo(null);
            }
            if (geo.formatted_address) {
              setAddress(geo.formatted_address);
            } else if (geo.ward_name) {
              setAddress(`${geo.ward_name}, Bengaluru`);
            }
            setLatitude(lat);
            setLongitude(lng);
            setMapCenter([lat, lng]);
            setMapZoom(17);
            setLocationSource('DEVICE_GPS');
          } catch (e) {
            updateExactCoordinates(lat, lng, 'DEVICE_GPS', 17);
          }
        },
        (err) => {
          console.log('Location access notice: ', err.message);
          setIsLocating(false);
          if (address === 'Detecting current location...') {
            setAddress('Bengaluru Urban (Tap map or search street name)');
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setIsLocating(false);
    }
  }, [updateExactCoordinates, address]);

  // Auto-fetch real device GPS coordinates on page load
  useEffect(() => {
    handleGetLocation();
  }, [handleGetLocation]);

  // Map Drag and Click handlers
  const handleMarkerDragEnd = useCallback((e) => {
    const marker = e.target;
    if (marker) {
      const pos = marker.getLatLng();
      updateExactCoordinates(pos.lat, pos.lng, 'PIN_DRAGGED');
    }
  }, [updateExactCoordinates]);

  const handleMapClick = useCallback((lat, lng) => {
    updateExactCoordinates(lat, lng, 'PIN_CLICKED');
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
    updateExactCoordinates(item.latitude, item.longitude, 'ADDRESS_SEARCH', 17);
  }, [updateExactCoordinates]);

  // Handle image selection & trigger automatic AI pre-screening + EXIF geotag parsing
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setAiSuggestion(null);

    // 1. Instant client-side EXIF GPS check
    const clientGps = await extractClientExifGps(file);
    if (clientGps) {
      setExifGpsDetected(true);
      updateExactCoordinates(clientGps.latitude, clientGps.longitude, 'PHOTO_EXIF', 17);
    }

    // 2. Trigger backend AI pre-screening with EXIF parsing & defect analysis
    setIsPreScreening(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const targetLat = clientGps ? clientGps.latitude : latitude;
      const targetLon = clientGps ? clientGps.longitude : longitude;
      if (targetLat) formData.append('latitude', targetLat.toString());
      if (targetLon) formData.append('longitude', targetLon.toString());

      const res = await citizenService.prescreen(formData);
      setAiSuggestion(res);

      // Geotag Location Recognition from Photo EXIF
      if (res.has_exif_gps && res.resolved_latitude && res.resolved_longitude) {
        setExifGpsDetected(true);
        updateExactCoordinates(res.resolved_latitude, res.resolved_longitude, 'PHOTO_EXIF', 17);
      } else if (!clientGps) {
        setExifGpsDetected(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
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
              {exifGpsDetected && (
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
                  <div className="text-xs space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {aiSuggestion && !aiSuggestion.is_within_bengaluru ? 'Photo Geotag (Non-Bengaluru)' : 'Photo Geotag Recognized'}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 border border-current">EXIF GPS</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      Camera coordinates detected: <span className="font-mono font-semibold text-white">{latitude.toFixed(4)}° N, {longitude.toFixed(4)}° E</span>
                    </p>
                    <p className="text-[11px] font-medium text-slate-200">
                      Location: {address}
                    </p>
                    {aiSuggestion && !aiSuggestion.is_within_bengaluru && (
                      <p className="text-[10px] text-amber-400/90 pt-1">
                        ⚠️ Note: This image was captured outside Bengaluru BBMP municipal boundaries ({aiSuggestion.bengaluru_ward}).
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
                      <span className="text-slate-400 text-[10px] block">BBMP Ward</span>
                      <span className="font-semibold text-white truncate block">{aiSuggestion.bengaluru_ward}</span>
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

              {/* Exact Defect Location, Interactive Leaflet Map & Search */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      3. Exact Defect Location & Map Pin
                    </label>
                  </div>
                  {/* Source Badge */}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    locationSource === 'PHOTO_EXIF'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : locationSource === 'DEVICE_GPS'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      : locationSource === 'ADDRESS_SEARCH'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {locationSource === 'PHOTO_EXIF' && '📷 Photo EXIF'}
                    {locationSource === 'DEVICE_GPS' && `📍 Live GPS ${gpsAccuracy ? `(±${gpsAccuracy}m)` : ''}`}
                    {locationSource === 'ADDRESS_SEARCH' && '🔍 Address Search'}
                    {locationSource === 'PIN_DRAGGED' && '🎯 Exact Pin Placed'}
                    {locationSource === 'PIN_CLICKED' && '🎯 Map Clicked'}
                    {locationSource === 'MANUAL_COORDINATES' && '🔢 Manual Input'}
                  </span>
                </div>

                {/* Detected Outside State Banner */}
                {detectedOutsideGeo && (
                  <div className="bg-amber-950/70 border border-amber-500/50 rounded-xl p-3 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Device / IP Location: {detectedOutsideGeo.geo.region_name || 'Outside Bengaluru'}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Your device or Wi-Fi provider reported a location outside Bengaluru municipal limits ({detectedOutsideGeo.geo.region_name || 'Tamil Nadu'}).
                      Are you reporting an issue for Bengaluru?
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
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
                        onClick={() => setDetectedOutsideGeo(null)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700"
                      >
                        Keep Detected Spot
                      </button>
                    </div>
                  </div>
                )}

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
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isLocating}
                      title="Force fresh high-precision GPS lock"
                      className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 shrink-0 transition-colors"
                    >
                      {isLocating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
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

                {/* Quick-Jump Locality Pills for Instant Bengaluru Navigation */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold">Quick Jump:</span>
                  {[
                    { name: 'Kanakapura', lat: 12.5460, lon: 77.4190 },
                    { name: 'Kanakapura Rd', lat: 12.8617, lon: 77.5303 },
                    { name: 'Koramangala', lat: 12.9352, lon: 77.6245 },
                    { name: 'Indiranagar', lat: 12.9784, lon: 77.6408 },
                    { name: 'Whitefield', lat: 12.9698, lon: 77.7500 },
                    { name: 'HSR Layout', lat: 12.9120, lon: 77.6450 },
                    { name: 'Electronic City', lat: 12.8452, lon: 77.6602 },
                    { name: 'Jayanagar', lat: 12.9308, lon: 77.5838 },
                    { name: 'MG Road', lat: 12.9716, lon: 77.5946 },
                    { name: 'Malleshwaram', lat: 13.0031, lon: 77.5643 },
                    { name: 'Hebbal', lat: 13.0358, lon: 77.5970 },
                  ].map((loc) => (
                    <button
                      key={loc.name}
                      type="button"
                      onClick={() => {
                        setDetectedOutsideGeo(null);
                        updateExactCoordinates(loc.lat, loc.lon, 'QUICK_LOCALITY_PICK', 16);
                      }}
                      className="px-2 py-0.5 rounded-md bg-slate-950 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 text-[10px] border border-slate-800 hover:border-emerald-500/30 transition-colors"
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>

                {/* Embedded Interactive Leaflet Pinpoint Map */}
                <div className="relative rounded-xl overflow-hidden border border-slate-800 h-56 bg-slate-950 shadow-inner">
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
                      <span>Drag pin or click road for exact meter position</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={snapToBengaluruCentral}
                        className="pointer-events-auto bg-slate-950/90 hover:bg-emerald-500 hover:text-slate-950 text-[10px] text-emerald-400 px-2 py-1 rounded-md border border-slate-700 shadow font-semibold transition-colors flex items-center gap-1"
                        title="Reset map center to Bengaluru Central"
                      >
                        <Compass className="w-3 h-3" />
                        <span>Bengaluru</span>
                      </button>
                      <span className="bg-slate-950/85 backdrop-blur font-mono text-[10px] text-emerald-400 px-2 py-1 rounded-md border border-slate-800 shadow shrink-0">
                        {latitude.toFixed(5)}, {longitude.toFixed(5)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resolved Exact Street Address & Ward Jurisdiction */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Exact Resolved Address & Landmark:</span>
                    {locationDetails?.ward_name && (
                      <span className="text-emerald-400 font-medium">
                        {locationDetails.ward_name} {locationDetails.ward_number ? `(#${locationDetails.ward_number})` : ''}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 100 Feet Rd, near Sony World Signal, 4th Block, Koramangala"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {locationDetails && !locationDetails.is_within_bengaluru && (
                    <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>Note: Pin is in {locationDetails.region_name || 'Outside BBMP'}. Report will be tagged under regional jurisdiction.</span>
                    </div>
                  )}
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
                        if (!isNaN(val)) updateExactCoordinates(val, longitude, 'MANUAL_COORDINATES');
                      }}
                      className="bg-transparent text-right font-mono text-emerald-400 w-24 focus:outline-none text-xs"
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
                        if (!isNaN(val)) updateExactCoordinates(latitude, val, 'MANUAL_COORDINATES');
                      }}
                      className="bg-transparent text-right font-mono text-emerald-400 w-24 focus:outline-none text-xs"
                    />
                  </div>
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
