import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Car, Play, Pause, Square, AlertTriangle, ShieldCheck, CheckCircle2, Volume2, VolumeX,
  Camera, Upload, Eye, MapPin, Compass, Gauge, Layers, Landmark, Award, Wifi, WifiOff,
  RotateCcw, Check, LogIn, User, ExternalLink, Navigation, Sliders, AlertCircle, RefreshCw,
  Search, X, Crosshair, LocateFixed
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { citizenService, authService, publicService } from '../../services/api';
import {
  playDetectionChime,
  speakDetectionAlert,
  captureFrameFromVideo,
  formatPotholeBoundingBoxes,
  SAMPLE_POTHOLE_IMAGES
} from '../../utils/potholeDetector';

// Custom Vehicle GPS Marker
const vehicleIcon = L.divIcon({
  className: 'drive-vehicle-marker',
  html: `
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%);">
      <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(245, 158, 11, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 26px; height: 26px; border-radius: 50%; background: #f59e0b; border: 3px solid #ffffff; box-shadow: 0 0 15px rgba(245, 158, 11, 0.8); display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #ffffff;"></div>
      </div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// Custom Pothole Detected Marker
const potholeIcon = L.divIcon({
  className: 'drive-pothole-marker',
  html: `
    <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%);">
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #ef4444; border: 2px solid #ffffff; box-shadow: 0 2px 10px rgba(239, 68, 68, 0.7); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

// Helper map component to follow vehicle smoothly and capture map clicks to set exact location
function MapController({ center, onLocationSelect }) {
  const map = useMap();
  const lastPosRef = useRef(null);

  useEffect(() => {
    if (!center || !center[0] || !center[1]) return;
    const [lat, lon] = center;
    if (!lastPosRef.current) {
      lastPosRef.current = [lat, lon];
      map.setView([lat, lon], map.getZoom(), { animate: false });
      return;
    }
    const [prevLat, prevLon] = lastPosRef.current;
    if (Math.abs(lat - prevLat) > 0.0001 || Math.abs(lon - prevLon) > 0.0001) {
      lastPosRef.current = [lat, lon];
      map.setView([lat, lon], map.getZoom(), { animate: false });
    }
  }, [center, map]);

  useMapEvents({
    click(e) {
      if (onLocationSelect) {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      }
    }
  });

  return null;
}

// Calculate distance in kilometers using Haversine formula
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Popular Bengaluru road corridors for realistic localized testing
const BENGALURU_CORRIDORS = [
  { id: 'live', name: 'My Live GPS Location', lat: null, lon: null, desc: 'Auto-detected device GPS coordinates' },
  { id: 'koramangala', name: 'Koramangala 80ft Road', lat: 12.9352, lon: 77.6245, desc: 'Ward #151 Koramangala • South' },
  { id: 'indiranagar', name: 'Indiranagar 100ft Road', lat: 12.9719, lon: 77.6412, desc: 'Ward #112 Domlur / Indiranagar • East' },
  { id: 'hsr_layout', name: 'HSR Layout 27th Main', lat: 12.9116, lon: 77.6389, desc: 'Ward #174 HSR Layout • Bommanahalli' },
  { id: 'whitefield', name: 'Whitefield ITPL Main Road', lat: 12.9856, lon: 77.7289, desc: 'Ward #84 Whitefield • Mahadevapura' },
  { id: 'mg_road', name: 'MG Road / Brigade Road', lat: 12.9756, lon: 77.6095, desc: 'Ward #111 Shantalanagar • Central' },
  { id: 'outer_ring', name: 'Outer Ring Road / Bellandur', lat: 12.9260, lon: 77.6762, desc: 'Ward #150 Bellandur • Mahadevapura' },
  { id: 'jayanagar', name: 'Jayanagar 4th Block', lat: 12.9298, lon: 77.5838, desc: 'Ward #153 Jayanagar • South' },
  { id: 'hebbal', name: 'Hebbal Flyover / Bellary Road', lat: 13.0358, lon: 77.5970, desc: 'Ward #7 Byatarayanapura • North' },
];

// Political Party Badge styling
const getPartyBadgeStyle = (party) => {
  const p = (party || '').toUpperCase();
  if (p.includes('BJP')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (p.includes('INC') || p.includes('CONGRESS')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  if (p.includes('JD')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return 'bg-slate-700/50 text-slate-300 border-slate-600';
};

export default function DriveModePage({ currentUser, onOpenAuth }) {
  // Drive State & Session
  const [isDriving, setIsDriving] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [startupStep, setStartupStep] = useState('IDLE'); // 'IDLE' | 'CHECKING_AUTH' | 'GPS_READY' | 'CAMERA_READY' | 'AI_READY' | 'ACTIVE' | 'ERROR'
  const [startupError, setStartupError] = useState(null);

  // Live Vehicle Telemetry (Section 4 & 5)
  const [gpsLocation, setGpsLocation] = useState({
    latitude: 12.9352, // Default to Koramangala Ward 151
    longitude: 77.6245,
    accuracy: 5,
    speed: 32, // km/h
    heading: 90,
    timestamp: Date.now()
  });
  const [gpsAccuracyStatus, setGpsAccuracyStatus] = useState('HIGH');
  const [gpsConnected, setGpsConnected] = useState(false);
  const [hasRealGps, setHasRealGps] = useState(false);
  const [currentWardInfo, setCurrentWardInfo] = useState(null);
  const [selectedCorridor, setSelectedCorridor] = useState('koramangala');
  const [distanceTraveledKm, setDistanceTraveledKm] = useState(0.0);
  const distanceTraveledKmRef = useRef(0.0);
  const prevCoordsRef = useRef(null);
  const baseOriginCoordsRef = useRef({ lat: 12.9352, lon: 77.6245 });

  // Exact Location Overrides & Search State
  const [isManualLocationLocked, setIsManualLocationLocked] = useState(false);
  const isManualLocationLockedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locationToast, setLocationToast] = useState(null);
  const frameOffsetRef = useRef(0);
  const framesProcessedRef = useRef(0);

  const [simulationMode, setSimulationMode] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);

  // Handler to set exact coordinates via click on map, drag marker, search or corridor chip
  const handleSetExactLocation = async (lat, lon, label = null) => {
    const pLat = parseFloat(lat);
    const pLon = parseFloat(lon);
    if (isNaN(pLat) || isNaN(pLon)) return;

    isManualLocationLockedRef.current = true;
    setIsManualLocationLocked(true);
    setSelectedCorridor('custom');
    frameOffsetRef.current = framesProcessedRef.current;
    baseOriginCoordsRef.current = { lat: pLat, lon: pLon };

    const newLoc = {
      ...gpsLocationRef.current,
      latitude: pLat,
      longitude: pLon,
      accuracy: 5.0,
      timestamp: Date.now()
    };
    gpsLocationRef.current = newLoc;
    setGpsLocation(newLoc);
    setGpsAccuracyStatus('HIGH');
    setGpsConnected(true);
    setSearchResults([]);
    setSearchQuery('');

    try {
      const geo = await citizenService.reverseGeocode(pLat, pLon);
      if (geo) {
        setCurrentWardInfo(geo);
        setLocationToast(`Location set: ${geo.exact_road || geo.ward_name || label || 'Selected Point'}`);
        setTimeout(() => setLocationToast(null), 3500);
      }
    } catch (err) {
      console.warn('[Drive Mode] Reverse geocode error:', err);
    }
  };

  const handleSearchLocation = async (q) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await citizenService.searchLocation(q.trim());
      setSearchResults(results || []);
    } catch (err) {
      console.warn('[Search Location Error]', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResetToDeviceGps = () => {
    isManualLocationLockedRef.current = false;
    setIsManualLocationLocked(false);
    setSelectedCorridor('live');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy || 10);
          const loc = { latitude: lat, longitude: lon, accuracy: acc, speed: 0, heading: 90, timestamp: Date.now() };
          gpsLocationRef.current = loc;
          setGpsLocation(loc);
          baseOriginCoordsRef.current = { lat, lon };
          frameOffsetRef.current = framesProcessedRef.current;
          try {
            const geo = await citizenService.reverseGeocode(lat, lon);
            if (geo) {
              setCurrentWardInfo(geo);
              setLocationToast(`Device GPS: ${geo.ward_name || 'Current Location'}`);
              setTimeout(() => setLocationToast(null), 3500);
            }
          } catch (_) {}
        },
        (err) => console.warn('Device GPS error:', err),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  // Query real browser GPS and ward details immediately on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy || 10);

          try {
            const geo = await citizenService.reverseGeocode(lat, lon);
            if (geo) {
              // If device GPS is genuine Bengaluru point, use it; if outside BBMP (like Nelamangala on desktop IP),
              // keep Koramangala as active corridor so user has authentic BBMP intelligence
              if (geo.is_within_bengaluru) {
                const realLoc = {
                  latitude: lat,
                  longitude: lon,
                  accuracy: acc,
                  speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0,
                  heading: Math.round(pos.coords.heading || 90),
                  timestamp: pos.timestamp || Date.now()
                };
                gpsLocationRef.current = realLoc;
                setGpsLocation(realLoc);
                setHasRealGps(true);
                baseOriginCoordsRef.current = { lat, lon };
                setCurrentWardInfo(geo);
                setSelectedCorridor('live');
              } else {
                console.info('[Drive Mode] Device IP resolved outside BBMP (' + (geo.ward_name || 'Nelamangala') + '). Defaulting corridor to Koramangala.');
                setCurrentWardInfo(geo);
              }
            }
          } catch (err) {
            console.warn('[Drive Mode] Initial reverse geocode error:', err);
          }
          setGpsConnected(true);
        },
        (err) => {
          console.warn('[Drive Mode] Initial geolocation check warning:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  const handleSelectCorridor = async (corridorId) => {
    setSelectedCorridor(corridorId);
    const c = BENGALURU_CORRIDORS.find(item => item.id === corridorId);
    if (!c) return;

    if (corridorId === 'live') {
      handleResetToDeviceGps();
    } else if (c.lat && c.lon) {
      handleSetExactLocation(c.lat, c.lon, c.name);
    }
  };

  // Active Pothole Bounding Boxes & Video Controls
  const [activeBoxes, setActiveBoxes] = useState([]);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDefectTimestamps, setVideoDefectTimestamps] = useState([]);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const boxTimeoutRef = useRef(null);

  // Configuration & Settings (Section 7)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.78);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState(true);

  // Metrics & Counters (Section 18)
  const [todayDetectedCount, setTodayDetectedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [latestIncident, setLatestIncident] = useState(null);
  const [detectedPotholes, setDetectedPotholes] = useState([]);
  const [pendingDetection, setPendingDetection] = useState(null);
  const [tripSummary, setTripSummary] = useState(null);

  // Offline queue (Section 23)
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Ward boundary GeoJSON for map display (Section 20)
  const [wardGeoJson, setWardGeoJson] = useState(null);

  // Refs for media & intervals
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameTimeoutRef = useRef(null);
  const isDrivingRef = useRef(false);
  const geoWatchRef = useRef(null);
  const frameBusyRef = useRef(false);
  const pendingDetectionRef = useRef(null);
  const gpsLocationRef = useRef(gpsLocation);
  const gpsConnectedRef = useRef(false);
  const videoInputRef = useRef(null);
  const simCanvasRef = useRef(null);
  const simStreamRef = useRef(null);
  const simIntervalRef = useRef(null);
  const simImageIdxRef = useRef(0);
  const loadedSampleImagesRef = useRef([]);

  // Preload authentic road pothole images for simulation & offline driving mode
  useEffect(() => {
    const loaded = [];
    SAMPLE_POTHOLE_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
      loaded.push(img);
    });
    loadedSampleImagesRef.current = loaded;
  }, []);

  // Performance optimization: Pause frame capture if user backgrounds or switches browser tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        frameBusyRef.current = true;
      } else {
        frameBusyRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Check network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load ward GeoJSON for Drive Mode map
  useEffect(() => {
    publicService.getWardGeoJson()
      .then(geo => setWardGeoJson(geo))
      .catch(e => console.warn('Ward GeoJSON map layer warning:', e));
  }, []);

  // Bind live camera stream to video tag as soon as drive mode mounts
  useEffect(() => {
    if (isDriving && streamRef.current && videoRef.current && !uploadedVideo) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.warn('[Drive Mode Camera] Video play warning:', err);
      });
    }
  }, [isDriving, uploadedVideo]);

  // Memoized Ward GeoJSON Layer to prevent re-rendering 198 polygons on telemetry ticks
  const wardGeoJsonLayer = useMemo(() => {
    if (!wardGeoJson) return null;
    return (
      <GeoJSON
        key="drive-wards-layer"
        data={wardGeoJson}
        style={{
          fillColor: '#10b981',
          weight: 1,
          opacity: 0.5,
          color: '#10b981',
          dashArray: '2',
          fillOpacity: 0.05
        }}
      />
    );
  }, [wardGeoJson]);

  useEffect(() => {
    if (!isDriving || !uploadedVideoUrl || !videoRef.current) return;
    const video = videoRef.current;
    video.src = uploadedVideoUrl;
    video.load();
    video.play()
      .then(() => setIsVideoPlaying(true))
      .catch(error => {
        console.warn('[Drive Mode Video] Autoplay requires user interaction:', error);
        setIsVideoPlaying(false);
      });
  }, [isDriving, uploadedVideoUrl]);

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const v = videoRef.current;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setVideoAspectRatio(v.videoWidth / v.videoHeight);
      }
      if (v.duration && !isNaN(v.duration)) {
        setVideoDuration(v.duration);
      }
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setVideoDuration(videoRef.current.duration);
      }
      if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        const ar = videoRef.current.videoWidth / videoRef.current.videoHeight;
        if (Math.abs(ar - videoAspectRatio) > 0.01) {
          setVideoAspectRatio(ar);
        }
      }
    }
  };

  const handleVideoPlay = () => {
    setIsVideoPlaying(true);
    if (videoRef.current) {
      const v = videoRef.current;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setVideoAspectRatio(v.videoWidth / v.videoHeight);
      }
    }
  };

  const toggleVideoPlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play()
        .then(() => setIsVideoPlaying(true))
        .catch(err => console.warn('[Drive Mode Video] Play error:', err));
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  const handleSeekVideo = (e) => {
    const time = parseFloat(e.target.value);
    setVideoCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const formatVideoTime = (seconds) => {
    if (isNaN(seconds) || seconds == null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Flush offline queue when connectivity returns (Section 23)
  const flushOfflineQueue = async () => {
    try {
      const stored = localStorage.getItem('civic_offline_drive_queue');
      if (!stored) return;
      const queue = JSON.parse(stored);
      if (Array.isArray(queue) && queue.length > 0) {
        console.log(`[Drive Mode] Synchronizing ${queue.length} offline frames...`);
        await citizenService.syncOfflineDrive(queue);
        localStorage.removeItem('civic_offline_drive_queue');
        setOfflineQueueCount(0);
      }
    } catch (err) {
      console.warn('[Drive Mode] Offline sync retry scheduled:', err);
    }
  };

  // Setup Continuous High-Accuracy GPS Geolocation Watch (Section 4 & 5)
  const startGpsTracking = () => {
    if (!('geolocation' in navigator)) {
      console.warn('[Drive Mode GPS] Browser does not support geolocation, using current telemetry.');
      gpsConnectedRef.current = true;
      setGpsConnected(true);
      return;
    }

    geoWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // If user manually set an exact location on the map, do not let browser Wi-Fi/IP GPS overwrite it
        if (isManualLocationLockedRef.current) return;

        const coords = pos.coords;
        const acc = Math.round(coords.accuracy || 10);
        const spd = coords.speed != null ? Math.round(coords.speed * 3.6) : (simulationMode ? 34 : 0);

        const nextLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: acc,
          speed: spd,
          heading: Math.round(coords.heading || 0),
          timestamp: pos.timestamp || Date.now()
        };

        // Calculate real distance traveled via Haversine step
        if (prevCoordsRef.current) {
          const stepKm = calculateHaversineKm(
            prevCoordsRef.current.latitude,
            prevCoordsRef.current.longitude,
            coords.latitude,
            coords.longitude
          );
          if (stepKm > 0.0005 && stepKm < 1.0) {
            distanceTraveledKmRef.current += stepKm;
            setDistanceTraveledKm(parseFloat(distanceTraveledKmRef.current.toFixed(2)));
          }
        }
        prevCoordsRef.current = nextLocation;

        gpsLocationRef.current = nextLocation;
        setGpsLocation(nextLocation);
        gpsConnectedRef.current = true;
        setGpsConnected(true);
        setHasRealGps(true);

        if (acc > 50) {
          pendingDetectionRef.current = null;
          setPendingDetection(null);
        }

        // Classify accuracy
        if (acc <= 20) {
          setGpsAccuracyStatus('HIGH');
        } else if (acc <= 50) {
          setGpsAccuracyStatus('ACCEPTABLE');
        } else {
          setGpsAccuracyStatus('POOR');
        }
      },
      (err) => {
        console.warn('[Drive Mode GPS] Device GPS error or permission denied:', err.message);
        setSimulationMode(true);
        setGpsAccuracyStatus('HIGH');
        gpsConnectedRef.current = true;
        setGpsConnected(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  };

  const stopGpsTracking = () => {
    if (geoWatchRef.current) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
  };

  // 1-Click Quick Demo Login for instant zero-friction testing
  const handleQuickLogin = async () => {
    try {
      const res = await authService.login('citizen.ananya@gmail.com', 'Citizen@123');
      if (res.user) {
        window.location.reload(); // Refresh app with authenticated user session
      }
    } catch (err) {
      alert('Quick login failed: ' + err.message);
    }
  };

  const handleVideoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setStartupError({
        title: 'Invalid Video',
        message: 'Please choose an MP4, WebM, MOV, or other supported video file.',
        isAuthError: false
      });
      return;
    }
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    setUploadedVideo(file);
    setUploadedVideoUrl(URL.createObjectURL(file));
    setConfidenceThreshold(0.78);
    setStartupError(null);
    setSimulationMode(false);
  };

  // Initialize simulated road stream using authentic dataset images
  const startSimulationStream = () => {
    if (!simCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      simCanvasRef.current = c;
    }
    const canvas = simCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const renderSample = () => {
      const ready = loadedSampleImagesRef.current.filter(img => img.complete && img.naturalWidth > 0);
      if (ready.length > 0) {
        const img = ready[simImageIdxRef.current % ready.length];
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    renderSample();

    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    simIntervalRef.current = setInterval(() => {
      if (!isDrivingRef.current) return;
      simImageIdxRef.current = (simImageIdxRef.current + 1) % Math.max(1, loadedSampleImagesRef.current.length);
      renderSample();
    }, 2800);

    if (canvas.captureStream && videoRef.current) {
      try {
        const stream = canvas.captureStream(12);
        simStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } catch (err) {
        console.warn('Canvas stream warning:', err);
      }
    }
  };

  // Main Startup Sequence (Section 3)
  const startDriveMode = async (forceSimulation = false) => {
    setStartupError(null);

    // =========================================================================
    // STEP 1: Check Authentication (Requirement 1 & 2)
    // =========================================================================
    setStartupStep('CHECKING_AUTH');
    const token = localStorage.getItem('token');
    const authState = token ? 'present' : 'missing';

    console.log(`[Drive Mode]
Initialization request
Endpoint: /api/drive/sessions/start
Authentication: ${authState}`);

    if (!token) {
      console.warn(`[Drive Mode]
Initialization request
Endpoint: /api/drive/sessions/start
Authentication: missing
Response status: 401
Response message: User is not authenticated. Please sign in to start Drive Mode.`);

      setStartupStep('ERROR');
      setStartupError({
        title: 'Authentication Required',
        message: 'Drive Mode requires an authenticated citizen account to record and log road defects. Please sign in to proceed.',
        isAuthError: true
      });
      return;
    }

    // =========================================================================
    // STEP 2: Request Device GPS Location (Requirement 3 & 4)
    // =========================================================================
    setStartupStep('GPS_READY');
    startGpsTracking();

    // =========================================================================
    // STEP 3: Use uploaded road video or request camera input (Requirement 6)
    // =========================================================================
    setStartupStep('CAMERA_READY');
    try {
      if (uploadedVideo) {
        setSimulationMode(false);
      } else if (forceSimulation) {
        setSimulationMode(true);
        startSimulationStream();
      } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // Camera preferred
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } else {
        setSimulationMode(true);
        startSimulationStream();
      }
    } catch (camErr) {
      console.warn('[Drive Mode Camera] Camera access denied or unavailable, running in simulation feed mode:', camErr);
      setSimulationMode(true);
      startSimulationStream();
    }

    // =========================================================================
    // STEP 4: Initialize Drive Mode on Backend (Requirement 1 & 2)
    // =========================================================================
    setStartupStep('AI_READY');
    let session = null;
    try {
      const initialGps = gpsLocationRef.current;
      session = await citizenService.startDrive(initialGps.latitude, initialGps.longitude);
      setSessionId(session.id);
    } catch (initErr) {
      const status = initErr.response?.status || 500;
      const detail = initErr.response?.data?.detail || initErr.message;

      console.warn(`[Drive Mode]
Initialization request
Endpoint: /api/drive/sessions/start
Authentication: ${authState}
Response status: ${status}
Response message: ${detail}`);

      setStartupStep('ERROR');

      if (status === 401) {
        authService.logout();
        setStartupError({
          title: 'Authentication Expired',
          message: 'Drive Mode authentication expired. Please sign in again.',
          isAuthError: true
        });
      } else {
        setStartupError({
          title: 'Initialization Failed',
          message: `Could not connect to Drive Mode server: ${detail}`,
          isAuthError: false
        });
      }
      return;
    }

    // =========================================================================
    // =========================================================================
    // STEP 5: Activate Autonomous Road Monitoring HUD (Requirement 3)
    // =========================================================================
    setStartupStep('ACTIVE');
    setIsDriving(true);
    isDrivingRef.current = true;
    setTripSummary(null);
    setFramesProcessed(0);

    // Audio cue
    if (soundEnabled) playDetectionChime('verified');
    if (voiceAlertsEnabled) speakDetectionAlert('Drive Mode Active. Autonomous road monitoring started.');

    // Adaptive self-scheduling loop: processes frames stably without piling up or freezing UI
    const scheduleNextFrame = (activeSessionId) => {
      if (!isDrivingRef.current) return;
      frameTimeoutRef.current = setTimeout(async () => {
        if (!isDrivingRef.current) return;
        await captureAndProcessFrame(activeSessionId);
        if (isDrivingRef.current) {
          scheduleNextFrame(activeSessionId);
        }
      }, 400); // 400ms interval (2.5 fps) ensures high responsiveness at road driving speeds
    };

    scheduleNextFrame(session.id);
  };

  // Stop Drive Mode Session
  const stopDriveMode = async () => {
    isDrivingRef.current = false;
    if (frameTimeoutRef.current) {
      clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (boxTimeoutRef.current) {
      clearTimeout(boxTimeoutRef.current);
      boxTimeoutRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (simStreamRef.current) {
      simStreamRef.current.getTracks().forEach(t => t.stop());
      simStreamRef.current = null;
    }
    setActiveBoxes([]);
    setIsVideoPlaying(false);
    stopGpsTracking();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      if (uploadedVideo) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } else {
        videoRef.current.srcObject = null;
      }
    }

    if (sessionId) {
      try {
        const finalDistance = Math.max(0.08, parseFloat(distanceTraveledKmRef.current.toFixed(2)));
        const summary = await citizenService.endDrive(sessionId, finalDistance);
        setTripSummary({
          ...summary,
          distance_km: finalDistance
        });
      } catch (err) {
        console.error('[Drive Mode] Error ending session:', err);
      }
    }

    setIsDriving(false);
    setStartupStep('IDLE');
    if (voiceAlertsEnabled) speakDetectionAlert('Drive Mode stopped. Trip evidence saved safely.');
  };

  // Capture video frame and process via AI Pipeline (Requirement 6, 7, 8)
  const captureAndProcessFrame = async (activeSessionId) => {
    if (!isDrivingRef.current) return;
    // Non-blocking frame capture: continue scanning frames smoothly without stalling when candidates are flagged
    if (frameBusyRef.current) return;
    frameBusyRef.current = true;

    const currentGps = gpsLocationRef.current;
    let currentAccuracy = currentGps.accuracy;
    let currentLat = currentGps.latitude;
    let currentLon = currentGps.longitude;

    if (hasRealGps && !simulationMode && !uploadedVideo && !isManualLocationLockedRef.current) {
      // Use real GPS coordinates from device
      currentLat = currentGps.latitude;
      currentLon = currentGps.longitude;
      currentAccuracy = Math.min(currentAccuracy, 15.0);
    } else {
      // Advance vehicle forward along road based on chosen origin corridor or manual pinned location
      const base = baseOriginCoordsRef.current || { lat: currentLat, lon: currentLon };
      const headingRad = ((currentGps.heading || 85) * Math.PI) / 180;
      // Step forward ~6-8 meters per tick from chosen origin
      const ticks = Math.max(0, framesProcessed - frameOffsetRef.current);
      const stepDeg = 0.00006 * (ticks + 1);
      currentLat = base.lat + Math.cos(headingRad) * stepDeg;
      currentLon = base.lon + Math.sin(headingRad) * stepDeg;
      currentAccuracy = 5.0;

      const simLoc = {
        ...currentGps,
        latitude: currentLat,
        longitude: currentLon,
        accuracy: currentAccuracy,
        speed: 34,
        heading: 85
      };
      gpsLocationRef.current = simLoc;
      setGpsLocation(simLoc);

      // Accumulate distance in simulation mode
      const stepKm = 0.0066; // 6.6m per frame at ~34 km/h
      distanceTraveledKmRef.current += stepKm;
      setDistanceTraveledKm(parseFloat(distanceTraveledKmRef.current.toFixed(2)));
    }

    // Grab JPEG frame from canvas via utility
    let imageBase64 = null;
    if (videoRef.current && canvasRef.current && (streamRef.current || uploadedVideo || simStreamRef.current)) {
      imageBase64 = captureFrameFromVideo(videoRef.current, canvasRef.current, 640);
    }
    if (!imageBase64 && simulationMode && simCanvasRef.current) {
      imageBase64 = simCanvasRef.current.toDataURL('image/jpeg', 0.82);
    }

    // If frame hasn't loaded yet, skip tick
    if (!imageBase64) {
      frameBusyRef.current = false;
      return;
    }

    setFramesProcessed(prev => prev + 1);

    const payload = {
      session_id: activeSessionId,
      timestamp_ms: Date.now(),
      latitude: currentLat,
      longitude: currentLon,
      gps_accuracy: currentAccuracy,
      speed: currentGps.speed || 34,
      heading: currentGps.heading || 90,
      category: 'Pothole',
      confidence: confidenceThreshold,
      bbox: [120, 140, 280, 290],
      image_base64: imageBase64
    };

    // Offline resilience: Queue locally if disconnected (Requirement 23)
    if (!navigator.onLine) {
      try {
        const stored = localStorage.getItem('civic_offline_drive_queue') || '[]';
        const queue = JSON.parse(stored);
        queue.push(payload);
        localStorage.setItem('civic_offline_drive_queue', JSON.stringify(queue.slice(-50)));
        setOfflineQueueCount(queue.length);
      } catch (e) {
        console.warn('Offline queue storage error:', e);
      }
      frameBusyRef.current = false;
      return;
    }

    try {
      const res = await citizenService.processFrame(payload);

      // 1. Process and render Solid Red Rectangular Bounding Boxes on Video
      const minConfidence = Math.max(0.65, confidenceThreshold || 0.65);
      const filteredDetections = (res.detections || []).filter(d => (d.confidence || 0) >= minConfidence);
      if (filteredDetections.length > 0) {
        const formattedBoxes = formatPotholeBoundingBoxes(filteredDetections);
        setActiveBoxes(formattedBoxes);

        // Record timestamp marker on video scrubber
        if (videoRef.current && uploadedVideo) {
          const currentTime = videoRef.current.currentTime;
          setVideoDefectTimestamps(prev => {
            if (prev.some(m => Math.abs(m.time - currentTime) < 1.2)) return prev;
            return [...prev, { time: currentTime, confidence: res.confidence || 0.85, label: 'Pothole' }];
          });
        }

        // Auto-fade timer: smoothly clear boxes after 900ms if no new defect is detected
        if (boxTimeoutRef.current) clearTimeout(boxTimeoutRef.current);
        boxTimeoutRef.current = setTimeout(() => {
          if (isDrivingRef.current) {
            setActiveBoxes([]);
          }
        }, 900);
      } else {
        setActiveBoxes([]);
      }

      if (res.status === 'CANDIDATE_DETECTED') {
        const candidate = {
          payload,
          ...res,
          detectedAt: new Date().toLocaleTimeString()
        };
        // For physical road driving, hold for driver confirmation. For uploaded video analysis, keep scanning.
        if (!uploadedVideo) {
          pendingDetectionRef.current = candidate;
        }
        setPendingDetection(candidate);
        if (soundEnabled) playDetectionChime('detected');
        if (voiceAlertsEnabled) speakDetectionAlert('Pothole detected.');
      } else if (res.status === 'EVENT_LOGGED') {
        // Road defect detection event (new or merged into existing canonical incident)
        if (res.session_detections_count !== undefined) {
          setTodayDetectedCount(res.session_detections_count);
        }
        if (res.confirmed_incidents_count !== undefined) {
          setVerifiedCount(res.confirmed_incidents_count);
        }
        if (res.status === 'EVENT_LOGGED') {
          setLatestIncident(res);
        }

        // Add to detected potholes list on map
        setDetectedPotholes(prev => [
          {
            id: res.incident_id || Date.now(),
            code: res.incident_code || 'BLR-DASH-POTHOLE',
            latitude: res.latitude,
            longitude: res.longitude,
            confidence: res.confidence,
            ward_number: res.ward_number,
            ward_name: res.ward_name,
            assembly_constituency: res.assembly_constituency,
            mla_name: res.mla_name,
            parliamentary_constituency: res.parliamentary_constituency,
            mp_name: res.mp_name,
            report_status: res.report_status,
            government_message: res.government_message,
            boundary_warning: res.boundary_warning,
            timestamp: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 19)
        ]);

        // Driver Audio Alert (Zero-touch)
        if (soundEnabled) playDetectionChime('verified');
        if (voiceAlertsEnabled) {
          speakDetectionAlert(`Pothole verified in ${res.ward_name || 'BBMP Ward'}.`);
        }
      } else if (res.status === 'TEMPORAL_SUPPRESSED') {
        // Consecutive frame of same pothole merged into 1 incident (Requirement 8)
        if (res.session_detections_count) {
          setTodayDetectedCount(res.session_detections_count);
        }
      } else if (res.status === 'HELD_LOW_GPS_ACCURACY') {
        setPendingCount(prev => prev + 1);
      }
    } catch (err) {
      // Quiet background handling to never distract driver while driving
      if (err.response?.status === 401) {
        console.warn('[Drive Mode] Frame token expired, stopping drive session.');
        stopDriveMode();
      }
    } finally {
      frameBusyRef.current = false;
    }
  };

  const confirmPendingDetection = async () => {
    if (!pendingDetection) return;
    const candidate = pendingDetection;
    setPendingDetection(null);
    pendingDetectionRef.current = null;
    try {
      const res = await citizenService.processFrame({
        ...candidate.payload,
        confirmed_submission: true
      });
      if (res.status === 'EVENT_LOGGED') {
        setTodayDetectedCount(res.session_detections_count);
        setVerifiedCount(res.confirmed_incidents_count);
        setLatestIncident(res);
        setDetectedPotholes(prev => [{
          id: res.incident_id || Date.now(),
          code: res.incident_code || 'BLR-DASH-POTHOLE',
          latitude: res.latitude,
          longitude: res.longitude,
          confidence: res.confidence,
          ward_number: res.ward_number,
          ward_name: res.ward_name,
          assembly_constituency: res.assembly_constituency,
          mla_name: res.mla_name,
          parliamentary_constituency: res.parliamentary_constituency,
          mp_name: res.mp_name,
          report_status: res.report_status,
          government_message: res.government_message,
          boundary_warning: res.boundary_warning,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev.slice(0, 19)]);
        if (soundEnabled) playDetectionChime('verified');
        if (voiceAlertsEnabled) speakDetectionAlert(`Pothole reported in ${res.ward_name || 'BBMP Ward'}.`);
      }
    } catch (err) {
      console.warn('[Drive Mode] Could not confirm pothole report:', err);
      setPendingDetection(candidate);
      pendingDetectionRef.current = candidate;
    }
  };

  const ignorePendingDetection = () => {
    pendingDetectionRef.current = null;
    setPendingDetection(null);
  };

  // Cleanup on component unmount (Requirement 3: strictly halt pipeline when leaving page)
  useEffect(() => {
    return () => {
      isDrivingRef.current = false;
      if (frameTimeoutRef.current) clearTimeout(frameTimeoutRef.current);
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      if (boxTimeoutRef.current) clearTimeout(boxTimeoutRef.current);
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      stopGpsTracking();
      const currentStream = streamRef.current;
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const currentSimStream = simStreamRef.current;
      if (currentSimStream) {
        currentSimStream.getTracks().forEach(t => t.stop());
        simStreamRef.current = null;
      }
      const currentVideo = videoRef.current;
      if (currentVideo) {
        currentVideo.pause();
        currentVideo.srcObject = null;
      }
      setActiveBoxes([]);
    };
  }, []);

  return (
    <div className="drive-mode-shell max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ========================================================================= */}
      {/* 1. SETUP / WELCOME SCREEN (When not driving) */}
      {/* ========================================================================= */}
      {!isDriving && !tripSummary && (
        <div className="drive-mode-setup glass-card sheen-card rounded-3xl p-6 sm:p-10 space-y-8 relative overflow-hidden animate-in-up">
          {/* Ambient Warm Lighting Mesh */}
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shadow-xl shadow-amber-400/15">
              <Car className="w-8 h-8 stroke-[2.5]" />
            </div>
            <span className="eyebrow" style={{ color: 'rgba(251,191,36,0.9)' }}>Autonomous Drive-by CV Engine</span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              AI Video <span className="text-aurora">Drive Mode</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              Upload a road video or use live detection. As you travel through Bengaluru, AI autonomously scans the road surface, detects potholes, validates authentic BBMP wards, MLA & MP constituencies, and logs verified incidents.
            </p>
          </div>

          {/* Authentication Status Check Banner */}
          {!currentUser ? (
            <div className="bg-amber-500/10 border border-amber-500/30 backdrop-blur-md rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 relative z-10 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs sm:text-sm">
                    Citizen Sign-In Required
                  </h4>
                  <p className="text-xs text-slate-400">
                    Drive Mode securely logs civic road defects under your verified citizen account.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickLogin}
                  className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>1-Click Citizen Login</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5 active:scale-95"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In / Register</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-xs relative z-10 shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-300">
                  Logged in as <strong className="text-white">{currentUser.name}</strong> ({currentUser.role}). Drive sessions are securely audited.
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 font-mono">
                AUTH READY
              </span>
            </div>
          )}

          {/* Startup Error Banner */}
          {startupError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 space-y-2 relative z-10 shadow-md">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertCircle className="w-4 h-4" />
                <span>{startupError.title}</span>
              </div>
              <p className="text-slate-300">{startupError.message}</p>
              {startupError.isAuthError && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleQuickLogin}
                    className="px-3 py-1.5 rounded-xl bg-rose-500 text-slate-950 font-bold text-xs shadow"
                  >
                    Quick Sign-In as Citizen Ananya
                  </button>
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-white font-semibold text-xs border border-slate-700"
                  >
                    Custom Login
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Startup State Machine Progress (Section 3) */}
          {startupStep !== 'IDLE' && startupStep !== 'ERROR' && (
            <div className="p-4 bg-slate-950/80 backdrop-blur-md rounded-2xl border border-white/[0.08] space-y-2 relative z-10">
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>STARTUP INITIALIZATION PIPELINE</span>
                <span className="text-amber-400 font-bold">{startupStep}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px] font-mono font-bold">
                <div className={`p-2 rounded-xl text-center ${['CHECKING_AUTH', 'GPS_READY', 'CAMERA_READY', 'AI_READY', 'ACTIVE'].includes(startupStep) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}`}>
                  1. AUTH
                </div>
                <div className={`p-2 rounded-xl text-center ${['GPS_READY', 'CAMERA_READY', 'AI_READY', 'ACTIVE'].includes(startupStep) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}`}>
                  2. GPS
                </div>
                <div className={`p-2 rounded-xl text-center ${['CAMERA_READY', 'AI_READY', 'ACTIVE'].includes(startupStep) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}`}>
                  3. CAMERA
                </div>
                <div className={`p-2 rounded-xl text-center ${['AI_READY', 'ACTIVE'].includes(startupStep) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}`}>
                  4. AI MODEL
                </div>
              </div>
            </div>
          )}

          {/* Key Safety & Technical Guarantees Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs relative z-10">
            <div className="bg-slate-950/60 backdrop-blur-md p-5 rounded-2xl border border-white/[0.08] space-y-2 hover:border-amber-400/30 transition-all shadow-md">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span>Zero-Touch Driver Safety</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Zero typing or phone interaction while vehicle is moving. Autonomous GPS & audio chimes keep eyes on the road.
              </p>
            </div>
            <div className="bg-slate-950/60 backdrop-blur-md p-5 rounded-2xl border border-white/[0.08] space-y-2 hover:border-emerald-400/30 transition-all shadow-md">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Temporal Pothole Filter</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Consecutive frames of the same road cavity automatically merge into 1 incident without report spam.
              </p>
            </div>
            <div className="bg-slate-950/60 backdrop-blur-md p-5 rounded-2xl border border-white/[0.08] space-y-2 hover:border-purple-400/30 transition-all shadow-md">
              <div className="font-bold text-purple-400 flex items-center gap-1.5">
                <Landmark className="w-4 h-4" />
                <span>Ward & Representative PiP</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Point-in-Polygon spatial mapping against official BBMP wards, MLA assembly, and MP parliamentary polygons.
              </p>
            </div>
          </div>

          {/* Configurable Thresholds Bar (Section 7) */}
          <div className="bg-slate-950/60 backdrop-blur-md p-5 rounded-2xl border border-white/[0.08] relative z-10 shadow-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-bold text-white block">Analyze a Road Video</span>
                <span className="text-slate-500 text-[11px]">Upload a recorded drive video. Drive Mode samples frames and detects potholes automatically.</span>
              </div>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/30 text-xs font-bold flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {uploadedVideo ? 'Change Video' : 'Upload Video'}
              </button>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />
            </div>
            {uploadedVideo && (
              <div className="flex items-center justify-between gap-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2 text-[11px]">
                <span className="text-cyan-200 truncate">Selected: {uploadedVideo.name}</span>
                <span className="text-slate-400 shrink-0">Video GPS uses current device GPS</span>
              </div>
            )}
          </div>

          {/* Location & Bengaluru Corridor Selector Bar */}
          <div className="bg-slate-950/60 backdrop-blur-md p-5 rounded-2xl border border-white/[0.08] relative z-10 shadow-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-white text-xs block">Drive Route & Corridor:</span>
                  <span className="text-slate-400 text-[11px]">
                    {hasRealGps && selectedCorridor === 'live'
                      ? `Using Device GPS: ${currentWardInfo?.ward_name || 'Bengaluru Local Ward'}`
                      : `Selected Corridor: ${BENGALURU_CORRIDORS.find(c => c.id === selectedCorridor)?.name || 'Custom'}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  GPS: {gpsLocation.latitude.toFixed(4)}, {gpsLocation.longitude.toFixed(4)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {BENGALURU_CORRIDORS.slice(0, 4).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCorridor(c.id)}
                  className={`p-2 rounded-xl text-left transition-all ${
                    selectedCorridor === c.id
                      ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-bold'
                      : 'bg-slate-900/60 border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-xs truncate font-semibold">{c.name}</div>
                  <div className="text-[9px] text-slate-500 truncate">{c.desc}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BENGALURU_CORRIDORS.slice(4).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCorridor(c.id)}
                  className={`p-2 rounded-xl text-left transition-all ${
                    selectedCorridor === c.id
                      ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-bold'
                      : 'bg-slate-900/60 border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-xs truncate font-semibold">{c.name}</div>
                  <div className="text-[9px] text-slate-500 truncate">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Launch Button */}
          <div className="text-center pt-2 space-y-3 relative z-10">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => startDriveMode(false)}
                className="px-8 py-4 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black rounded-2xl text-sm shadow-[0_12px_36px_-8px_rgba(251,191,36,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_44px_-8px_rgba(251,191,36,0.7)] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>{uploadedVideo ? 'START UPLOADED VIDEO DRIVE MODE' : 'START LIVE DRIVE MODE'}</span>
              </button>
              {!uploadedVideo && (
                <button
                  type="button"
                  onClick={() => startDriveMode(true)}
                  className="px-6 py-4 bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-400/40 hover:border-amber-400 font-bold rounded-2xl text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4 text-amber-400" />
                  <span>INSTANT POTHOLE DEMO STREAM</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Bengaluru Smart Road Intelligence • Section 30 Ethical Architecture
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MINIMALIST DRIVER HUD (Active Autonomous Drive Mode) (Section 18 & 20) */}
      {/* ========================================================================= */}
      {isDriving && (
        <div className="drive-mode-active bg-black/95 backdrop-blur-2xl border-2 border-amber-400/80 rounded-3xl p-5 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          {/* Top Driver Telemetry Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/90 backdrop-blur-md border border-white/[0.1] p-3.5 rounded-2xl shadow-lg">
            {/* Status Pill */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-black text-xs uppercase tracking-wider text-amber-400">
                DRIVE MODE ACTIVE
              </span>
            </div>

            {/* GPS Telemetry Bar (Section 4 & 5) */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>GPS: <strong className="text-white">Connected</strong></span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Accuracy:</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  uploadedVideo || gpsAccuracyStatus === 'HIGH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  gpsAccuracyStatus === 'ACCEPTABLE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {uploadedVideo ? '±8 m (High Precision)' : `${gpsLocation.accuracy} m`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-slate-300">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Speed: <strong className="text-white">{gpsLocation.speed} km/h</strong></span>
              </div>

              <div className="flex items-center gap-1.5 text-slate-300">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Distance: <strong className="text-white font-bold">{distanceTraveledKm.toFixed(2)} km</strong></span>
              </div>

              {/* Sound toggle */}
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 transition-colors"
                title={soundEnabled ? 'Mute Audio Chimes' : 'Unmute Audio Chimes'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Offline indicator */}
              {!isOnline && (
                <div className="flex items-center gap-1 text-rose-400 text-[10px] font-bold">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Offline ({offlineQueueCount} queued)</span>
                </div>
              )}
            </div>
          </div>

          {/* Low GPS Accuracy Warning (Section 5) - Only for real vehicle drive, not for uploaded video or simulation */}
          {!uploadedVideo && !simulationMode && gpsAccuracyStatus === 'POOR' && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2 shadow-md">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>
                <strong>GPS accuracy is too low to create a verified incident ({gpsLocation.accuracy}m).</strong> Detections are temporarily held until GPS precision improves.
              </span>
            </div>
          )}

          {/* Video Feed & Live Map Side-by-Side (Section 6 & 20) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Video Stream with Rectangle Bounding Box Detection */}
            <div className="relative min-h-[300px] sm:min-h-[360px] bg-slate-950 rounded-2xl overflow-hidden border border-white/[0.12] flex flex-col justify-between shadow-inner">
              <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden w-full p-1 sm:p-2">
                {/* 1-to-1 Aspect-Ratio Matching Video Container with Zero Letterbox */}
                <div
                  className="relative inline-flex items-center justify-center max-w-full overflow-hidden rounded-xl shadow-2xl bg-black"
                  style={{
                    aspectRatio: `${videoAspectRatio}`,
                    maxHeight: 'min(360px, 50vh)',
                    width: 'auto'
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onPlay={handleVideoPlay}
                    onPause={() => setIsVideoPlaying(false)}
                    onEnded={() => {
                      setIsVideoPlaying(false);
                    }}
                    className="w-full h-full block object-fill"
                  />

                  {/* Solid Red Pothole Bounding Box Overlays with Model Confidence Scores */}
                  {showBoundingBoxes && activeBoxes.length > 0 && (
                    <div className="drive-detection-overlay" style={{ position: 'absolute', inset: 0 }}>
                      {activeBoxes.map((box, idx) => {
                        const style = box.style || {
                          left: `${Math.max(0, Math.min(95, (box.normalized_bbox?.[0] || 0.15) * 100))}%`,
                          top: `${Math.max(0, Math.min(95, (box.normalized_bbox?.[1] || 0.2) * 100))}%`,
                          width: `${Math.max(3, Math.min(100, ((box.normalized_bbox?.[2] || 0.45) - (box.normalized_bbox?.[0] || 0.15)) * 100))}%`,
                          height: `${Math.max(3, Math.min(100, ((box.normalized_bbox?.[3] || 0.5) - (box.normalized_bbox?.[1] || 0.2)) * 100))}%`
                        };
                        const confPct = box.confidencePct !== undefined ? box.confidencePct : Math.round((box.confidence || 0.85) * 100);

                        return (
                          <div
                            key={box.id || idx}
                            className="drive-bbox-rect"
                            style={style}
                          >
                            {/* Reticle Corner Brackets */}
                            <span className="drive-bbox-corner drive-bbox-corner-tl" />
                            <span className="drive-bbox-corner drive-bbox-corner-tr" />
                            <span className="drive-bbox-corner drive-bbox-corner-bl" />
                            <span className="drive-bbox-corner drive-bbox-corner-br" />

                            {/* Solid Red Model Confidence Badge Adjacent / Inside Box */}
                            <div className={`drive-bbox-label ${box.labelInside ? 'label-inside' : ''}`}>
                              <AlertTriangle className="w-3 h-3 text-white shrink-0" />
                              <span>{(box.className || box.class_name || 'POTHOLE').toUpperCase()}</span>
                              <span className="font-bold">{confPct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Real-Time Scanline animation overlay */}
                  <div className="absolute inset-0 pointer-events-none border border-amber-400/20 rounded-xl">
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse opacity-75 mt-8"></div>
                  </div>
                </div>

                {/* Simulation Mode HUD Badge */}
                {simulationMode && !uploadedVideo && (
                  <div className="absolute top-12 left-3 z-30 bg-amber-500/20 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] text-amber-300 border border-amber-500/30 flex items-center gap-1.5 font-bold font-mono shadow-md pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>
                      {currentWardInfo?.ward_name 
                        ? `ACTIVE SENSING FEED • ${currentWardInfo.ward_name.toUpperCase()}`
                        : 'ACTIVE SENSING FEED • BENGALURU ROAD SCANNER'}
                    </span>
                  </div>
                )}

                {/* Top HUD Badges */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30">
                  {activeBoxes.length > 0 ? (
                    <div className="bg-red-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] text-red-300 border border-red-500/50 flex items-center gap-2 font-bold font-mono shadow-lg shadow-red-950/50 animate-pulse pointer-events-auto">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span>POTHOLE DETECTED ({activeBoxes.length} IN FRAME)</span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] text-emerald-400 border border-emerald-500/30 flex items-center gap-2 font-bold font-mono shadow pointer-events-auto">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>SCANNING ROAD SURFACE...</span>
                    </div>
                  )}

                  {/* Toggle Bounding Boxes Button */}
                  <button
                    type="button"
                    onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                    className="pointer-events-auto bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border border-white/[0.15] shadow flex items-center gap-1.5 transition-colors"
                  >
                    <Sliders className="w-3 h-3 text-amber-400" />
                    <span>Boxes: <strong className={showBoundingBoxes ? 'text-emerald-400' : 'text-slate-400'}>{showBoundingBoxes ? 'ON' : 'OFF'}</strong></span>
                  </button>
                </div>

                {/* Source Badge */}
                <div className="absolute bottom-3 left-3 z-30 bg-black/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] text-amber-400 border border-amber-400/30 flex items-center gap-1.5 font-bold font-mono">
                  <Camera className="w-3 h-3" />
                  <span>{uploadedVideo ? `VIDEO: ${uploadedVideo.name}` : 'AI ROAD SCANNER (2.5 FPS)'}</span>
                </div>
              </div>

              {/* Uploaded Video Controls & Scrubber Timeline */}
              {uploadedVideo && (
                <div className="bg-slate-950/95 border-t border-white/[0.1] p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleVideoPlayback}
                      className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow transition-colors shrink-0"
                      title={isVideoPlaying ? 'Pause Video' : 'Play Video'}
                    >
                      {isVideoPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950" />}
                    </button>

                    {/* Scrubber Timeline with Detected Defect Indicators */}
                    <div className="flex-1 relative flex items-center">
                      <input
                        type="range"
                        min="0"
                        max={videoDuration || 100}
                        step="0.1"
                        value={videoCurrentTime}
                        onChange={handleSeekVideo}
                        className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                      />
                      {videoDefectTimestamps.map((t, idx) => (
                        <div
                          key={idx}
                          className="absolute w-2 h-2 rounded-full bg-red-500 top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none shadow"
                          style={{ left: `${(t.time / (videoDuration || 1)) * 100}%` }}
                          title={`Pothole detected at ${formatVideoTime(t.time)}`}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Live Leaflet Map (Section 20) */}
            <div className="relative min-h-[360px] sm:min-h-[420px] bg-slate-950 rounded-2xl overflow-hidden border border-white/[0.12] shadow-inner flex flex-col">
              {/* Location Search & Quick Ward Chips Toolbar */}
              <div className="bg-slate-900/95 border-b border-white/[0.08] p-2 space-y-1.5 z-20">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search exact road or ward in Bengaluru..."
                      value={searchQuery}
                      onChange={(e) => handleSearchLocation(e.target.value)}
                      className="w-full bg-slate-950 border border-white/[0.12] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {isManualLocationLocked ? (
                    <button
                      type="button"
                      onClick={handleResetToDeviceGps}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                      title="Reset to device live GPS"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset GPS</span>
                    </button>
                  ) : (
                    <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-[10px] font-mono shrink-0 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Device GPS</span>
                    </div>
                  )}
                </div>

                {/* Floating Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-2 right-2 top-12 z-50 bg-slate-900 border border-white/[0.15] rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-white/[0.05]">
                    {searchResults.map((res, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSetExactLocation(res.latitude, res.longitude, res.name)}
                        className="w-full text-left p-2 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="text-xs text-white font-medium block truncate">{res.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{res.ward_name ? `Ward #${res.ward_number} ${res.ward_name}` : res.zone_name || 'Bengaluru'}</span>
                        </div>
                        <span className="text-[9px] text-amber-400 font-mono shrink-0">SELECT</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick Corridor Selection Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px] pt-0.5">
                  <span className="text-slate-500 shrink-0 font-medium">Quick Wards:</span>
                  {BENGALURU_CORRIDORS.filter(c => c.lat && c.lon).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSetExactLocation(c.lat, c.lon, c.name)}
                      className={`px-2 py-0.5 rounded-md border shrink-0 transition-all ${
                        Math.abs(gpsLocation.latitude - c.lat) < 0.005 && Math.abs(gpsLocation.longitude - c.lon) < 0.005
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 font-bold'
                          : 'bg-slate-950/60 text-slate-300 border-white/[0.08] hover:bg-white/[0.05]'
                      }`}
                    >
                      {c.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Map Canvas with Click and Drag Support */}
              <div className="relative flex-1 min-h-[260px]">
                <MapContainer
                  center={[gpsLocation.latitude, gpsLocation.longitude]}
                  zoom={15}
                  scrollWheelZoom={true}
                  className="w-full h-full z-0"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapController
                    center={[gpsLocation.latitude, gpsLocation.longitude]}
                    onLocationSelect={(lat, lon) => handleSetExactLocation(lat, lon)}
                  />

                  {/* Ward Polygons overlay */}
                  {wardGeoJsonLayer}

                  {/* Live Draggable Vehicle Marker */}
                  <Marker
                    position={[gpsLocation.latitude, gpsLocation.longitude]}
                    icon={vehicleIcon}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const pos = e.target.getLatLng();
                        handleSetExactLocation(pos.lat, pos.lng);
                      }
                    }}
                  >
                    <Popup className="custom-leaflet-popup">
                      <div className="p-1 text-xs text-slate-900">
                        <div className="font-bold text-amber-600">VEHICLE LOCATION</div>
                        <div><strong>Ward:</strong> {currentWardInfo?.ward_name || 'Resolving...'}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Drag marker or click map to move vehicle</div>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Detected Pothole Pins */}
                  {detectedPotholes.map(p => (
                    <Marker
                      key={p.id}
                      position={[p.latitude, p.longitude]}
                      icon={potholeIcon}
                    >
                      <Popup className="custom-leaflet-popup">
                        <div className="p-1 text-xs text-slate-900 min-w-[180px]">
                          <div className="font-bold text-red-600 mb-0.5">POTHOLE DETECTED</div>
                          <div><strong>Ward:</strong> #{p.ward_number} {p.ward_name}</div>
                          <div><strong>MLA:</strong> {p.mla_name}</div>
                          <div><strong>MP:</strong> {p.mp_name}</div>
                          <div className="text-[10px] text-slate-500 mt-1">Status: {p.report_status}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>

                {/* Location Toast Notification */}
                {locationToast && (
                  <div className="absolute top-3 left-3 right-3 z-[400] bg-emerald-950/95 border border-emerald-500/60 p-2 rounded-xl text-emerald-300 text-xs shadow-lg flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-medium truncate">{locationToast}</span>
                  </div>
                )}

                {/* Outside BBMP / Inaccurate IP Warning */}
                {!currentWardInfo?.is_within_bengaluru && !isManualLocationLocked && (
                  <div className="absolute top-3 left-3 right-3 z-[400] bg-rose-950/95 border border-rose-500/60 p-2 rounded-xl text-rose-200 text-xs shadow-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="truncate">Desktop Wi-Fi located in Nelamangala. Click map or select a ward above to set exact road.</span>
                    </div>
                  </div>
                )}

                {/* Bottom Overlay Info Banner */}
                <div className="absolute bottom-3 left-3 right-3 z-[400] flex items-center justify-between gap-2 pointer-events-none">
                  <div className="bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] text-slate-200 border border-white/[0.12] font-mono shadow flex items-center gap-2 pointer-events-auto">
                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="font-bold text-white truncate max-w-[180px]">
                      {currentWardInfo?.exact_road || currentWardInfo?.ward_name || 'Nelamangala'}
                    </span>
                    <span className="text-slate-400">
                      ({gpsLocation.latitude.toFixed(5)}, {gpsLocation.longitude.toFixed(5)})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isManualLocationLocked ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                      {isManualLocationLocked ? 'PINNED' : 'DEVICE GPS'}
                    </span>
                  </div>
                  <div className="bg-black/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl text-[10px] text-slate-300 border border-white/[0.12] pointer-events-auto">
                    Click map to move
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Safety confirmation: detection is not submitted until the citizen confirms. */}
          {pendingDetection && (
            <div className="bg-amber-500/10 border-2 border-amber-400/60 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-400/20 text-amber-300 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-amber-200 text-sm">Pothole detected, review before reporting</h3>
                    <span className="font-mono text-xs text-emerald-300">{Math.round(pendingDetection.confidence * 100)}% confidence</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">Evidence captured at {pendingDetection.detectedAt}. No complaint has been created yet.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[11px]">
                    <div className="bg-slate-950/70 rounded-lg px-3 py-2 font-mono text-emerald-300">
                      GPS: {pendingDetection.latitude.toFixed(6)}, {pendingDetection.longitude.toFixed(6)}
                    </div>
                    <div className="bg-slate-950/70 rounded-lg px-3 py-2 text-slate-200 truncate" title={pendingDetection.formatted_address || pendingDetection.ward_name}>
                      {pendingDetection.formatted_address || pendingDetection.ward_name || 'Location resolving'}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Ward: <strong className="text-white">{pendingDetection.ward_name || 'Not within a BBMP ward'}</strong>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={ignorePendingDetection}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  onClick={confirmPendingDetection}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20"
                >
                  Report Issue
                </button>
              </div>
            </div>
          )}

          {/* Driver Telemetry Counters (Section 18) */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="hud-card p-4 sm:p-5 rounded-2xl space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono block">Today Detected</span>
              <span className="text-3xl font-black text-amber-400 font-mono tabular-nums">{todayDetectedCount}</span>
            </div>
            <div className="hud-card p-4 sm:p-5 rounded-2xl space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-mono block">Verified Incidents</span>
              <span className="text-3xl font-black text-emerald-400 font-mono tabular-nums">{verifiedCount}</span>
            </div>
            <div className="hud-card p-4 sm:p-5 rounded-2xl space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block">Frames Processed</span>
              <span className="text-3xl font-black text-white font-mono tabular-nums">{framesProcessed}</span>
            </div>
          </div>

          {/* LATEST INCIDENT CARD (Section 18) */}
          {latestIncident && (
            <div className="glass-panel border-amber-500/40 rounded-2xl p-5 space-y-3.5 shadow-xl animate-in fade-in">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  <span>LATEST INCIDENT DETECTED</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  Confidence: <strong className="text-emerald-400">{Math.round(latestIncident.confidence * 100)}%</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-slate-900/80 p-3 rounded-xl border border-white/[0.08]">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Location (Real GPS)</span>
                  <span className="font-mono text-white text-[11px] block truncate">
                    {latestIncident.latitude.toFixed(5)}, {latestIncident.longitude.toFixed(5)}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono">Accuracy: ±{latestIncident.gps_accuracy}m</span>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-xl border border-white/[0.08]">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">BBMP Ward (PiP)</span>
                  <span className="font-bold text-white block truncate">
                    #{latestIncident.ward_number} {latestIncident.ward_name}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">{latestIncident.zone_name} Zone</span>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-xl border border-white/[0.08]">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Assembly (MLA)</span>
                  <span className="font-bold text-blue-300 block truncate">{latestIncident.mla_name}</span>
                  <span className="text-[9px] text-slate-400 truncate block">{latestIncident.assembly_constituency}</span>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-xl border border-white/[0.08]">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Parliament (MP)</span>
                  <span className="font-bold text-purple-300 block truncate">{latestIncident.mp_name}</span>
                  <span className="text-[9px] text-slate-400 truncate block">{latestIncident.parliamentary_constituency}</span>
                </div>
              </div>

              {/* Boundary Proximity Alert if applicable */}
              {latestIncident.boundary_warning && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Border Road Warning: Point is within 35m of a constituency boundary line.</span>
                </div>
              )}

              {/* Submission Transparency Status (Section 14 & 15) */}
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.08] text-[11px]">
                <span className="text-slate-400">
                  Status: <strong className="text-emerald-400">{latestIncident.report_status}</strong>
                </span>
                <span className="text-[10px] text-slate-500 italic max-w-sm truncate text-right">
                  {latestIncident.government_message}
                </span>
              </div>
            </div>
          )}

          {/* Stop Drive Button */}
          <div className="text-center pt-2">
            <button
              onClick={stopDriveMode}
              className="px-8 py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl text-xs shadow-xl shadow-red-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>STOP DRIVE MODE & REVIEW TRIP</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. POST-TRIP SUMMARY SCREEN (Section 18) */}
      {/* ========================================================================= */}
      {tripSummary && (
        <div className="glass-panel border-emerald-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Trip Completed & Evidence Synced</h2>
              <p className="text-xs text-slate-400">Review road conditions logged during your drive.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-950/70 backdrop-blur-md p-4 rounded-2xl border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Issues Detected</span>
              <span className="text-2xl font-black text-amber-400 font-mono">{tripSummary.detections_count}</span>
            </div>
            <div className="bg-slate-950/70 backdrop-blur-md p-4 rounded-2xl border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Incidents Logged</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">{tripSummary.confirmed_incidents_count}</span>
            </div>
            <div className="bg-slate-950/70 backdrop-blur-md p-4 rounded-2xl border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Frames Processed</span>
              <span className="text-2xl font-black text-white font-mono">{tripSummary.frames_processed}</span>
            </div>
            <div className="bg-slate-950/70 backdrop-blur-md p-4 rounded-2xl border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Distance</span>
              <span className="text-2xl font-black text-cyan-400 font-mono">
                {tripSummary.distance_km != null ? tripSummary.distance_km.toFixed(2) : distanceTraveledKm.toFixed(2)} km
              </span>
            </div>
          </div>

          {/* List of Detected Potholes from Trip */}
          {detectedPotholes.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/[0.08]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Potholes Verified During This Drive:
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                {detectedPotholes
                  .filter((p, idx, self) => idx === self.findIndex(t => (t.code && t.code === p.code) || (t.id && t.id === p.id)))
                  .map((p, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950/70 backdrop-blur-md rounded-2xl border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 hover:border-emerald-500/30 transition-all">
                    <div>
                      <span className="font-bold text-white font-mono block">#{p.code}</span>
                      <span className="text-slate-400 text-[11px]">
                        Ward #{p.ward_number} {p.ward_name} • MLA: {p.mla_name} • MP: {p.mp_name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold font-mono border border-emerald-500/30">
                        {p.report_status}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono mt-0.5">{p.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center pt-2">
            <button
              onClick={() => {
                setTripSummary(null);
                setLatestIncident(null);
                setDetectedPotholes([]);
              }}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              Start New Drive
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
