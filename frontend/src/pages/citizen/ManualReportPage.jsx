import React, { useState, useRef } from 'react';
import { Camera, Upload, MapPin, Sparkles, AlertTriangle, CheckCircle2, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { citizenService } from '../../services/api';

export default function ManualReportPage({ currentUser, onReportSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [category, setCategory] = useState('Pothole');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState(12.9352); // Default Koramangala
  const [longitude, setLongitude] = useState(77.6245);
  const [address, setAddress] = useState('80ft Road, 4th Block, Koramangala');
  
  const [isPreScreening, setIsPreScreening] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // Auto-fetch device GPS coordinates
  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
        },
        (err) => console.log('Location access error: ', err.message)
      );
    }
  };

  // Handle image selection & trigger automatic AI pre-screening
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setAiSuggestion(null);

    // Trigger AI pre-screening
    setIsPreScreening(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());

      const res = await citizenService.prescreen(formData);
      setAiSuggestion(res);
      if (res.detected_category) {
        setCategory(res.detected_category);
      }
      if (res.bengaluru_ward) {
        setAddress(`${res.bengaluru_ward}, Bengaluru`);
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          >
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>Update GPS</span>
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
                    <p className="text-[10px] text-slate-500">Supports JPG, PNG with auto blur detection</p>
                  </div>
                )}
              </div>

              {/* AI Pre-Screening Live Card */}
              {isPreScreening && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                  <div className="text-xs">
                    <div className="font-bold text-emerald-400">YOLO AI Analyzing Road Surface...</div>
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
                        aiSuggestion.suggested_severity === 'HIGH' ? 'text-orange-400' : 'text-yellow-400'
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
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Deep pothole near junction. Two wheelers skidding during evening traffic."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Location Coordinates & Address */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-400">GPS Location</span>
                  <span className="font-mono text-emerald-400">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Road, Area, Bengaluru"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
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
