"use client";

import { useState, useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionInstance = any;
type SpeechRecognitionEvent = any;
type SpeechRecognitionErrorEvent = any;

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [cardUrl, setCardUrl] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : {};
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error !== "no-speech") {
          setErrorMessage(`Speech Error: ${event.error}`);
          setStatus("error");
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      setErrorMessage("Web Speech API is not supported in this browser.");
    }
  }, []);

  const startRecording = () => {
    setErrorMessage("");
    setCardUrl("");
    setTranscript("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setStatus("listening");
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  };

  const stopRecordingAndSend = async () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    if (!transcript.trim()) {
      setStatus("idle");
      return;
    }

    setStatus("processing");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process voice dump.");
      }

      setStatus("success");
      setCardUrl(data.cardUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 max-w-md mx-auto relative overflow-hidden select-none">
      {/* Header */}
      <header className="w-full text-center pt-4">
        <h1 className="text-xl font-bold tracking-tight text-amber-500 uppercase">
          Brain Dump Hub
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Zero Cloud Audio • Local Transcribe • Automated Trello Intake
        </p>
      </header>

      {/* Main Recording Display */}
      <div className="w-full flex-1 flex flex-col items-center justify-center my-6 space-y-6">
        {/* Visual Pulse Button */}
        <button
          onClick={isRecording ? stopRecordingAndSend : startRecording}
          disabled={status === "processing"}
          className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl ${
            isRecording
              ? "bg-red-600 shadow-red-600/50 animate-pulse"
              : status === "processing"
              ? "bg-amber-600 opacity-60 cursor-not-allowed"
              : "bg-emerald-600 shadow-emerald-600/40 hover:bg-emerald-500"
          }`}
        >
          <div className="text-4xl mb-1">
            {isRecording ? "⏹️" : status === "processing" ? "⚙️" : "🎙️"}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            {isRecording
              ? "Tap to Process"
              : status === "processing"
              ? "Structuring..."
              : "Tap to Dump"}
          </span>
        </button>

        {/* Live Transcript Box */}
        <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-[140px] max-h-[220px] overflow-y-auto text-sm text-slate-300">
          {transcript ? (
            <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
          ) : (
            <p className="text-slate-600 italic text-center mt-8">
              {isRecording
                ? "Listening... speak freely."
                : "Tap the microphone button and start talking..."}
            </p>
          )}
        </div>

        {/* Status Alerts */}
        {status === "processing" && (
          <p className="text-xs text-amber-400 animate-pulse font-medium">
            ⚡ Gemini cleaning notes & creating Trello card...
          </p>
        )}

        {status === "success" && (
          <div className="w-full bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-3 text-center text-xs text-emerald-300 space-y-1">
            <p className="font-semibold">✅ Trello Card Created Successfully!</p>
            {cardUrl && (
              <a
                href={cardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-emerald-400 hover:text-emerald-200 block font-mono"
              >
                Open Card in Trello →
              </a>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="w-full bg-red-950/60 border border-red-500/40 rounded-lg p-3 text-center text-xs text-red-300">
            <p className="font-semibold">⚠️ Processing Failed</p>
            <p className="mt-0.5 text-red-400">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <footer className="w-full text-center pb-4 text-[10px] text-slate-500">
        <p>Audio is transcribed on-device • Sent directly to your Trello board</p>
      </footer>
    </main>
  );
}