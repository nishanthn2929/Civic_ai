import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Database, Upload, CheckCircle2, AlertTriangle, ShieldCheck, 
  RefreshCw, Download, Search, Globe, Crosshair, Layers, FileCode, Check, Eye
} from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { adminService } from '../../services/api';

// Custom Marker for GPS Testing
const testGpsIcon = L.divIcon({
  className: 'test-gps-marker',
  html: `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -100%);">
      <div style="width: 28px; height: 28px; border-radius: 50% 50% 50% 0; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); transform: rotate(-45deg); border: 2px solid #ffffff; box-shadow: 0 4px 14px rgba(236, 72, 153, 0.6); display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #ffffff; transform: rotate(45deg);"></div>
      </div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 34]
});

// Map Controller for click and flyTo
function MapController({ center, zoom, onMapClick }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom || map.getZoom(), { duration: 0.8 });
    }
  }, [center, zoom, map]);

  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export default function BbmpWardManager() {
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [geojsonData, setGeojsonData] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Map states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedWard, setSelectedWard] = useState(null);
  const [mapCenter, setMapCenter] = useState([12.9716, 77.5946]);
  const [mapZoom, setMapZoom] = useState(11);

  // Point-in-polygon tester
  const [testCoords, setTestCoords] = useState({ lat: 12.9352, lon: 77.6245 });
  const [testResult, setTestResult] = useState(null);
  const [testingGps, setTestingGps] = useState(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [validationReport, setValidationReport] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [importMeta, setImportMeta] = useState({
    source_name: 'BBMP Final Wards Map - 2023',
    source_organization: 'Government of Karnataka, Urban Development Department (UDD) / BBMP',
    source_url: 'https://data.opencity.in/dataset/bbmp-wards-delimitation-2023',
    dataset_version: 'BBMP-225-2023-V2',
    dataset_date: '2023-09-25',
    license_info: 'Open Government Data (OGD) Karnataka / Public Record'
  });
  const [uploading, setUploading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const geoJsonLayerRef = useRef(null);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [info, geo, bkups] = await Promise.all([
        adminService.getWardDatasetInfo(),
        adminService.getWardGeoJson(),
        adminService.getWardBackups()
      ]);
      setDatasetInfo(info);
      setGeojsonData(geo);
      setBackups(bkups);

      // Run initial test detect on Koramangala
      runTestDetect(12.9352, 77.6245);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Error loading BBMP ward data: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const runTestDetect = async (lat, lon) => {
    setTestingGps(true);
    setTestCoords({ lat, lon });
    try {
      const res = await adminService.detectWard(lat, lon);
      setTestResult(res);
      if (res.is_within_bengaluru && res.ward_number) {
        setSelectedWard({
          ward_number: res.ward_number,
          ward_name: res.ward_name,
          zone_name: res.zone_name,
          geometry: res.geometry
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingGps(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const results = await adminService.searchWards(searchQuery);
      setSearchResults(results);
      if (results.length > 0) {
        const first = results[0];
        zoomToWard(first);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const zoomToWard = (ward) => {
    setSelectedWard(ward);
    // Find approximate centroid from coordinates
    try {
      if (ward.geometry && ward.geometry.coordinates) {
        let firstCoord;
        if (ward.geometry.type === 'MultiPolygon') {
          firstCoord = ward.geometry.coordinates[0][0][0];
        } else {
          firstCoord = ward.geometry.coordinates[0][0];
        }
        if (firstCoord) {
          setMapCenter([firstCoord[1], firstCoord[0]]);
          setMapZoom(13);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportGeoJson = () => {
    if (!geojsonData) return;
    const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bengaluru_bbmp_wards_${datasetInfo?.dataset_version || 'official'}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleValidateFile = async () => {
    if (!uploadFile) {
      alert('Please select a file to validate (.geojson, .kml, or shapefile .zip)');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('source_name', importMeta.source_name);
      const report = await adminService.validateWardDataset(formData);
      setValidationReport(report);
    } catch (err) {
      alert('Validation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Please choose a file to import.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('source_name', importMeta.source_name);
      formData.append('source_organization', importMeta.source_organization);
      formData.append('source_url', importMeta.source_url);
      formData.append('dataset_version', importMeta.dataset_version);
      formData.append('dataset_date', importMeta.dataset_date);
      formData.append('license_info', importMeta.license_info);

      const res = await adminService.importWardDataset(formData);
      setActionMessage({
        type: 'success',
        text: `Successfully imported ${res.ward_count} wards! Previous dataset backed up to: ${res.backup_file || 'backups directory'}.`
      });
      setShowImportModal(false);
      setUploadFile(null);
      setValidationReport(null);
      loadAllData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'object' ? detail.error : (detail || err.message);
      setActionMessage({ type: 'error', text: 'Import rejected: ' + errorMsg });
      if (typeof detail === 'object' && detail.validation_report) {
        setValidationReport(detail.validation_report);
      }
    } finally {
      setUploading(false);
    }
  };

  // GeoJSON style for Leaflet polygons
  const getFeatureStyle = (feature) => {
    const isSelected = selectedWard && selectedWard.ward_number === feature.properties.ward_number;
    return {
      fillColor: isSelected ? '#10b981' : '#3b82f6',
      weight: isSelected ? 3 : 1.2,
      opacity: 1,
      color: isSelected ? '#34d399' : '#60a5fa',
      dashArray: isSelected ? '' : '2',
      fillOpacity: isSelected ? 0.45 : 0.15
    };
  };

  const onEachFeature = (feature, layer) => {
    const p = feature.properties;
    layer.on({
      click: () => {
        zoomToWard({
          ward_number: p.ward_number,
          ward_name: p.ward_name,
          zone_name: p.zone_name,
          assembly_constituency: p.assembly_constituency,
          parliament_constituency: p.parliament_constituency,
          geometry: feature.geometry
        });
      },
      mouseover: (e) => {
        const l = e.target;
        if (!selectedWard || selectedWard.ward_number !== p.ward_number) {
          l.setStyle({ fillOpacity: 0.35, weight: 2 });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (!selectedWard || selectedWard.ward_number !== p.ward_number) {
          l.setStyle({ fillOpacity: 0.15, weight: 1.2 });
        }
      }
    });
    layer.bindTooltip(
      `<strong>Ward #${p.ward_number}</strong>: ${p.ward_name}<br><span style="color:#94a3b8;font-size:10px;">${p.zone_name || 'BBMP'} Zone</span>`,
      { sticky: true, className: 'ward-tooltip' }
    );
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {actionMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold underline text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* Official Government Source Transparency Header (Requirement 11) */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 rounded-full text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>BBMP Ward Boundaries — Official Government Source</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Authoritative Municipal Ward Boundary GIS Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
              Authentic spatial polygons delimited by the Government of Karnataka and BBMP GIS Cell. All incident geotags are matched using genuine Point-in-Polygon calculations without PIN-code or locality guessing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setIsReplaceMode(false);
                setShowImportModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import Ward Dataset</span>
            </button>
            <button
              onClick={() => {
                setIsReplaceMode(true);
                setShowImportModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Replace Dataset</span>
            </button>
            <button
              onClick={handleExportGeoJson}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export GeoJSON</span>
            </button>
          </div>
        </div>

        {/* Dataset Metadata Grid (Requirement 2 & 10) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Dataset Source</span>
            <span className="font-semibold text-white truncate block" title={datasetInfo?.dataset_source}>
              {datasetInfo?.dataset_source || 'Loading...'}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Version</span>
            <span className="font-semibold text-emerald-400 truncate block">
              {datasetInfo?.dataset_version || 'N/A'}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Dataset Date</span>
            <span className="font-semibold text-white">
              {datasetInfo?.dataset_date || 'N/A'}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Last Imported</span>
            <span className="font-semibold text-white truncate block">
              {datasetInfo?.last_imported ? datasetInfo.last_imported.split('T')[0] : 'Today'}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">CRS (Verified)</span>
            <span className="font-semibold text-purple-400 font-mono">
              {datasetInfo?.coordinate_system || 'EPSG:4326'}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Total Wards</span>
            <span className="font-black text-white text-sm">
              {datasetInfo?.total_wards || 0}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Valid Wards</span>
            <span className="font-black text-emerald-400 text-sm">
              {datasetInfo?.valid_wards || 0}
            </span>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Invalid Wards</span>
            <span className={`font-black text-sm ${datasetInfo?.invalid_wards > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {datasetInfo?.invalid_wards || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Main Map & Interactive Inspector (Requirement 8) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Leaflet Ward Boundary Map */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">Official BBMP Ward Boundaries Map</h3>
              <span className="text-[10px] text-slate-400 font-mono">({datasetInfo?.total_wards || 0} Polygons Loaded)</span>
            </div>

            {/* Quick Search */}
            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Ward No. or Name..."
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-48"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Map Container */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800 h-[520px] bg-slate-950">
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
                onMapClick={(lat, lon) => runTestDetect(lat, lon)}
              />
              {geojsonData && (
                <GeoJSON
                  ref={geoJsonLayerRef}
                  key={datasetInfo?.dataset_version || 'wards'}
                  data={geojsonData}
                  style={getFeatureStyle}
                  onEachFeature={onEachFeature}
                />
              )}
              {testCoords && (
                <Marker position={[testCoords.lat, testCoords.lon]} icon={testGpsIcon} />
              )}
            </MapContainer>

            {/* Map Overlay Helper */}
            <div className="absolute bottom-3 left-3 pointer-events-none z-[400] bg-slate-950/85 backdrop-blur border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 space-y-1 shadow-lg max-w-xs">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Live Point-in-Polygon Tester</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Click anywhere on the map to test authoritative ward polygon containment for that exact GPS point.
              </p>
            </div>
          </div>
        </div>

        {/* Right Col: Inspector & Point-in-Polygon Tester */}
        <div className="space-y-4">
          {/* Selected Ward Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Ward Polygon Inspector</span>
              </h4>
              {selectedWard && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  Ward #{selectedWard.ward_number}
                </span>
              )}
            </div>

            {selectedWard ? (
              <div className="space-y-2.5 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Ward Name</span>
                  <p className="text-sm font-bold text-white">{selectedWard.ward_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Zone</span>
                    <span className="font-semibold text-slate-200">{selectedWard.zone_name || 'BBMP Central'}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Ward No.</span>
                    <span className="font-semibold text-emerald-400 font-mono">#{selectedWard.ward_number}</span>
                  </div>
                </div>
                {selectedWard.assembly_constituency && (
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Assembly (MLA)</span>
                    <span className="text-slate-300 font-medium">{selectedWard.assembly_constituency}</span>
                  </div>
                )}
                {selectedWard.parliament_constituency && (
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Parliament (MP)</span>
                    <span className="text-slate-300 font-medium">{selectedWard.parliament_constituency}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-4 text-center">
                Click any polygon on the map or search above to inspect ward properties.
              </p>
            )}
          </div>

          {/* GPS Point-in-Polygon Tester Card (Requirement 7 & 9) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-pink-400" />
              <span>GPS Point-in-Polygon Tester</span>
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-500 font-mono block mb-1">LATITUDE</label>
                <input
                  type="number"
                  step="any"
                  value={testCoords.lat}
                  onChange={(e) => setTestCoords({ ...testCoords, lat: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-mono block mb-1">LONGITUDE</label>
                <input
                  type="number"
                  step="any"
                  value={testCoords.lon}
                  onChange={(e) => setTestCoords({ ...testCoords, lon: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => runTestDetect(testCoords.lat, testCoords.lon)}
              disabled={testingGps}
              className="w-full py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {testingGps ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              <span>Test Coordinates Against Ward Polygons</span>
            </button>

            {/* Test Result Display */}
            {testResult && (
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                testResult.is_within_bengaluru 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>{testResult.is_within_bengaluru ? 'Inside BBMP Jurisdiction' : 'Outside BBMP Boundary'}</span>
                  <span className="font-mono text-[10px]">{testResult.detection_method}</span>
                </div>
                <p className="font-semibold text-white">
                  {testResult.is_within_bengaluru
                    ? `Ward #${testResult.ward_number}: ${testResult.ward_name}`
                    : testResult.ward_name}
                </p>
                {testResult.formatted_address && (
                  <p className="text-[11px] text-slate-400">{testResult.formatted_address}</p>
                )}
                <div className="pt-1 text-[10px] text-slate-500 font-mono">
                  Source: {testResult.source_verification || 'BBMP GIS Cell'}
                </div>
              </div>
            )}
          </div>

          {/* Historical Preserved Backups (Requirement 10) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Preserved Dataset Backups</span>
            </h4>
            {backups.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs pr-1">
                {backups.map((b, idx) => (
                  <div key={idx} className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="font-mono text-[10px] text-slate-300 truncate block">{b.filename}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{b.created_at.split('T')[0]} • {(b.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono shrink-0">Saved</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No previous backups yet. Backups are automatically generated prior to replacement.</p>
            )}
          </div>
        </div>
      </div>

      {/* Import / Replace & Validate Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  {isReplaceMode ? 'Safely Replace BBMP Ward Dataset' : 'Import New BBMP Ward Dataset'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setValidationReport(null);
                }}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {isReplaceMode && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  <strong>Backup Guard Enabled:</strong> An automated backup of the currently active dataset will be saved into the backups directory before replacing. Replacement will be automatically rejected if validation does not pass 100%.
                </span>
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
              {/* File Upload Input */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Select Dataset File (.geojson, .json, .kml, .kmz, or Shapefile .zip):
                </label>
                <input
                  type="file"
                  accept=".geojson,.json,.kml,.kmz,.zip"
                  onChange={(e) => {
                    setUploadFile(e.target.files[0]);
                    setValidationReport(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400"
                />
              </div>

              {/* Source Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Source Name:</label>
                  <input
                    type="text"
                    value={importMeta.source_name}
                    onChange={(e) => setImportMeta({ ...importMeta, source_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Source Organization:</label>
                  <input
                    type="text"
                    value={importMeta.source_organization}
                    onChange={(e) => setImportMeta({ ...importMeta, source_organization: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Source URL:</label>
                  <input
                    type="text"
                    value={importMeta.source_url}
                    onChange={(e) => setImportMeta({ ...importMeta, source_url: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Dataset Version Tag:</label>
                  <input
                    type="text"
                    value={importMeta.dataset_version}
                    onChange={(e) => setImportMeta({ ...importMeta, dataset_version: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Validation Report Card (Requirement 5) */}
              {validationReport && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Dataset Validation Report:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      validationReport.is_valid 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {validationReport.is_valid ? 'PASSED (100% VALID)' : 'VALIDATION FAILED'}
                    </span>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-300 bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre leading-relaxed">
                    {validationReport.validation_report}
                  </pre>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleValidateFile}
                  disabled={uploading || !uploadFile}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Validating...' : 'Validate Dataset First'}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Processing...' : (isReplaceMode ? 'Validate & Replace' : 'Validate & Import')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
