"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "success" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cardUrl, setCardUrl] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setErrorMessage("");
    setCardUrl("");
    setTranscript("");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAndProcessAudio(audioBlob);
        // Stop all mic tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("listening");
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      setErrorMessage("Could not access microphone.");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("processing");
    }
  };

  const uploadAndProcessAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "dump.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to process audio.");

      setTranscript(data.transcript);
      setCardUrl(data.cardUrl);
      setStatus("success");
    } catch (err: any) {
      setErrorMessage(err.message || "Something went wrong.");
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 max-w-md mx-auto relative overflow-hidden select-none">
      <header className="w-full text-center pt-4">
        <h1 className="text-xl font-bold tracking-tight text-amber-500 uppercase">
          Brain Dump Hub
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Direct Audio Processing • Automated Trello Intake
        </p>
      </header>

      <div className="w-full flex-1 flex flex-col items-center justify-center my-6 space-y-6">
        <button
          onClick={isRecording ? stopRecording : startRecording}
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
              ? "Uploading..."
              : "Tap to Dump"}
          </span>
        </button>

        <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-[140px] max-h-[220px] overflow-y-auto text-sm text-slate-300">
          {transcript ? (
            <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
          ) : (
            <p className="text-slate-600 italic text-center mt-8">
              {isRecording
                ? "Recording voice dump..."
                : status === "processing"
                ? "Processing audio with Gemini..."
                : "Tap the button, speak your dump, tap again to send."}
            </p>
          )}
        </div>

        {status === "processing" && (
          <p className="text-xs text-amber-400 animate-pulse font-medium">
            ⚡ Transcribing audio & pushing card to Trello...
          </p>
        )}

        {status === "success" && (
          <div className="w-full bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-3 text-center text-xs text-emerald-300 space-y-1">
            <p className="font-semibold">✅ Sent to Trello Successfully!</p>
            {cardUrl && (
              <a
                href={cardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-emerald-400 hover:text-emerald-200 block font-mono"
              >
                Open Trello Card →
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

      <footer className="w-full text-center pb-4 text-[10px] text-slate-500">
        <p>Audio sent directly to server • No third-party data retention</p>
      </footer>
    </main>
  );
}