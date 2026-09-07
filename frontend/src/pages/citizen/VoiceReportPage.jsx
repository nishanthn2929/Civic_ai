import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Send, CheckCircle2, AlertCircle, RefreshCw, Globe } from 'lucide-react';
import { citizenService } from '../../services/api';

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
  const [speechSupported, setSpeechSupported] = useState(true);

  // Initialize SpeechRecognition if available
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setSpeechSupported(false);
    }
  }, []);

  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. You can type spoken words directly below.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((res) => res[0].transcript)
          .join('');
        setTranscript(text);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsRecording(false);
    }
  };

  // Trigger backend NLP entity parsing
  const handleParseTranscript = async () => {
    if (!transcript.trim()) return;
    setIsParsing(true);
    try {
      const res = await citizenService.parseVoice({
        transcript,
        language: language.startsWith('kn') ? 'kn' : 'en',
        latitude,
        longitude
      });
      setParsedResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsParsing(false);
    }
  };

  // Quick preset voice queries for demonstration
  const handlePresetVoice = (sampleText) => {
    setTranscript(sampleText);
    setTimeout(async () => {
      setIsParsing(true);
      try {
        const res = await citizenService.parseVoice({
          transcript: sampleText,
          language: 'en',
          latitude,
          longitude
        });
        setParsedResult(res);
      } finally {
        setIsParsing(false);
      }
    }, 100);
  };

  const handleSubmit = async () => {
    if (!parsedResult) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', parsedResult.detected_category);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      formData.append('raw_text', parsedResult.extracted_description);
      formData.append('address', `${parsedResult.ward_name || 'Bengaluru'}, Karnataka`);
      formData.append('source', 'voice');

      const res = await citizenService.createReport(formData);
      setSubmitDone(true);
      if (onReportSuccess) onReportSuccess(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
          <Volume2 className="w-6 h-6 text-emerald-400" />
          <span>Voice Complaint Assistant</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
          Speak your grievance in English or Kannada. Our NLP engine extracts the issue, urgency, and routes it to the local BBMP ward.
        </p>

        {/* Language selector */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className="text-xs text-slate-400">Language:</span>
          <button
            onClick={() => setLanguage('en-IN')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              language === 'en-IN'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            English (India)
          </button>
          <button
            onClick={() => setLanguage('kn-IN')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              language === 'kn-IN'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            ಕನ್ನಡ (Kannada)
          </button>
        </div>
      </div>

      {submitDone ? (
        /* Submission Done */
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white">Voice Complaint Submitted!</h2>
          <p className="text-xs sm:text-sm text-slate-300">
            The civic intelligence engine has converted your voice recording into a verified civic ticket.
          </p>
          <button
            onClick={() => {
              setSubmitDone(false);
              setTranscript('');
              setParsedResult(null);
            }}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
          >
            Record Another Complaint
          </button>
        </div>
      ) : (
        /* Voice Recording Box */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          {/* Central Microphone Button */}
          <div className="flex flex-col items-center justify-center py-4">
            <button
              onClick={handleToggleRecord}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl relative ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse shadow-red-500/50 scale-105'
                  : 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-slate-950 hover:scale-105 shadow-emerald-500/20'
              }`}
            >
              {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10 stroke-[2.5]" />}
            </button>
            <div className="mt-3 text-xs font-semibold text-slate-300">
              {isRecording ? 'Listening... Speak clearly' : 'Tap to Start Speaking'}
            </div>
          </div>

          {/* Transcript Display Box */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-400">Spoken Complaint Transcript</label>
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. There is a deep pothole near the main road and bikes are having difficulty crossing it..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Sample Prompts */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400">Try quick voice samples:</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePresetVoice("There is a large pothole near the 80 feet road junction and two wheelers are slipping.")}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors text-left"
              >
                "Large pothole near 80ft road..."
              </button>
              <button
                type="button"
                onClick={() => handlePresetVoice("Dangerous open manhole near the school entrance with severe accident risk.")}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors text-left"
              >
                "Dangerous open manhole near school..."
              </button>
              <button
                type="button"
                onClick={() => handlePresetVoice("Road broken and severe asphalt crack near bus stop.")}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors text-left"
              >
                "Road broken and asphalt crack..."
              </button>
            </div>
          </div>

          {/* Action: Parse with NLP */}
          <div className="pt-2">
            <button
              onClick={handleParseTranscript}
              disabled={isParsing || !transcript.trim()}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Analyzing Speech with NLP...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Extract Structured Civic Ticket</span>
                </>
              )}
            </button>
          </div>

          {/* Parsed NLP Structured Ticket Card */}
          {parsedResult && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 space-y-4 animate-in fade-in shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Structured Report Extracted by NLP</span>
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-semibold">
                  {(parsedResult.confidence * 100).toFixed(0)}% Confidence
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-slate-900 p-2.5 rounded-lg">
                  <span className="text-slate-500 text-[10px] block">Identified Category</span>
                  <span className="font-bold text-white">{parsedResult.detected_category}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg">
                  <span className="text-slate-500 text-[10px] block">Extracted Severity</span>
                  <span className={`font-bold ${
                    parsedResult.suggested_severity === 'CRITICAL' ? 'text-red-400' :
                    parsedResult.suggested_severity === 'HIGH' ? 'text-orange-400' : 'text-yellow-400'
                  }`}>
                    {parsedResult.suggested_severity}
                  </span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg col-span-2 sm:col-span-1">
                  <span className="text-slate-500 text-[10px] block">Mapped Bengaluru Ward</span>
                  <span className="font-semibold text-white truncate block">{parsedResult.ward_name}</span>
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg text-xs">
                <span className="text-slate-500 text-[10px] block mb-1">Generated Issue Description</span>
                <p className="text-slate-200">{parsedResult.extracted_description}</p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting Ticket...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm & Submit Voice Report</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
