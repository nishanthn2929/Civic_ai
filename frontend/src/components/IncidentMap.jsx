import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Layers, Globe } from 'lucide-react';

// Create custom colored circle icons
const createCustomIcon = (severity, status) => {
  let color = '#3b82f6'; // blue default
  if (status === 'RESOLVED' || status === 'CLOSED') {
    color = '#10b981'; // emerald
  } else if (severity === 'CRITICAL') {
    color = '#ef4444'; // red
  } else if (severity === 'HIGH') {
    color = '#f97316'; // orange
  } else if (severity === 'MEDIUM') {
    color = '#eab308'; // yellow
  }

  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        background-color: ${color};
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2.5px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="background-color: white; width: 6px; height: 6px; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11]
  });
};

export default function IncidentMap({ incidents = [], wardGeoJson = null, onSelectIncident, selectedIncident = null }) {
  const [mapType, setMapType] = useState('default'); // 'default' | 'satellite'
  const defaultCenter = [12.9716, 77.5946]; // Bengaluru Central
  const defaultZoom = 12;

  const wardStyle = (feature) => {
    const rate = feature?.properties?.resolution_rate || 100;
    // Color ward polygon based on resolution health
    let fillColor = '#10b981';
    if (rate < 50) fillColor = '#ef4444';
    else if (rate < 75) fillColor = '#f59e0b';

    return {
      fillColor: fillColor,
      weight: 1.5,
      opacity: 0.8,
      color: '#38bdf8',
      dashArray: '3',
      fillOpacity: mapType === 'satellite' ? 0.2 : 0.12
    };
  };

  const onEachWard = (feature, layer) => {
    const p = feature.properties;
    if (p) {
      layer.bindTooltip(`
        <div style="font-size: 11px; font-weight: bold;">
          ${p.ward_name} (Ward #${p.ward_number})<br/>
          <span style="color: #64748b;">Zone: ${p.zone_name}</span><br/>
          <span style="color: #10b981;">Active Issues: ${p.total_incidents || 0}</span>
        </div>
      `, { sticky: true });
    }
  };

  return (
    <div className="w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 relative">
      <MapContainer center={defaultCenter} zoom={defaultZoom} scrollWheelZoom={true} className="w-full h-full">
        {/* Vector Dark vs Satellite Tile Layer */}
        {mapType === 'default' ? (
          <TileLayer
            key="tile-default"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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

        {/* Bengaluru Wards GeoJSON boundaries */}
        {wardGeoJson && (
          <GeoJSON
            key={JSON.stringify(wardGeoJson.features?.length)}
            data={wardGeoJson}
            style={wardStyle}
            onEachFeature={onEachWard}
          />
        )}

        {/* Incident Pins */}
        {incidents.map((inc) => (
          <Marker
            key={inc.id || inc.incident_code}
            position={[inc.latitude, inc.longitude]}
            icon={createCustomIcon(inc.severity, inc.status)}
            eventHandlers={{
              click: () => onSelectIncident && onSelectIncident(inc)
            }}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 min-w-[200px] text-slate-900">
                {inc.primary_media_url && (
                  <img
                    src={inc.primary_media_url}
                    alt={inc.category}
                    className="w-full h-24 object-cover rounded-md mb-2 border border-slate-200"
                  />
                )}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-xs text-slate-900">{inc.category}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    inc.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    inc.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                    inc.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {inc.severity}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2 mb-1.5">
                  {inc.title || inc.address || 'Bengaluru'}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 border-t pt-1">
                  <span>Ward: {inc.ward_name || 'BBMP'}</span>
                  <span className="font-medium text-emerald-700">{inc.status}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Type Switcher (Default vs Satellite) */}
      <div className="absolute top-4 right-4 z-[400] bg-slate-950/90 backdrop-blur rounded-lg p-0.5 border border-slate-700 shadow-md flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setMapType('default')}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
            mapType === 'default'
              ? 'bg-emerald-500 text-slate-950 shadow font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
          title="Default dark vector streets"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Default</span>
        </button>
        <button
          type="button"
          onClick={() => setMapType('satellite')}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
            mapType === 'satellite'
              ? 'bg-emerald-500 text-slate-950 shadow font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
          title="High-resolution satellite imagery with street labels"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Satellite</span>
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2.5 rounded-lg shadow-lg text-[11px] text-slate-300">
        <div className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
          <span>Map Legend</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span>Critical Priority</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            <span>High Severity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Resolved</span>
          </div>
        </div>
      </div>
    </div>
  );
}
