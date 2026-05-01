import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function getSpeechRecognition(): SpeechRecognition | null {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return new SR();
}

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
  variant?: "light" | "dark";
  className?: string;
  disabled?: boolean;
}

export function VoiceMicButton({ onTranscript, variant = "light", disabled = false, className = "" }: VoiceMicButtonProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = getSpeechRecognition();
    if (!recognition) return;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-AU";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) onTranscript(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
    }
  }, [listening, onTranscript]);

  if (!supported) return null;

  const baseClasses = "p-2 rounded-full transition-all flex items-center justify-center flex-shrink-0";

  const variantClasses = listening
    ? "bg-red-500 text-white animate-pulse"
    : variant === "dark"
      ? "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
      : "text-foreground-faint hover:text-sky hover:bg-muted";

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
      title={listening ? "Stop listening" : "Voice input"}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      aria-pressed={listening}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
