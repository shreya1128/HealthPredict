import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Check, X, AlertCircle, Volume2, ShieldAlert } from 'lucide-react'
import { voiceService } from '../../services/voiceService'

export default function VoiceEntryModal({ isOpen, onClose, onSaved }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedResult, setParsedResult] = useState(null)
  const [editedFields, setEditedFields] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [speechSupported, setSpeechSupported] = useState(true)

  const recognitionRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onstart = () => {
          setIsListening(true)
          setError(null)
        }

        recognition.onresult = (event) => {
          const current = event.resultIndex
          const text = event.results[current][0].transcript
          setTranscript(text)
          setIsListening(false)
          handleParseTranscript(text)
        }

        recognition.onerror = (event) => {
          console.warn('Speech recognition error:', event.error)
          setIsListening(false)
          if (event.error === 'not-allowed') {
            setError('Microphone permission denied. Please allow microphone access or type your entry below.')
          } else {
            setError('Could not capture audio clearly. Please try again or type below.')
          }
        }

        recognition.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = recognition
      } else {
        setSpeechSupported(false)
      }
    }
  }, [])

  const startListening = () => {
    setError(null)
    setParsedResult(null)
    setTranscript('')
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
      } catch (e) {
        console.warn('Recognition already started or failed to start:', e)
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }

  const handleParseTranscript = async (text) => {
    if (!text || !text.trim()) return
    setParsing(true)
    setError(null)
    try {
      const res = await voiceService.parseTranscript(text)
      setParsedResult(res)
      if (res.recognized && res.structured_fields) {
        setEditedFields({ ...res.structured_fields })
      }
    } catch (err) {
      console.error('Failed to parse speech:', err)
      setError('Unable to parse voice text. Please enter manually.')
    } finally {
      setParsing(false)
    }
  }

  const handleConfirmSave = async () => {
    if (!parsedResult || !parsedResult.metric_type) return
    setSaving(true)
    setError(null)
    try {
      await voiceService.confirmSave(parsedResult.metric_type, editedFields)
      if (onSaved) onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to save voice health record:', err)
      setError('Failed to record health measurement. Please check your connection.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">Quick Health Entry</h3>
              <p className="text-2xs text-teal-100">Type or dictate your daily vitals & activities</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Privacy & Disclaimers */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <p className="text-2xs text-slate-600 leading-relaxed">
              Uses your browser's Web Speech API (Chrome, Edge). Audio is processed by your browser vendor according to their speech recognition privacy policy. Values require your explicit confirmation before being recorded.
            </p>
          </div>

          {/* Voice Mic Trigger */}
          <div className="text-center py-4">
            {speechSupported ? (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-all shadow-md ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse ring-4 ring-rose-200'
                    : 'bg-teal-600 hover:bg-teal-700 text-white hover:scale-105'
                }`}
              >
                {isListening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </button>
            ) : (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
                <span className="font-semibold block mb-0.5">Voice Dictation Unsupported</span>
                Speech recognition is only supported in Chromium-based browsers (Chrome, Edge). On Firefox and Safari, please use the typed entry field below.
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2 font-medium">
              {isListening ? 'Listening... Speak now' : speechSupported ? 'Tap microphone to speak' : 'Type your entry below'}
            </p>
          </div>

          {/* Examples Hint */}
          <div className="text-2xs text-slate-500 bg-slate-50 rounded-lg p-2.5 space-y-1">
            <span className="font-semibold text-slate-700 block">Examples you can say:</span>
            <p className="italic">"My blood pressure is 120 over 80"</p>
            <p className="italic">"My weight is 68 kilograms" or "I slept 7 hours"</p>
            <p className="italic">"Drank 500 ml of water" or "Ran for 30 minutes"</p>
          </div>

          {/* Manual Input / Transcript Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Transcript or Typed Input:</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="e.g. My weight is 70 kg..."
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={() => handleParseTranscript(transcript)}
                disabled={parsing || !transcript.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {parsing ? 'Parsing...' : 'Parse'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Confirmation Preview */}
          {parsedResult && parsedResult.recognized && (
            <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  Confirm Extracted Entry: {parsedResult.metric_type}
                </span>
                <span className="text-2xs px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-semibold">
                  {(parsedResult.confidence * 100).toFixed(0)}% Match
                </span>
              </div>

              {/* Editable values grid */}
              <div className="space-y-2 bg-white rounded-lg p-2.5 border border-teal-100">
                {Object.entries(editedFields).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}:</span>
                    <input
                      type={typeof v === 'number' ? 'number' : 'text'}
                      value={v}
                      onChange={(e) =>
                        setEditedFields({
                          ...editedFields,
                          [k]: typeof v === 'number' ? parseFloat(e.target.value) || 0 : e.target.value,
                        })
                      }
                      className="border border-slate-200 rounded px-2 py-1 text-right font-semibold text-slate-800 w-28 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Confirm & Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setParsedResult(null)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
