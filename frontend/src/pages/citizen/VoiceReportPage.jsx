import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Send, CheckCircle2, AlertCircle, RefreshCw, Globe, Radio, Check } from 'lucide-react';
import { citizenService } from '../../services/api';
import DuplicateWarningModal from '../../components/DuplicateWarningModal';

export default function VoiceReportPage({ currentUser, onReportSuccess }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState('en-IN'); // or kn-IN
  const [latitude, setLatitude] = useState(12.9352);
  const [longitude, setLongitude] = useState(77.6245);
  
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [locationStatus, setLocationStatus] = useState('Acquiring device location...');
  const [error, setError] = useState(null);

  // Duplicate detection states
  const [duplicateCandidate, setDuplicateCandidate] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const recognitionRef = useRef(null);

  const speakAssistantMessage = (message) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  // Initialize SpeechRecognition if available
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setSpeechSupported(false);
    }
    if (!navigator.geolocation) {
      setLocationStatus('Location unavailable; using Bengaluru fallback');
      return undefined;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocationStatus(`Device GPS ±${Math.round(position.coords.accuracy)}m`);
      },
      () => setLocationStatus('Location permission unavailable; using Bengaluru fallback'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    return () => recognitionRef.current?.abort();
  }, []);

  const handleToggleRecord = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    try {
      setError(null);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsRecording(true);
        setParsedResult(null);
      };

      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((res) => res[0].transcript)
          .join('');
        setTranscript(text);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        const message = event.error === 'not-allowed'
          ? 'Microphone permission was denied. You can type the complaint below.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Please try again or type the complaint below.'
            : 'Could not capture speech. You can type the complaint below.';
        setError(message);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setError('Microphone could not start. Type the complaint below instead.');
      setIsRecording(false);
    }
  };

  // Trigger backend NLP entity parsing
  const handleParseTranscript = async () => {
    if (!transcript.trim()) return;
    setError(null);
    setIsParsing(true);
    try {
      const res = await citizenService.parseVoice({
        transcript,
        language: language.startsWith('kn') ? 'kn' : 'en',
        latitude,
        longitude
      });
      setParsedResult(res);
      if (res.is_valid_civic && res.detected_category) {
        speakAssistantMessage(
          language.startsWith('kn')
            ? `${res.ward_name || 'ಬೆಂಗಳೂರು'} ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ${res.detected_category} ಸಮಸ್ಯೆ ಗುರುತಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ ದೃಢೀಕರಿಸಿ.`
            : `I understood ${res.detected_category} with ${res.suggested_severity} severity in ${res.ward_name || 'Bengaluru'}. Please review the ticket and confirm submission.`
        );
      } else {
        speakAssistantMessage(
          language.startsWith('kn')
            ? 'ಧ್ವನಿಯಲ್ಲಿ ಯಾವುದೇ ರಸ್ತೆ ಸಮಸ್ಯೆ ಅಥವಾ ದೂರು ಪತ್ತೆಯಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ.'
            : 'No road defect was recognized. Please describe a pothole or road damage.'
        );
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Voice analysis failed. Check the backend and try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleTranscriptChange = (event) => {
    setTranscript(event.target.value);
    setParsedResult(null);
    setError(null);
  };

  // Quick preset voice queries for demonstration
  const handlePresetVoice = async (sampleText) => {
    setError(null);
    setTranscript(sampleText);
    setIsParsing(true);
    try {
      const res = await citizenService.parseVoice({
        transcript: sampleText,
        language: 'en',
        latitude,
        longitude
      });
      setParsedResult(res);
      if (res.is_valid_civic && res.detected_category) {
        speakAssistantMessage(
          `I understood ${res.detected_category} with ${res.suggested_severity} severity in ${res.ward_name || 'Bengaluru'}. Please review the ticket and confirm submission.`
        );
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Voice analysis failed. Check the backend and try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!parsedResult || !parsedResult.is_valid_civic || !parsedResult.detected_category) {
      setError('Cannot submit: No recognized civic issue was detected in speech.');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', parsedResult.detected_category);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      formData.append('raw_text', parsedResult.extracted_description);
      formData.append('address', parsedResult.formatted_address || `${parsedResult.ward_name || 'Bengaluru'}, Karnataka`);
      formData.append('location_source', 'DEVICE_GPS');
      formData.append('source', 'voice');
      formData.append('severity', parsedResult.suggested_severity);

      // Duplicate pre-screening check (70%-84% triggers confirmation modal)
      try {
        const dupCheck = await citizenService.checkDuplicate(formData);
        if (dupCheck && (dupCheck.status === 'POSSIBLE_DUPLICATE' || dupCheck.action === 'ask_confirmation')) {
          setDuplicateCandidate(dupCheck);
          setPendingFormData(formData);
          setShowDuplicateModal(true);
          setIsSubmitting(false);
          return;
        }
      } catch (dupErr) {
        console.warn('Duplicate pre-check notice:', dupErr);
      }

      const res = await citizenService.createReport(formData);
      setLastSubmission(res);
      setSubmitDone(true);
      speakAssistantMessage('Your civic issue has been reported successfully.');
      if (onReportSuccess) onReportSuccess(res);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Voice report submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!pendingFormData || !duplicateCandidate) return;
    setIsSubmitting(true);
    try {
      pendingFormData.append('user_action', 'confirm_duplicate');
      if (duplicateCandidate.matched_incident?.id) {
        pendingFormData.append('target_incident_id', duplicateCandidate.matched_incident.id.toString());
      }
      if (duplicateCandidate.primary_report_id) {
        pendingFormData.append('primary_report_id', duplicateCandidate.primary_report_id.toString());
      }
      const res = await citizenService.createReport(pendingFormData);
      setShowDuplicateModal(false);
      setLastSubmission(res);
      setSubmitDone(true);
      speakAssistantMessage('Your report was linked to an existing civic incident.');
      if (onReportSuccess) onReportSuccess(res);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to link duplicate report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceNewReport = async () => {
    if (!pendingFormData) return;
    setIsSubmitting(true);
    try {
      pendingFormData.append('user_action', 'force_new');
      const res = await citizenService.createReport(pendingFormData);
      setShowDuplicateModal(false);
      setLastSubmission(res);
      setSubmitDone(true);
      speakAssistantMessage('Your civic issue has been reported successfully as a new issue.');
      if (onReportSuccess) onReportSuccess(res);
    } catch (err) {
      setError(err.response?.data?.detail || 'Voice report submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="glass-card sheen-card rounded-3xl p-6 sm:p-8 text-center space-y-3 relative overflow-hidden animate-in-up">
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <span className="eyebrow civic-eyebrow justify-center">Multilingual Civic NLP Engine</span>

        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          Voice Civic <span className="text-aurora">Grievance Assistant</span>
        </h1>

        <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
          Speak naturally in English or ಕನ್ನಡ. Our AI model automatically extracts the defect category, urgency, location, and maps it directly to the local BBMP ward.
        </p>

        {/* Language Selector Segmented Pill */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <div className="bg-slate-950/80 p-1 rounded-xl border border-white/[0.08] flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => setLanguage('en-IN')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                language === 'en-IN'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              English (India)
            </button>
            <button
              type="button"
              onClick={() => setLanguage('kn-IN')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                language === 'kn-IN'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ಕನ್ನಡ (Kannada)
            </button>
          </div>
        </div>
      </div>

      {submitDone ? (
        /* Submission Success Card */
        <div className="glass-card rounded-3xl p-8 text-center space-y-4 border border-emerald-500/30 shadow-2xl animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white">Voice Complaint Submitted!</h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            The civic intelligence engine has parsed your voice recording and filed a verified report in the BBMP incident system.
          </p>

          {lastSubmission?.is_duplicate && (
            <div className="max-w-md mx-auto p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1 text-left">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  Merged into Existing Primary Incident
                </span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
                  {Math.round((lastSubmission.duplicate_score || 0.85) * 100)}% Match
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Linked to Incident #{lastSubmission.incident_id} (Group: <span className="font-mono text-amber-300">{lastSubmission.duplicate_group_id}</span>). Duplicate reports automatically escalate repair priority without creating redundant work orders.
              </p>
            </div>
          )}
          <button
            onClick={() => {
              setSubmitDone(false);
              setTranscript('');
              setParsedResult(null);
            }}
            className="btn-premium px-6 py-2.5 rounded-xl text-xs"
          >
            Record Another Complaint
          </button>
        </div>
      ) : (
        /* Voice Assistant Interaction Card */
        <div className="glass-card sheen-card rounded-3xl p-6 sm:p-10 space-y-7 border border-white/[0.1] shadow-2xl">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <span>{error}</span>
            </div>
          )}
          {!speechSupported && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Voice capture is unavailable in this browser. Open this app in Chrome or Edge to report by voice, or type your complaint below.
            </div>
          )}
          <div className="civic-location-bar flex items-center justify-between rounded-xl border border-white/[0.08] bg-slate-950/50 px-4 py-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-emerald-400" /> Report location</span>
            <span className="font-mono text-emerald-300">{locationStatus}</span>
          </div>
          {/* Animated Glowing Multi-Ring Microphone */}
          <div className={`flex flex-col items-center justify-center py-6 ${!speechSupported ? 'hidden' : ''}`}>
            <div className="relative flex items-center justify-center w-48 h-48">
              {isRecording ? (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-rose-500/50 audio-wave-1"></div>
                  <div className="absolute inset-0 rounded-full border border-rose-400/40 audio-wave-2"></div>
                  <div className="absolute inset-0 rounded-full bg-rose-500/10 audio-wave-3"></div>
                  <div className="absolute w-32 h-32 rounded-full bg-rose-500/20 blur-xl animate-pulse"></div>
                </>
              ) : (
                <div className="absolute inset-4 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none"></div>
              )}
              
              <button
                type="button"
                onClick={handleToggleRecord}
                disabled={isParsing || !speechSupported}
                aria-pressed={isRecording}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40 ${
                  isRecording
                    ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-red-500 text-white shadow-[0_0_36px_rgba(244,63,94,0.7)] scale-110'
                    : 'bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-500 text-slate-950 hover:scale-105 shadow-[0_12px_36px_-6px_rgba(16,185,129,0.5)]'
                }`}
                title={isRecording ? 'Click to stop recording' : 'Click to start voice recording'}
              >
                {isRecording ? (
                  <MicOff className="w-10 h-10 animate-pulse" />
                ) : (
                  <Mic className="w-10 h-10 stroke-[2.5]" />
                )}
              </button>
            </div>
            
            <div className="mt-4 text-center space-y-1">
              <div className="text-sm font-extrabold text-white tracking-wide flex items-center justify-center gap-2">
                {isRecording ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span className="text-rose-400">Listening... Speak your complaint naturally</span>
                  </>
                ) : (
                  <span>{speechSupported ? 'Tap Microphone to Speak in English or ಕನ್ನಡ' : 'Type your complaint below'}</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isRecording ? 'Capturing audio stream with real-time NLP parser' : 'AI automatically extracts defect category, severity, and local BBMP ward'}
              </p>
            </div>
          </div>

          {/* Transcript Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Spoken Complaint Transcript</span>
              {transcript && (
                <span className="font-mono text-[10px] text-emerald-400">
                  {transcript.split(' ').filter(Boolean).length} words
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={transcript}
              onChange={handleTranscriptChange}
              placeholder="e.g. There is a deep pothole near the main road and bikes are having difficulty crossing it..."
              className="input-premium w-full rounded-2xl p-3.5 text-xs text-white shadow-inner"
            />
          </div>

          {/* Quick Voice Simulation Presets */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">Or try realistic voice presets:</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handlePresetVoice("There is a large pothole near the 80 feet road junction and two wheelers are slipping.")}
                className="civic-btn-preset p-2.5 rounded-xl text-[11px] text-left transition-all"
              >
                <div className="font-bold text-white text-xs mb-0.5">Large Pothole</div>
                <div className="text-slate-400 line-clamp-1">80 feet road junction slipping risk...</div>
              </button>
              <button
                type="button"
                onClick={() => handlePresetVoice("Dangerous road damage and broken asphalt near the school entrance with severe accident risk.")}
                className="civic-btn-preset p-2.5 rounded-xl text-[11px] text-left transition-all"
              >
                <div className="font-bold text-white text-xs mb-0.5">Road Damage</div>
                <div className="text-slate-400 line-clamp-1">School entrance road hazard...</div>
              </button>
              <button
                type="button"
                onClick={() => handlePresetVoice("Road broken and severe asphalt crack near bus stop.")}
                className="civic-btn-preset p-2.5 rounded-xl text-[11px] text-left transition-all"
              >
                <div className="font-bold text-white text-xs mb-0.5">Asphalt Crack</div>
                <div className="text-slate-400 line-clamp-1">Broken surface near bus stop...</div>
              </button>
            </div>
          </div>

          {/* Action Button: Parse with NLP */}
          <div>
            <button
              type="button"
              onClick={handleParseTranscript}
              disabled={isParsing || isRecording || !transcript.trim()}
              className="civic-btn-primary w-full py-3 px-4 font-bold rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.99]"
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Analyzing Speech with NLP Entity Extraction...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Extract Structured Civic Ticket with AI</span>
                </>
              )}
            </button>
          </div>

          {/* Parsed NLP Structured Ticket Card or Validation Rejection */}
          {parsedResult && (
            !parsedResult.is_valid_civic || !parsedResult.detected_category ? (
              <div className="glass-card rounded-2xl p-5 space-y-4 border border-rose-500/40 bg-rose-950/20 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Civic Defect Not Detected</span>
                  </span>
                  <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-bold border border-rose-500/30">
                    No Civic Issue Found
                  </span>
                </div>

                <div className="text-xs text-rose-200 leading-relaxed bg-rose-950/40 p-3 rounded-xl border border-rose-500/20">
                  {parsedResult.validation_message || 'Our AI engine did not detect any road damage, pothole, or civic infrastructure defect in this speech. Random words, greetings, or non-civic phrases cannot be submitted as official BBMP tickets.'}
                </div>

                <div className="bg-slate-950/70 p-3.5 rounded-xl border border-white/[0.06] text-xs space-y-2">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                    How to report an authentic civic issue:
                  </span>
                  <div className="space-y-1.5 text-slate-300 text-[11px]">
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                      <span className="text-emerald-400 font-semibold block mb-0.5">English Example:</span>
                      "Large pothole on 80 feet road junction causing bikes to skid and traffic congestion."
                    </div>
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                      <span className="text-teal-400 font-semibold block mb-0.5">ಕನ್ನಡ ಉದಾಹರಣೆ:</span>
                      "ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಬಿದ್ದಿದೆ, ವಾಹನಗಳು ಬೀಳುವ ಸಾಧ್ಯತೆಯಿದೆ." ಅಥವಾ "ಡಾಂಬರು ಕಿತ್ತುಹೋಗಿದೆ."
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedResult(null);
                      setTranscript('');
                    }}
                    className="btn-secondary w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 text-slate-300 hover:text-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Clear Transcript & Speak Again</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-5 space-y-4 border border-emerald-500/40 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>AI Extracted Civic Ticket</span>
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                    {(parsedResult.confidence * 100).toFixed(0)}% AI Match
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Category</span>
                    <span className="font-bold text-white">{parsedResult.detected_category}</span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Severity</span>
                    <span className={`font-bold ${
                      parsedResult.suggested_severity === 'CRITICAL' ? 'text-red-400' :
                      parsedResult.suggested_severity === 'HIGH' ? 'text-orange-400' : 'text-yellow-400'
                    }`}>
                      {parsedResult.suggested_severity}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06] col-span-2 sm:col-span-1">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">BBMP Ward</span>
                    <span className="font-bold text-white truncate block">{parsedResult.ward_name}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Assembly / MLA</span>
                    <span className="font-bold text-white truncate block">{parsedResult.assembly_constituency ? `${parsedResult.assembly_constituency} / ${parsedResult.mla_name || 'Not listed'}` : 'Not resolved'}</span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Parliament / MP</span>
                    <span className="font-bold text-white truncate block">{parsedResult.parliamentary_constituency ? `${parsedResult.parliamentary_constituency} / ${parsedResult.mp_name || 'Not listed'}` : 'Not resolved'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Coordinates</span>
                    <span className="font-mono text-emerald-300">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold block">Jurisdiction</span>
                    <span className={parsedResult.is_within_bengaluru ? 'font-bold text-emerald-300' : 'font-bold text-amber-300'}>{parsedResult.is_within_bengaluru ? `${parsedResult.zone_name || 'BBMP'} Zone` : 'Outside BBMP boundary'}</span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-3.5 rounded-xl border border-white/[0.06] text-xs space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold block">Normalized Description</span>
                  <p className="text-slate-200 leading-relaxed">{parsedResult.extracted_description}</p>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="btn-premium w-full py-3.5 rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting Verified Ticket...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 stroke-[2.5]" />
                      <span>Confirm & Submit Voice Report</span>
                    </>
                  )}
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Duplicate Warning Modal for Voice Submissions */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        onClose={() => {
          setShowDuplicateModal(false);
          setIsSubmitting(false);
        }}
        candidate={duplicateCandidate}
        newReport={{
          category: parsedResult?.detected_category || 'Voice Report',
          previewUrl: null,
          address: parsedResult?.formatted_address || `${parsedResult?.ward_name || 'Bengaluru'}, Karnataka`,
          description: parsedResult?.extracted_description || transcript
        }}
        onConfirmDuplicate={handleConfirmDuplicate}
        onForceNew={handleForceNewReport}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

