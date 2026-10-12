import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Database, Upload, CheckCircle2, AlertTriangle, ShieldCheck, 
  RefreshCw, Download, Search, Globe, Crosshair, Layers, FileCode, Check, Eye,
  Edit3, UserCheck, Landmark, Compass, ExternalLink, Shield, Filter, Award, AlertCircle, Save
} from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
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

// Custom Icon for Civic Issue Points (Color-coded by severity)
const createIncidentIcon = (severity) => {
  let color = '#3b82f6';
  if (severity === 'CRITICAL') color = '#ef4444';
  else if (severity === 'HIGH') color = '#f97316';
  else if (severity === 'MEDIUM') color = '#eab308';
  else if (severity === 'LOW') color = '#10b981';

  return L.divIcon({
    className: 'custom-incident-pin',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="background-color: #ffffff; width: 5px; height: 5px; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  });
};

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

// Party Badge color styling
const getPartyBadgeStyle = (party) => {
  const p = (party || '').toUpperCase();
  if (p.includes('BJP') || p.includes('BHARATIYA')) {
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  } else if (p.includes('INC') || p.includes('CONGRESS')) {
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  } else if (p.includes('JD') || p.includes('SECULAR')) {
    return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  }
  return 'bg-slate-700/50 text-slate-300 border border-slate-600';
};

export default function BbmpWardManager() {
  // Navigation tabs: 'map' | 'representatives' | 'datasets'
  const [activeTab, setActiveTab] = useState('map');

  // Core Data States
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [gisLayers, setGisLayers] = useState({
    layer_incidents: null,
    layer_wards: null,
    layer_assembly_constituencies: null,
    layer_parliamentary_constituencies: null
  });
  const [representatives, setRepresentatives] = useState({
    mlas: [],
    mps: [],
    mla_count: 0,
    mp_count: 0
  });
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Layer Toggles for Leaflet Map
  const [layerVisibility, setLayerVisibility] = useState({
    incidents: true,   // Layer 1: Civic Issue GPS points
    wards: true,       // Layer 2: BBMP Wards (green)
    assembly: true,    // Layer 3: Assembly Constituencies (blue)
    parliament: true   // Layer 4: Parliamentary Constituencies (purple)
  });

  // Map & Inspector States
  const [mapType, setMapType] = useState('default'); // 'default' | 'satellite'
  const [mapCenter, setMapCenter] = useState([12.9716, 77.5946]);
  const [mapZoom, setMapZoom] = useState(11);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null); // { type: 'ward'|'ac'|'pc'|'incident', data: ... }

  // Point-in-polygon tester
  const [testCoords, setTestCoords] = useState({ lat: 12.9352, lon: 77.6245 });
  const [testResult, setTestResult] = useState(null);
  const [testingGps, setTestingGps] = useState(false);

  // Representatives Tab Filter & Edit States
  const [repFilter, setRepFilter] = useState('all'); // 'all' | 'mla' | 'mp'
  const [repSearch, setRepSearch] = useState('');
  const [editingRep, setEditingRep] = useState(null); // rep object with rep_type
  const [repFormData, setRepFormData] = useState({
    name: '',
    party: '',
    term: '',
    official_profile_url: '',
    contact_email: '',
    contact_phone: '',
    source: ''
  });
  const [savingRep, setSavingRep] = useState(false);

  // Dataset Import/Replace Modal States
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

  const runTestDetect = async (lat, lon) => {
    setTestingGps(true);
    setTestCoords({ lat, lon });
    try {
      const res = await adminService.detectWard(lat, lon);
      setTestResult(res);
      if (res.is_within_bengaluru && res.ward_number) {
        setSelectedEntity({
          type: 'test_result',
          data: res
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingGps(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [info, bkups, reps, layersRes] = await Promise.all([
        adminService.getWardDatasetInfo().catch(() => null),
        adminService.getWardBackups().catch(() => []),
        adminService.getRepresentatives().catch(() => ({ mlas: [], mps: [], mla_count: 0, mp_count: 0 })),
        adminService.getGisLayers().catch(() => null)
      ]);
      setDatasetInfo(info);
      setBackups(bkups);
      setRepresentatives(reps);
      if (layersRes) {
        setGisLayers(layersRes);
      } else {
        const fallbackWards = await adminService.getWardGeoJson().catch(() => null);
        setGisLayers({
          layer_incidents: { type: 'FeatureCollection', features: [] },
          layer_wards: fallbackWards,
          layer_assembly_constituencies: null,
          layer_parliamentary_constituencies: null
        });
      }
      // Run initial test detect on Koramangala
      runTestDetect(12.9352, 77.6245);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Error loading GIS data: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const results = await adminService.searchWards(searchQuery);
      setSearchResults(results);
      if (results.length > 0) {
        const first = results[0];
        zoomToGeometry(first.geometry, {
          type: 'ward',
          data: first
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const zoomToGeometry = (geometry, entity) => {
    setSelectedEntity(entity);
    try {
      if (geometry && geometry.coordinates) {
        let firstCoord;
        if (geometry.type === 'MultiPolygon') {
          firstCoord = geometry.coordinates[0][0][0];
        } else if (geometry.type === 'Polygon') {
          firstCoord = geometry.coordinates[0][0];
        } else if (geometry.type === 'Point') {
          firstCoord = geometry.coordinates;
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

  const toggleLayer = (layerKey) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerKey]: !prev[layerKey]
    }));
  };

  // --- Layer Styles & Handlers ---

  // Layer 2: BBMP Wards (Green outlines)
  const getWardStyle = (feature) => {
    const isSelected = selectedEntity?.type === 'ward' && 
      selectedEntity?.data?.ward_number === feature.properties.ward_number;
    return {
      fillColor: isSelected ? '#10b981' : '#059669',
      weight: isSelected ? 3 : 1.2,
      opacity: 0.9,
      color: isSelected ? '#34d399' : '#10b981',
      dashArray: isSelected ? '' : '2',
      fillOpacity: isSelected ? 0.35 : 0.10
    };
  };

  const onEachWard = (feature, layer) => {
    const p = feature.properties;
    layer.on({
      click: () => {
        setSelectedEntity({
          type: 'ward',
          data: p
        });
      },
      mouseover: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'ward' || selectedEntity?.data?.ward_number !== p.ward_number) {
          l.setStyle({ fillOpacity: 0.28, weight: 2 });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'ward' || selectedEntity?.data?.ward_number !== p.ward_number) {
          l.setStyle({ fillOpacity: 0.10, weight: 1.2 });
        }
      }
    });
    layer.bindTooltip(
      `<strong>BBMP Ward #${p.ward_number}</strong>: ${p.ward_name}<br><span style="color:#94a3b8;font-size:10px;">${p.zone_name || 'BBMP'} Zone</span>`,
      { sticky: true, className: 'gis-tooltip' }
    );
  };

  // Layer 3: Assembly Constituencies (Blue outlines)
  const getAcStyle = (feature) => {
    const isSelected = selectedEntity?.type === 'ac' && 
      selectedEntity?.data?.constituency_number === feature.properties.constituency_number;
    return {
      fillColor: isSelected ? '#3b82f6' : '#2563eb',
      weight: isSelected ? 3.5 : 2,
      opacity: 0.95,
      color: isSelected ? '#60a5fa' : '#3b82f6',
      dashArray: isSelected ? '' : '5, 5',
      fillOpacity: isSelected ? 0.30 : 0.08
    };
  };

  const onEachAc = (feature, layer) => {
    const p = feature.properties;
    layer.on({
      click: () => {
        setSelectedEntity({
          type: 'ac',
          data: p
        });
      },
      mouseover: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'ac' || selectedEntity?.data?.constituency_number !== p.constituency_number) {
          l.setStyle({ fillOpacity: 0.25, weight: 3 });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'ac' || selectedEntity?.data?.constituency_number !== p.constituency_number) {
          l.setStyle({ fillOpacity: 0.08, weight: 2 });
        }
      }
    });
    layer.bindTooltip(
      `<strong>AC #${p.constituency_number}: ${p.constituency_name}</strong><br><span style="color:#60a5fa;font-size:10px;">MLA: ${p.mla_name || 'N/A'} (${p.mla_party || ''})</span>`,
      { sticky: true, className: 'gis-tooltip' }
    );
  };

  // Layer 4: Parliamentary Constituencies (Purple outlines)
  const getPcStyle = (feature) => {
    const isSelected = selectedEntity?.type === 'pc' && 
      selectedEntity?.data?.constituency_number === feature.properties.constituency_number;
    return {
      fillColor: isSelected ? '#a855f7' : '#9333ea',
      weight: isSelected ? 4 : 2.5,
      opacity: 0.95,
      color: isSelected ? '#c084fc' : '#a855f7',
      dashArray: isSelected ? '' : '8, 6',
      fillOpacity: isSelected ? 0.25 : 0.05
    };
  };

  const onEachPc = (feature, layer) => {
    const p = feature.properties;
    layer.on({
      click: () => {
        setSelectedEntity({
          type: 'pc',
          data: p
        });
      },
      mouseover: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'pc' || selectedEntity?.data?.constituency_number !== p.constituency_number) {
          l.setStyle({ fillOpacity: 0.20, weight: 3.5 });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (selectedEntity?.type !== 'pc' || selectedEntity?.data?.constituency_number !== p.constituency_number) {
          l.setStyle({ fillOpacity: 0.05, weight: 2.5 });
        }
      }
    });
    layer.bindTooltip(
      `<strong>PC #${p.constituency_number}: ${p.constituency_name}</strong><br><span style="color:#c084fc;font-size:10px;">MP: ${p.mp_name || 'N/A'} (${p.mp_party || ''})</span>`,
      { sticky: true, className: 'gis-tooltip' }
    );
  };

  // --- Representatives Management Handlers ---
  const handleOpenEditRep = (rep, type) => {
    setEditingRep({ ...rep, rep_type: type });
    setRepFormData({
      name: rep.name || '',
      party: rep.party || '',
      term: rep.term || '',
      official_profile_url: rep.official_profile_url || '',
      contact_email: rep.contact_email || '',
      contact_phone: rep.contact_phone || '',
      source: rep.source || ''
    });
  };

  const handleSaveRep = async (e) => {
    e.preventDefault();
    if (!editingRep) return;
    setSavingRep(true);
    try {
      if (editingRep.rep_type === 'mla') {
        await adminService.updateMla(editingRep.id, repFormData);
        setActionMessage({
          type: 'success',
          text: `Successfully updated MLA ${repFormData.name} for ${editingRep.constituency_name}. Official last verified date refreshed to now.`
        });
      } else {
        await adminService.updateMp(editingRep.id, repFormData);
        setActionMessage({
          type: 'success',
          text: `Successfully updated MP ${repFormData.name} for ${editingRep.constituency_name}. Official last verified date refreshed to now.`
        });
      }
      setEditingRep(null);
      // Reload reps and GIS layers so map tooltips and tables update immediately
      const [reps, layersRes] = await Promise.all([
        adminService.getRepresentatives(),
        adminService.getGisLayers()
      ]);
      setRepresentatives(reps);
      if (layersRes) setGisLayers(layersRes);
    } catch (err) {
      alert('Failed to update representative: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingRep(false);
    }
  };

  // --- Dataset Import/Export Handlers ---
  const handleExportGeoJson = () => {
    const exportData = gisLayers.layer_wards;
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
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

  // Filter representatives
  const filteredMlas = representatives.mlas.filter(m => {
    if (!repSearch.trim()) return true;
    const q = repSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) ||
      m.constituency_name.toLowerCase().includes(q) ||
      m.party.toLowerCase().includes(q) ||
      String(m.constituency_number).includes(q);
  });

  const filteredMps = representatives.mps.filter(m => {
    if (!repSearch.trim()) return true;
    const q = repSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) ||
      m.constituency_name.toLowerCase().includes(q) ||
      m.party.toLowerCase().includes(q) ||
      String(m.constituency_number).includes(q);
  });

  const incidentFeatures = gisLayers.layer_incidents?.features || [];

  return (
    <div className="space-y-6">
      {/* Action Banner */}
      {actionMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="font-bold underline text-xs ml-4 hover:opacity-80">Dismiss</button>
        </div>
      )}

      {/* Main Feature Navigation Bar */}
      <div className="glass-panel p-2.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'map'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Multi-Layer GIS Map</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-mono">
              4 Layers
            </span>
          </button>

          <button
            onClick={() => setActiveTab('representatives')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'representatives'
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25 font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Elected Representatives (MLA & MP)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-mono">
              {representatives.mla_count + representatives.mp_count}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('datasets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'datasets'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25 font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Boundary Datasets & Backups</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-mono">
              {datasetInfo?.total_wards || 198} Wards
            </span>
          </button>
        </div>

        <button
          onClick={loadAllData}
          disabled={loading}
          className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.1] transition-colors disabled:opacity-50"
          title="Refresh All GIS Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MULTI-LAYER GIS MAP VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          {/* Layer Control Bar & Map Toggles */}
          <div className="glass-panel p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>GIS Layers:</span>
              </span>

              {/* Layer 1: Incidents */}
              <button
                type="button"
                onClick={() => toggleLayer('incidents')}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-bold transition-all text-xs ${
                  layerVisibility.incidents
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-sm'
                    : 'bg-slate-950/50 border-white/[0.08] text-slate-500 opacity-60'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${layerVisibility.incidents ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`} />
                <span>Layer 1: Issues ({incidentFeatures.length})</span>
              </button>

              {/* Layer 2: BBMP Wards */}
              <button
                type="button"
                onClick={() => toggleLayer('wards')}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-bold transition-all text-xs ${
                  layerVisibility.wards
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/50 border-white/[0.08] text-slate-500 opacity-60'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${layerVisibility.wards ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                <span>Layer 2: BBMP Wards ({datasetInfo?.total_wards || 198})</span>
              </button>

              {/* Layer 3: Assembly Constituencies */}
              <button
                type="button"
                onClick={() => toggleLayer('assembly')}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-bold transition-all text-xs ${
                  layerVisibility.assembly
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm'
                    : 'bg-slate-950/50 border-white/[0.08] text-slate-500 opacity-60'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${layerVisibility.assembly ? 'bg-blue-500' : 'bg-slate-600'}`} />
                <span>Layer 3: Assembly / MLAs ({representatives.mla_count || 27})</span>
              </button>

              {/* Layer 4: Parliamentary Constituencies */}
              <button
                type="button"
                onClick={() => toggleLayer('parliament')}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-bold transition-all text-xs ${
                  layerVisibility.parliament
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-sm'
                    : 'bg-slate-950/50 border-white/[0.08] text-slate-500 opacity-60'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${layerVisibility.parliament ? 'bg-purple-500' : 'bg-slate-600'}`} />
                <span>Layer 4: Lok Sabha / MPs ({representatives.mp_count || 4})</span>
              </button>
            </div>

            {/* Quick Search */}
            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Ward No. or Name..."
                className="bg-slate-950/80 border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 w-52 transition-all"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 transition-colors border border-white/[0.1]"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Main Map & Inspector Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Leaflet Map */}
            <div className="lg:col-span-2 glass-panel rounded-3xl p-4 shadow-xl flex flex-col space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.12] h-[560px] bg-slate-950 shadow-2xl">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  scrollWheelZoom={true}
                  className="w-full h-full z-0"
                >
                  {/* Tile layer: Default white theme vs Satellite */}
                  {mapType === 'default' ? (
                    <TileLayer
                      key="tile-default-light"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      maxZoom={20}
                    />
                  ) : (
                    <>
                      <TileLayer
                        key="tile-satellite"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={19}
                      />
                      <TileLayer
                        key="tile-satellite-labels"
                        attribution='&copy; Esri'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={19}
                      />
                    </>
                  )}

                  <MapController
                    center={mapCenter}
                    zoom={mapZoom}
                    onMapClick={(lat, lon) => runTestDetect(lat, lon)}
                  />

                  {/* LAYER 4: Parliamentary Constituencies (Rendered bottom) */}
                  {layerVisibility.parliament && gisLayers.layer_parliamentary_constituencies && (
                    <GeoJSON
                      key={`layer-pc-${mapType}`}
                      data={gisLayers.layer_parliamentary_constituencies}
                      style={getPcStyle}
                      onEachFeature={onEachPc}
                    />
                  )}

                  {/* LAYER 3: Assembly Constituencies */}
                  {layerVisibility.assembly && gisLayers.layer_assembly_constituencies && (
                    <GeoJSON
                      key={`layer-ac-${mapType}`}
                      data={gisLayers.layer_assembly_constituencies}
                      style={getAcStyle}
                      onEachFeature={onEachAc}
                    />
                  )}

                  {/* LAYER 2: BBMP Wards */}
                  {layerVisibility.wards && gisLayers.layer_wards && (
                    <GeoJSON
                      key={`layer-wards-${mapType}`}
                      data={gisLayers.layer_wards}
                      style={getWardStyle}
                      onEachFeature={onEachWard}
                    />
                  )}

                  {/* LAYER 1: Civic Issue GPS Points (Rendered top as clickable markers) */}
                  {layerVisibility.incidents && incidentFeatures.map((feat) => {
                    const coords = feat.geometry?.coordinates;
                    if (!coords || coords.length < 2) return null;
                    const p = feat.properties;
                    return (
                      <Marker
                        key={`inc-${p.id || p.incident_code}`}
                        position={[coords[1], coords[0]]}
                        icon={createIncidentIcon(p.severity)}
                        eventHandlers={{
                          click: () => {
                            setSelectedEntity({
                              type: 'incident',
                              data: { ...p, latitude: coords[1], longitude: coords[0] }
                            });
                          }
                        }}
                      >
                        <Popup className="custom-leaflet-popup">
                          <div className="p-1 min-w-[220px] text-slate-900 text-xs">
                            <div className="flex items-center justify-between border-b pb-1 mb-1.5">
                              <span className="font-bold text-slate-900 font-mono">#{p.incident_code}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                p.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                p.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                p.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {p.severity}
                              </span>
                            </div>
                            <p className="font-bold text-slate-800 text-[11px] mb-1">{p.title || p.category}</p>
                            <div className="space-y-0.5 text-[10px] text-slate-600">
                              <div><strong>Ward:</strong> {p.ward_number ? `#${p.ward_number} ${p.ward_name}` : 'N/A'}</div>
                              <div><strong>MLA:</strong> {p.mla_name ? `${p.mla_name} (${p.mla_party})` : 'N/A'}</div>
                              <div><strong>MP:</strong> {p.mp_name ? `${p.mp_name} (${p.mp_party})` : 'N/A'}</div>
                              <div className="flex items-center gap-1 mt-1 pt-1 border-t">
                                <span className="font-semibold text-slate-500">Source:</span>
                                <span className="font-mono">{p.photo_gps_available ? 'EXIF GPS' : (p.location_source || 'DEVICE_GPS')}</span>
                              </div>
                              {p.boundary_warning && (
                                <div className="mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[9px] flex items-center gap-1">
                                  <span>Near Constituency Border (&lt;35m)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {/* GPS Test Marker */}
                  {testCoords && (
                    <Marker position={[testCoords.lat, testCoords.lon]} icon={testGpsIcon} />
                  )}
                </MapContainer>

                {/* Map Type Switcher (Default vs Satellite) */}
                <div className="absolute top-3 right-3 z-[400] bg-slate-950/90 backdrop-blur-md rounded-xl p-1 border border-white/[0.12] shadow-xl flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMapType('default')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      mapType === 'default'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                    title="Default white theme vector streets"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>White Theme</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapType('satellite')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      mapType === 'satellite'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Satellite</span>
                  </button>
                </div>

                {/* Map Overlay Helper */}
                <div className="absolute bottom-3 left-3 pointer-events-none z-[400] bg-slate-950/90 backdrop-blur-md border border-white/[0.1] rounded-xl p-3 text-[11px] text-slate-300 space-y-1 shadow-xl max-w-xs">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Interactive Jurisdiction Inspector</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Click any ward, constituency, or GPS issue point to inspect official jurisdiction properties.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Col: Inspector & Point-in-Polygon Tester */}
            <div className="space-y-4">
              {/* Selected Entity Card */}
              <div className="glass-panel rounded-3xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                    <Compass className="w-4 h-4 text-purple-400" />
                    <span>Jurisdiction Inspector</span>
                  </h4>
                  {selectedEntity && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold bg-white/[0.05] text-slate-300 border border-white/[0.1] font-mono">
                      {selectedEntity.type}
                    </span>
                  )}
                </div>

                {selectedEntity ? (
                  <div className="space-y-2.5 text-xs">
                    {/* If Incident Selected */}
                    {selectedEntity.type === 'incident' && (
                      <div className="space-y-2">
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-white/[0.08] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-mono">INCIDENT #{selectedEntity.data.incident_code}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              selectedEntity.data.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' :
                              selectedEntity.data.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {selectedEntity.data.severity}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-white">{selectedEntity.data.title || selectedEntity.data.category}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            GPS: {selectedEntity.data.latitude?.toFixed(6)}, {selectedEntity.data.longitude?.toFixed(6)}
                          </p>
                        </div>

                        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08] space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-mono block">Location Source</span>
                          <span className="text-emerald-400 font-semibold font-mono">
                            {selectedEntity.data.photo_gps_available ? 'EXIF GPS (Photo Header)' : (selectedEntity.data.location_source || 'DEVICE_GPS')}
                          </span>
                        </div>

                        {selectedEntity.data.boundary_warning && (
                          <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-amber-300 text-[11px] flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                            <span>This point lies within 35m of a constituency boundary road/median.</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[9px] text-slate-500 font-mono uppercase block">BBMP Ward</span>
                            <span className="text-white font-semibold block truncate">#{selectedEntity.data.ward_number} {selectedEntity.data.ward_name}</span>
                          </div>
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[9px] text-slate-500 font-mono uppercase block">Assembly MLA</span>
                            <span className="text-blue-300 font-semibold block truncate">{selectedEntity.data.mla_name || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* If Ward Selected */}
                    {selectedEntity.type === 'ward' && (
                      <div className="space-y-2">
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-white/[0.08] space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-mono">BBMP Municipal Ward</span>
                          <p className="text-sm font-bold text-white">Ward #{selectedEntity.data.ward_number}: {selectedEntity.data.ward_name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Zone</span>
                            <span className="font-semibold text-slate-200">{selectedEntity.data.zone_name || 'BBMP Central'}</span>
                          </div>
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Ward Number</span>
                            <span className="font-semibold text-emerald-400 font-mono">#{selectedEntity.data.ward_number}</span>
                          </div>
                        </div>
                        {selectedEntity.data.assembly_constituency && (
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Associated Assembly (MLA)</span>
                            <span className="text-slate-200 font-medium">{selectedEntity.data.assembly_constituency}</span>
                          </div>
                        )}
                        {selectedEntity.data.parliament_constituency && (
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Associated Parliament (MP)</span>
                            <span className="text-slate-200 font-medium">{selectedEntity.data.parliament_constituency}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* If AC Selected */}
                    {selectedEntity.type === 'ac' && (
                      <div className="space-y-2">
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-blue-500/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-blue-400 uppercase font-mono">Karnataka Legislative Assembly</span>
                            <span className="text-[10px] font-mono text-slate-400">AC #{selectedEntity.data.constituency_number}</span>
                          </div>
                          <p className="text-sm font-bold text-white">{selectedEntity.data.constituency_name}</p>
                        </div>
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-white/[0.08] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 uppercase font-mono">Sitting MLA</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getPartyBadgeStyle(selectedEntity.data.mla_party)}`}>
                              {selectedEntity.data.mla_party || 'IND'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-200">{selectedEntity.data.mla_name || 'Vacant / Not Seeded'}</p>
                          <span className="text-[10px] text-slate-500 block font-mono">{selectedEntity.data.term || '16th KLA (2023-2028)'}</span>
                        </div>
                      </div>
                    )}

                    {/* If PC Selected */}
                    {selectedEntity.type === 'pc' && (
                      <div className="space-y-2">
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-purple-500/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-purple-400 uppercase font-mono">Lok Sabha Parliamentary Constituency</span>
                            <span className="text-[10px] font-mono text-slate-400">PC #{selectedEntity.data.constituency_number}</span>
                          </div>
                          <p className="text-sm font-bold text-white">{selectedEntity.data.constituency_name}</p>
                        </div>
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-white/[0.08] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 uppercase font-mono">Member of Parliament (MP)</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getPartyBadgeStyle(selectedEntity.data.mp_party)}`}>
                              {selectedEntity.data.mp_party || 'IND'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-200">{selectedEntity.data.mp_name || 'Vacant / Not Seeded'}</p>
                          <span className="text-[10px] text-slate-500 block font-mono">{selectedEntity.data.term || '18th Lok Sabha (2024-2029)'}</span>
                        </div>
                      </div>
                    )}

                    {/* If Test Result Selected */}
                    {selectedEntity.type === 'test_result' && (
                      <div className="space-y-2">
                        <div className="bg-slate-950/80 p-3 rounded-2xl border border-pink-500/30 space-y-1">
                          <span className="text-[10px] text-pink-400 uppercase font-mono">Point-in-Polygon Result</span>
                          <p className="text-sm font-bold text-white">
                            {selectedEntity.data.is_within_bengaluru
                              ? `Ward #${selectedEntity.data.ward_number}: ${selectedEntity.data.ward_name}`
                              : 'Outside BBMP Boundary'}
                          </p>
                        </div>
                        {selectedEntity.data.boundary_warning && (
                          <div className="bg-amber-500/15 border border-amber-500/30 p-2.5 rounded-xl text-amber-300 text-[10px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            <span>Border road detected (&lt;35m). Border proximity flag active.</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[9px] text-slate-500 font-mono uppercase block">MLA</span>
                            <span className="text-blue-300 font-bold block truncate">{selectedEntity.data.mla_name || 'N/A'}</span>
                            <span className="text-[9px] text-slate-400 block truncate">{selectedEntity.data.assembly_constituency || 'N/A'}</span>
                          </div>
                          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/[0.08]">
                            <span className="text-[9px] text-slate-500 font-mono uppercase block">MP</span>
                            <span className="text-purple-300 font-bold block truncate">{selectedEntity.data.mp_name || 'N/A'}</span>
                            <span className="text-[9px] text-slate-400 block truncate">{selectedEntity.data.parliamentary_constituency || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4 text-center">
                    Click any point, ward polygon, or constituency boundary on the map to inspect properties.
                  </p>
                )}
              </div>

              {/* Point-in-Polygon Tester Card */}
              <div className="glass-panel rounded-3xl p-5 shadow-xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                  <Crosshair className="w-4 h-4 text-pink-400" />
                  <span>Exact GPS Polygon Tester</span>
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono block mb-1">LATITUDE</label>
                    <input
                      type="number"
                      step="any"
                      value={testCoords.lat}
                      onChange={(e) => setTestCoords({ ...testCoords, lat: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-950/80 border border-white/[0.1] rounded-xl px-3 py-2 font-mono text-white text-xs focus:outline-none focus:border-pink-500 transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono block mb-1">LONGITUDE</label>
                    <input
                      type="number"
                      step="any"
                      value={testCoords.lon}
                      onChange={(e) => setTestCoords({ ...testCoords, lon: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-950/80 border border-white/[0.1] rounded-xl px-3 py-2 font-mono text-white text-xs focus:outline-none focus:border-pink-500 transition-all font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => runTestDetect(testCoords.lat, testCoords.lon)}
                  disabled={testingGps}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-600/20 active:scale-95 disabled:opacity-50"
                >
                  {testingGps ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                  <span>Test Point Across All Boundaries</span>
                </button>

                {/* Test Result Display */}
                {testResult && (
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 shadow-md ${
                    testResult.is_within_bengaluru 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span>{testResult.is_within_bengaluru ? 'Inside BBMP Limits' : 'Outside BBMP Boundary'}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30 border border-current">{testResult.detection_method}</span>
                    </div>
                    <p className="font-black text-white text-sm">
                      {testResult.is_within_bengaluru
                        ? `Ward #${testResult.ward_number}: ${testResult.ward_name}`
                        : testResult.ward_name}
                    </p>
                    {testResult.assembly_constituency && (
                      <div className="text-[11px] text-slate-300">
                        <span className="text-slate-400">MLA:</span> <strong>{testResult.mla_name}</strong> ({testResult.mla_party}) • {testResult.assembly_constituency}
                      </div>
                    )}
                    {testResult.parliamentary_constituency && (
                      <div className="text-[11px] text-slate-300">
                        <span className="text-slate-400">MP:</span> <strong>{testResult.mp_name}</strong> ({testResult.mp_party}) • {testResult.parliamentary_constituency}
                      </div>
                    )}
                    {testResult.boundary_warning && (
                      <div className="pt-1 text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Warning: Coordinate is within ~35m of boundary line.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ELECTED REPRESENTATIVES (MLA & MP) */}
      {/* ========================================================================= */}
      {activeTab === 'representatives' && (
        <div className="space-y-6">
          {/* Header & Filter Bar */}
          <div className="glass-panel rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 glass-pill text-purple-400 text-xs font-semibold px-3 py-1 rounded-full border-purple-500/30">
                  <Landmark className="w-4 h-4" />
                  <span>Authoritative Representative Directory</span>
                </div>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Elected Political Representatives of Bengaluru
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                  Sitting Members of the Karnataka Legislative Assembly (MLAs) and Members of Parliament (MPs) mapped to authentic GIS constituency boundaries. Maintain freshness and audit official sources.
                </p>
              </div>

              {/* Stats Counters */}
              <div className="flex items-center gap-3">
                <div className="glass-card px-4 py-2.5 rounded-xl text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block tracking-wider">Assembly (MLAs)</span>
                  <span className="text-lg font-black text-blue-400 font-mono">{representatives.mla_count}</span>
                </div>
                <div className="glass-card px-4 py-2.5 rounded-xl text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block tracking-wider">Lok Sabha (MPs)</span>
                  <span className="text-lg font-black text-purple-400 font-mono">{representatives.mp_count}</span>
                </div>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRepFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    repFilter === 'all'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
                      : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  All Representatives ({representatives.mla_count + representatives.mp_count})
                </button>
                <button
                  type="button"
                  onClick={() => setRepFilter('mla')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    repFilter === 'mla'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  MLAs / Assembly ({representatives.mla_count})
                </button>
                <button
                  type="button"
                  onClick={() => setRepFilter('mp')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    repFilter === 'mp'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
                      : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  MPs / Parliament ({representatives.mp_count})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={repSearch}
                  onChange={(e) => setRepSearch(e.target.value)}
                  placeholder="Search by representative, constituency, or party..."
                  className="bg-white/[0.04] border border-white/[0.1] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 w-72"
                />
              </div>
            </div>
          </div>

          {/* Representatives Table / Cards */}
          <div className="space-y-5">
            {/* Section 1: MLAs */}
            {(repFilter === 'all' || repFilter === 'mla') && (
              <div className="glass-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400" />
                    <h4 className="font-bold text-white text-sm">
                      Karnataka Legislative Assembly (16th KLA: 2023–2028)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Showing {filteredMlas.length} of {representatives.mla_count} MLAs
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                        <th className="py-2.5 px-3">Const. No.</th>
                        <th className="py-2.5 px-3">Constituency</th>
                        <th className="py-2.5 px-3">MLA Name</th>
                        <th className="py-2.5 px-3">Party</th>
                        <th className="py-2.5 px-3">Term</th>
                        <th className="py-2.5 px-3">Last Verified</th>
                        <th className="py-2.5 px-3">Source</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] font-medium">
                      {filteredMlas.map((mla) => (
                        <tr key={`mla-${mla.id}`} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-400">AC #{mla.constituency_number}</td>
                          <td className="py-2.5 px-3 text-white font-semibold">{mla.constituency_name}</td>
                          <td className="py-2.5 px-3 text-slate-200">
                            {mla.official_profile_url ? (
                              <a
                                href={mla.official_profile_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline flex items-center gap-1"
                              >
                                <span>{mla.name}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span>{mla.name}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getPartyBadgeStyle(mla.party)}`}>
                              {mla.party}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">{mla.term || '16th KLA (2023-2028)'}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-emerald-400">
                            {mla.last_verified ? mla.last_verified.split('T')[0] : 'Official Record'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[10px] truncate max-w-[140px]" title={mla.source}>
                            {mla.source || 'ECI / KLA'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenEditRep(mla, 'mla')}
                              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Edit3 className="w-3 h-3 text-blue-400" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 2: MPs */}
            {(repFilter === 'all' || repFilter === 'mp') && (
              <div className="glass-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400" />
                    <h4 className="font-bold text-white text-sm">
                      Lok Sabha Parliamentary Constituencies (18th Lok Sabha: 2024–2029)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Showing {filteredMps.length} of {representatives.mp_count} MPs
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                        <th className="py-2.5 px-3">Const. No.</th>
                        <th className="py-2.5 px-3">Constituency</th>
                        <th className="py-2.5 px-3">MP Name</th>
                        <th className="py-2.5 px-3">Party</th>
                        <th className="py-2.5 px-3">Term</th>
                        <th className="py-2.5 px-3">Last Verified</th>
                        <th className="py-2.5 px-3">Source</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] font-medium">
                      {filteredMps.map((mp) => (
                        <tr key={`mp-${mp.id}`} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-400">PC #{mp.constituency_number}</td>
                          <td className="py-2.5 px-3 text-white font-semibold">{mp.constituency_name}</td>
                          <td className="py-2.5 px-3 text-slate-200">
                            {mp.official_profile_url ? (
                              <a
                                href={mp.official_profile_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 hover:underline flex items-center gap-1"
                              >
                                <span>{mp.name}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span>{mp.name}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getPartyBadgeStyle(mp.party)}`}>
                              {mp.party}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">{mp.term || '18th Lok Sabha (2024-2029)'}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-emerald-400">
                            {mp.last_verified ? mp.last_verified.split('T')[0] : 'Official Record'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[10px] truncate max-w-[140px]" title={mp.source}>
                            {mp.source || 'ECI / Lok Sabha'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenEditRep(mp, 'mp')}
                              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Edit3 className="w-3 h-3 text-purple-400" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BOUNDARY DATASETS & BACKUPS */}
      {/* ========================================================================= */}
      {activeTab === 'datasets' && (
        <div className="space-y-6">
          {/* Government Source Transparency Header */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-slate-950/80 border border-emerald-500/20">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 glass-pill text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full border-emerald-500/30">
                  <ShieldCheck className="w-4 h-4" />
                  <span>BBMP Ward Boundaries — Official Government Source</span>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                  Authoritative Municipal Ward Boundary GIS Engine
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
                  Authentic spatial polygons delimited by the Government of Karnataka and BBMP GIS Cell. All incident geotags are matched using genuine Point-in-Polygon calculations without PIN-code or locality guessing.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setIsReplaceMode(false);
                    setShowImportModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Ward Dataset</span>
                </button>
                <button
                  onClick={() => {
                    setIsReplaceMode(true);
                    setShowImportModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Replace Dataset</span>
                </button>
                <button
                  onClick={handleExportGeoJson}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] font-semibold text-xs flex items-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Export GeoJSON</span>
                </button>
              </div>
            </div>

            {/* Dataset Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-white/[0.08] text-xs">
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Dataset Source</span>
                <span className="font-semibold text-white truncate block text-xs mt-0.5" title={datasetInfo?.dataset_source}>
                  {datasetInfo?.dataset_source || 'BBMP GIS Cell'}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Version</span>
                <span className="font-semibold text-emerald-400 truncate block text-xs mt-0.5">
                  {datasetInfo?.dataset_version || 'N/A'}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Dataset Date</span>
                <span className="font-semibold text-white truncate block text-xs mt-0.5">
                  {datasetInfo?.dataset_date || 'N/A'}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Last Imported</span>
                <span className="font-semibold text-white truncate block text-xs mt-0.5">
                  {datasetInfo?.last_imported ? datasetInfo.last_imported.split('T')[0] : 'Today'}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">CRS (Verified)</span>
                <span className="font-semibold text-purple-400 font-mono truncate block text-xs mt-0.5">
                  {datasetInfo?.coordinate_system || 'EPSG:4326'}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Total Wards</span>
                <span className="font-black text-white text-sm mt-0.5 block font-mono">
                  {datasetInfo?.total_wards || 0}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Valid Wards</span>
                <span className="font-black text-emerald-400 text-sm mt-0.5 block font-mono">
                  {datasetInfo?.valid_wards || 0}
                </span>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Invalid Wards</span>
                <span className={`font-black text-sm mt-0.5 block font-mono ${datasetInfo?.invalid_wards > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {datasetInfo?.invalid_wards || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Historical Preserved Backups */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Preserved Dataset Backups</span>
            </h4>
            {backups.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto text-xs pr-1">
                {backups.map((b, idx) => (
                  <div key={idx} className="glass-card p-2.5 rounded-xl border border-white/[0.06] flex items-center justify-between hover:border-white/[0.12] transition-colors">
                    <div className="truncate mr-2">
                      <span className="font-mono text-[11px] text-slate-300 truncate block">{b.filename}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{b.created_at.split('T')[0]} • {(b.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <span className="text-[10px] bg-white/[0.08] text-slate-300 px-2 py-0.5 rounded font-mono shrink-0">Saved</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No previous backups yet. Backups are automatically generated prior to replacement.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT REPRESENTATIVE MODAL */}
      {/* ========================================================================= */}
      {editingRep && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999] flex items-center justify-center p-4">
          <div className="glass-panel border border-white/[0.15] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-base">
                  Edit {editingRep.rep_type === 'mla' ? 'MLA' : 'MP'} Record
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRep(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="glass-card p-3 rounded-xl border border-white/[0.08] text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-mono block tracking-wider">Constituency</span>
              <p className="text-sm font-bold text-white mt-0.5">
                {editingRep.rep_type === 'mla' ? `AC #${editingRep.constituency_number}` : `PC #${editingRep.constituency_number}`}: {editingRep.constituency_name}
              </p>
            </div>

            <form onSubmit={handleSaveRep} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Representative Name:</label>
                <input
                  type="text"
                  value={repFormData.name}
                  onChange={(e) => setRepFormData({ ...repFormData, name: e.target.value })}
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Political Party:</label>
                  <input
                    type="text"
                    value={repFormData.party}
                    onChange={(e) => setRepFormData({ ...repFormData, party: e.target.value })}
                    placeholder="e.g. INC, BJP, JD(S)"
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Elected Term:</label>
                  <input
                    type="text"
                    value={repFormData.term}
                    onChange={(e) => setRepFormData({ ...repFormData, term: e.target.value })}
                    placeholder="e.g. 16th KLA (2023-2028)"
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Official Profile URL:</label>
                <input
                  type="url"
                  value={repFormData.official_profile_url}
                  onChange={(e) => setRepFormData({ ...repFormData, official_profile_url: e.target.value })}
                  placeholder="https://kla.kar.nic.in/..."
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Contact Email:</label>
                  <input
                    type="email"
                    value={repFormData.contact_email}
                    onChange={(e) => setRepFormData({ ...repFormData, contact_email: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Contact Phone:</label>
                  <input
                    type="text"
                    value={repFormData.contact_phone}
                    onChange={(e) => setRepFormData({ ...repFormData, contact_phone: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Official Verification Source:</label>
                <input
                  type="text"
                  value={repFormData.source}
                  onChange={(e) => setRepFormData({ ...repFormData, source: e.target.value })}
                  placeholder="e.g. Election Commission of India (ECI)"
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingRep(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRep}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-purple-500/25"
                >
                  {savingRep ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save & Update Freshness</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IMPORT / REPLACE DATASET MODAL */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999] flex items-center justify-center p-4">
          <div className="glass-panel border border-white/[0.15] rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
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
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2.5 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Source Name:</label>
                  <input
                    type="text"
                    value={importMeta.source_name}
                    onChange={(e) => setImportMeta({ ...importMeta, source_name: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Source Organization:</label>
                  <input
                    type="text"
                    value={importMeta.source_organization}
                    onChange={(e) => setImportMeta({ ...importMeta, source_organization: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Source URL:</label>
                  <input
                    type="text"
                    value={importMeta.source_url}
                    onChange={(e) => setImportMeta({ ...importMeta, source_url: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Dataset Version Tag:</label>
                  <input
                    type="text"
                    value={importMeta.dataset_version}
                    onChange={(e) => setImportMeta({ ...importMeta, dataset_version: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl p-2 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {validationReport && (
                <div className="glass-card border border-white/[0.1] rounded-xl p-4 space-y-2">
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
                  <pre className="text-[10px] font-mono text-slate-300 bg-slate-950/80 p-3 rounded-lg overflow-x-auto whitespace-pre leading-relaxed border border-white/[0.06]">
                    {validationReport.validation_report}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={handleValidateFile}
                  disabled={uploading || !uploadFile}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Validating...' : 'Validate Dataset First'}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/25"
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
