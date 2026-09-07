import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, AlertCircle, MapPin, Check, X, Shield, RefreshCw } from 'lucide-react';
import { citizenService, authorityService } from '../../services/api';

export default function MyReportsPage({ currentUser }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [verificationFeedback, setVerificationFeedback] = useState('');
  const [verifying, setVerifying] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await citizenService.getMyReports();
      setReports(data);
      if (data.length > 0 && data[0].incident_id) {
        loadIncident(data[0].incident_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadIncident = async (incId) => {
    try {
      const inc = await authorityService.getIncidentDetail(incId);
      setSelectedIncident(inc);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleCitizenVerify = async (verified) => {
    if (!selectedIncident) return;
    setVerifying(true);
    try {
      const updated = await citizenService.verifyResolution(
        selectedIncident.id,
        verified,
        verificationFeedback
      );
      setSelectedIncident(updated);
      fetchReports();
    } catch (err) {
      alert('Verification error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">My Civic Reports</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Track real-time progress and verify municipal repair completions.
          </p>
        </div>
        <button
          onClick={fetchReports}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Reports List */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Submitted Observations</h2>
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
              No reports submitted yet. Use "Report Issue" or "Drive Mode" to log road issues.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                onClick={() => rep.incident_id && loadIncident(rep.incident_id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedIncident?.id === rep.incident_id
                    ? 'bg-slate-800 border-emerald-500/50 shadow-lg'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-white">{rep.category}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                    {rep.source}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{rep.raw_text || rep.address}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Ward: {rep.ward_name}</span>
                  <span className="font-semibold text-emerald-400">INC #{rep.incident_id}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Incident Lifecycle & Citizen Verification */}
        <div className="lg:col-span-2 space-y-6">
          {selectedIncident ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
              {/* Incident Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-400">{selectedIncident.incident_code}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      selectedIncident.status === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400' :
                      selectedIncident.status === 'CITIZEN_VERIFICATION' ? 'bg-amber-400/20 text-amber-300 animate-pulse' :
                      'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {selectedIncident.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-base mt-1">{selectedIncident.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedIncident.address} • Ward: {selectedIncident.ward_name}</span>
                  </div>
                </div>
              </div>

              {/* Resolution Evidence Viewer (Before vs After) */}
              {selectedIncident.resolution && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Resolution Proof Submitted by Authority</span>
                    <span className="text-[10px] text-slate-400">
                      Repair Cost: ₹{selectedIncident.resolution.repair_cost || 0}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Before Repair (Citizen Evidence)
                      </span>
                      {selectedIncident.resolution.before_media_url ? (
                        <img
                          src={selectedIncident.resolution.before_media_url}
                          alt="Before"
                          className="w-full h-44 object-cover rounded-lg border border-slate-800"
                        />
                      ) : (
                        <div className="h-44 bg-slate-900 rounded-lg flex items-center justify-center text-xs text-slate-500">
                          Initial Photo
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                        After Repair (Officer Proof)
                      </span>
                      <img
                        src={selectedIncident.resolution.after_media_url}
                        alt="After"
                        className="w-full h-44 object-cover rounded-lg border border-emerald-500/40"
                      />
                    </div>
                  </div>

                  <div className="text-xs bg-slate-900 p-3 rounded-lg text-slate-300">
                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Officer Notes:</span>
                    {selectedIncident.resolution.work_notes}
                  </div>

                  {/* Citizen Verification Actions */}
                  {selectedIncident.status === 'CITIZEN_VERIFICATION' && (
                    <div className="border-t border-slate-800 pt-4 space-y-3">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>Action Required: Please verify if the repair satisfies your standards.</span>
                      </div>
                      <input
                        type="text"
                        value={verificationFeedback}
                        onChange={(e) => setVerificationFeedback(e.target.value)}
                        placeholder="Optional feedback (e.g. Surface smooth, traffic flow restored)"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleCitizenVerify(true)}
                          disabled={verifying}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                        >
                          <Check className="w-4 h-4" />
                          <span>Verify & Close Ticket</span>
                        </button>
                        <button
                          onClick={() => handleCitizenVerify(false)}
                          disabled={verifying}
                          className="flex-1 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          <span>Reject & Reopen Issue</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedIncident.status === 'CLOSED' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400 font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Issue officially verified and closed by citizen.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Status Audit History */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Incident Audit Trail</h4>
                <div className="space-y-2 border-l-2 border-slate-800 pl-4">
                  {selectedIncident.status_history?.map((h) => (
                    <div key={h.id} className="text-xs space-y-0.5 relative">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 absolute -left-[21px] top-1"></div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{h.new_status}</span>
                        <span className="text-[10px] text-slate-500">by {h.changed_by_name}</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{h.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-500">
              Select an observation from the left to view complete incident lifecycle and resolution photos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
