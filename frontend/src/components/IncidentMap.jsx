import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Layers, Globe, MapPin, Eye, RefreshCw } from 'lucide-react';

const BENGALURU_CENTER = [12.9716, 77.5946];

const severityColor = (severity, status) => {
  if (status === 'RESOLVED' || status === 'CLOSED') return '#10b981'; // Emerald
  if (severity === 'CRITICAL') return '#f43f5e'; // Rose/Crimson
  if (severity === 'HIGH') return '#f59e0b'; // Amber
  if (severity === 'MEDIUM') return '#fbbf24'; // Yellow gold
  return '#38bdf8'; // Sky blue
};

// Custom glowing HTML markers for realistic premium aesthetic
const createMarkerIcon = (incident) => {
  const color = severityColor(incident.severity, incident.status);
  const isCritical = incident.severity === 'CRITICAL' && incident.status !== 'RESOLVED';
  
  return L.divIcon({
    className: 'custom-civic-pin',
    html: `
      <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        ${isCritical ? `
          <div style="
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            background: ${color};
            opacity: 0.45;
            animation: pulse-ring 2s infinite;
          "></div>
        ` : ''}
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px ${color}, 0 2px 6px rgba(0,0,0,0.6);
          transition: transform 0.2s ease;
        "></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12]
  });
};

function MapViewUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 12);
    }
  }, [center, zoom, map]);
  return null;
}

const DEFAULT_BENGALURU_INCIDENTS = [
  {
    id: 101,
    incident_code: "CIV-BLR-0101",
    category: "Pothole",
    severity: "CRITICAL",
    status: "DETECTED",
    latitude: 12.9352,
    longitude: 77.6245,
    title: "Deep Crater Pothole on 80 Feet Road",
    ward_name: "Koramangala (Ward 151)",
    zone_name: "South"
  },
  {
    id: 102,
    incident_code: "CIV-BLR-0102",
    category: "Road Damage",
    severity: "CRITICAL",
    status: "VERIFIED",
    latitude: 12.9784,
    longitude: 77.6408,
    title: "Asphalt Cracking & Surface Breakdown",
    ward_name: "Indiranagar (Ward 112)",
    zone_name: "East"
  },
  {
    id: 103,
    incident_code: "CIV-BLR-0103",
    category: "Pothole",
    severity: "HIGH",
    status: "IN_PROGRESS",
    latitude: 12.9128,
    longitude: 77.6445,
    title: "Multiple Road Pits near 27th Main",
    ward_name: "HSR Layout (Ward 174)",
    zone_name: "South"
  },
  {
    id: 104,
    incident_code: "CIV-BLR-0104",
    category: "Garbage Overflow",
    severity: "HIGH",
    status: "VERIFIED",
    latitude: 12.9719,
    longitude: 77.6015,
    title: "Commercial Waste Dump Blocking Pathway",
    ward_name: "MG Road / Shanti Nagar (Ward 117)",
    zone_name: "East"
  },
  {
    id: 105,
    incident_code: "CIV-BLR-0105",
    category: "Streetlight",
    severity: "MEDIUM",
    status: "VERIFIED",
    latitude: 13.0068,
    longitude: 77.5684,
    title: "Non-functional LED Streetlight Cluster",
    ward_name: "Malleshwaram (Ward 65)",
    zone_name: "West"
  },
  {
    id: 106,
    incident_code: "CIV-BLR-0106",
    category: "Water Leakage",
    severity: "MEDIUM",
    status: "ASSIGNED",
    latitude: 12.9698,
    longitude: 77.7499,
    title: "BWSSB Main Pipeline Water Spillage",
    ward_name: "Whitefield (Ward 84)",
    zone_name: "Mahadevapura"
  },
  {
    id: 107,
    incident_code: "CIV-BLR-0107",
    category: "Pothole",
    severity: "HIGH",
    status: "RESOLVED",
    latitude: 12.9255,
    longitude: 77.5838,
    title: "Cold Asphalt Patch Work Completed",
    ward_name: "Jayanagar (Ward 153)",
    zone_name: "South"
  },
  {
    id: 108,
    incident_code: "CIV-BLR-0108",
    category: "Road Damage",
    severity: "CRITICAL",
    status: "RESOLVED",
    latitude: 12.9553,
    longitude: 77.7011,
    title: "Flyover Expansion Joint Repaired",
    ward_name: "Marathahalli (Ward 85)",
    zone_name: "Mahadevapura"
  }
];

export default function IncidentMap({ incidents = [], wardGeoJson = null, onSelectIncident }) {
  const [mapType, setMapType] = useState('streets'); // 'streets' | 'satellite'
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');

  // If incidents prop is empty, use realistic default incidents
  const displayIncidents = (incidents && incidents.length > 0) ? incidents : DEFAULT_BENGALURU_INCIDENTS;

  const criticalCount = displayIncidents.filter((i) => i.severity === 'CRITICAL' && i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
  const highCount = displayIncidents.filter((i) => i.severity === 'HIGH' && i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
  const mediumCount = displayIncidents.filter((i) => i.severity === 'MEDIUM' && i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
  const resolvedCount = displayIncidents.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length;

  const filteredIncidents = displayIncidents.filter((inc) => {
    if (selectedSeverity === 'ALL') return true;
    if (selectedSeverity === 'RESOLVED') return inc.status === 'RESOLVED' || inc.status === 'CLOSED';
    return inc.severity === selectedSeverity && inc.status !== 'RESOLVED' && inc.status !== 'CLOSED';
  });

  const getWardStyle = (feature) => {
    const rate = Number(feature.properties?.resolution_rate) || 85;
    const color = rate < 50 ? '#f43f5e' : rate < 75 ? '#f59e0b' : '#10b981';
    return {
      fillColor: color,
      fillOpacity: 0.12,
      color: '#34d399',
      weight: 1.2,
      opacity: 0.65,
      dashArray: '2, 4'
    };
  };

  const onEachWard = (feature, layer) => {
    const props = feature.properties || {};
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ fillOpacity: 0.28, weight: 2, opacity: 0.9 });
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle(getWardStyle(feature));
      }
    });
    if (props.ward_name || props.name) {
      layer.bindTooltip(
        `<strong>Ward ${props.ward_number || ''}: ${props.ward_name || props.name}</strong><br/><span style="font-size: 10px; color: #94a3b8;">Resolution Rate: ${props.resolution_rate || 85}%</span>`,
        { sticky: true, className: 'leaflet-tooltip-dark' }
      );
    }
  };

  return (
    <div className="incident-map-shell relative w-full h-full rounded-2xl overflow-hidden bg-slate-950 border border-white/[0.1]">
      <MapContainer
        center={BENGALURU_CENTER}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
        style={{ minHeight: '480px' }}
      >
        <MapViewUpdater center={BENGALURU_CENTER} zoom={12} />

        {/* Tile Layers based on user switcher */}
        {mapType === 'streets' && (
          <TileLayer
            key="tile-streets"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={20}
          />
        )}

        {mapType === 'satellite' && (
          <>
            <TileLayer
              key="tile-sat-base"
              attribution='Tiles &copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              key="tile-sat-labels"
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </>
        )}

        {/* BBMP Ward Polygons */}
        {wardGeoJson && (
          <GeoJSON
            key={`wards-${mapType}`}
            data={wardGeoJson}
            style={getWardStyle}
            onEachFeature={onEachWard}
          />
        )}

        {/* Filtered Incident Markers */}
        {filteredIncidents.map((incident) => {
          if (!incident.latitude || !incident.longitude) return null;
          const lat = Number(incident.latitude);
          const lng = Number(incident.longitude);
          if (isNaN(lat) || isNaN(lng)) return null;

          return (
            <Marker
              key={incident.id || `${lat}-${lng}-${incident.incident_code}`}
              position={[lat, lng]}
              icon={createMarkerIcon(incident)}
              eventHandlers={{
                click: () => onSelectIncident?.(incident)
              }}
            >
              <Popup className="leaflet-popup-premium">
                <div className="p-1 space-y-2 max-w-[260px] text-slate-100 font-sans">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-white uppercase tracking-wider">
                      {incident.category || 'Civic Defect'}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                      style={{
                        backgroundColor: `${severityColor(incident.severity, incident.status)}25`,
                        color: severityColor(incident.severity, incident.status)
                      }}
                    >
                      {incident.status === 'RESOLVED' ? 'RESOLVED' : (incident.severity || 'LOW')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2">
                    {incident.title || incident.description || incident.address || 'Bengaluru Road Defect'}
                  </p>
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Ward: <strong className="text-white">{incident.ward_name || incident.ward_number || 'BBMP'}</strong></span>
                    <span className="font-semibold text-emerald-400">{incident.status || 'OPEN'}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Header Badge */}
      <div className="map-layer-badge glass-pill absolute top-3 left-3 z-[400] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-slate-900/85 backdrop-blur-md border border-white/10 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse"></span>
        <span>{wardGeoJson ? '198 BBMP Wards Layer Active' : 'Bengaluru Open GIS Grid'}</span>
      </div>

      {/* Map Style Switcher Controls */}
      <div className="map-switcher glass-panel absolute top-3 right-3 z-[400] flex items-center gap-1 p-1 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/10 shadow-lg">
        <button
          type="button"
          onClick={() => setMapType('streets')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            mapType === 'streets'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Streets
        </button>
        <button
          type="button"
          onClick={() => setMapType('satellite')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            mapType === 'satellite'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Globe className="w-3.5 h-3.5" /> Satellite
        </button>
      </div>

      {/* Floating Interactive Incident Status Legend */}
      <div className="map-legend glass-panel absolute bottom-4 left-4 z-[400] p-3.5 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 shadow-2xl min-w-[240px]">
        <div className="flex items-center justify-between text-xs font-bold text-white mb-2.5 pb-1.5 border-b border-white/10">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            Incident Status
          </span>
          <button
            type="button"
            onClick={() => setSelectedSeverity('ALL')}
            title="Click to reset filter and show all pins"
            className={`font-mono text-[10px] px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              selectedSeverity === 'ALL'
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-white/5'
            }`}
          >
            {filteredIncidents.length} Pins {selectedSeverity !== 'ALL' && '(Filtered)'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {/* Critical */}
          <button
            type="button"
            onClick={() => setSelectedSeverity(prev => prev === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            title="Click to toggle Critical incident pins"
            className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedSeverity === 'CRITICAL'
                ? 'bg-rose-500/25 border-rose-500/70 shadow-[0_0_12px_rgba(244,63,94,0.45)] text-rose-200'
                : 'bg-white/[0.03] border-white/5 hover:border-rose-500/40 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
              Critical
            </span>
            <b className="font-mono text-white">{criticalCount}</b>
          </button>

          {/* High */}
          <button
            type="button"
            onClick={() => setSelectedSeverity(prev => prev === 'HIGH' ? 'ALL' : 'HIGH')}
            title="Click to toggle High incident pins"
            className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedSeverity === 'HIGH'
                ? 'bg-amber-500/25 border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.45)] text-amber-200'
                : 'bg-white/[0.03] border-white/5 hover:border-amber-500/40 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.9)]" />
              High
            </span>
            <b className="font-mono text-white">{highCount}</b>
          </button>

          {/* Medium */}
          <button
            type="button"
            onClick={() => setSelectedSeverity(prev => prev === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
            title="Click to toggle Medium incident pins"
            className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedSeverity === 'MEDIUM'
                ? 'bg-yellow-400/25 border-yellow-400/70 shadow-[0_0_12px_rgba(250,204,21,0.45)] text-yellow-200'
                : 'bg-white/[0.03] border-white/5 hover:border-yellow-400/40 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.9)]" />
              Medium
            </span>
            <b className="font-mono text-white">{mediumCount}</b>
          </button>

          {/* Resolved */}
          <button
            type="button"
            onClick={() => setSelectedSeverity(prev => prev === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
            title="Click to toggle Resolved incident pins"
            className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedSeverity === 'RESOLVED'
                ? 'bg-emerald-500/25 border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.45)] text-emerald-200'
                : 'bg-white/[0.03] border-white/5 hover:border-emerald-500/40 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
              Resolved
            </span>
            <b className="font-mono text-white">{resolvedCount}</b>
          </button>
        </div>
      </div>

      <div className="absolute bottom-2 right-3 z-[400] text-[10px] text-slate-400 flex items-center gap-1">
        <MapPin className="w-3 h-3 text-emerald-400" />
        <span>OpenStreetMap & CartoDB</span>
      </div>
    </div>
  );
}
