"use client";

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";

const LENGTH = 6;

export default function PinPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) => inputs.current[i]?.focus();

  const submit = async (pin: string) => {
    if (pin.length !== LENGTH) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setShake(true);
        setError("Incorrect PIN. Try again.");
        setDigits(Array(LENGTH).fill(""));
        setTimeout(() => {
          setShake(false);
          focus(0);
        }, 600);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    setError("");
    if (digit && i < LENGTH - 1) focus(i + 1);
    if (next.every((d) => d !== "")) submit(next.join(""));
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const next = [...digits];
        next[i] = "";
        setDigits(next);
      } else if (i > 0) {
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      focus(i - 1);
    } else if (e.key === "ArrowRight" && i < LENGTH - 1) {
      focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((d, idx) => (next[idx] = d));
    setDigits(next);
    setError("");
    const lastFilled = Math.min(pasted.length, LENGTH - 1);
    focus(lastFilled);
    if (pasted.length === LENGTH) submit(pasted);
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-8 px-6">
        {/* icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-3xl shadow-lg">
          🔒
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-white">Enter PIN</h1>
          <p className="text-sm text-zinc-500">Enter your 6-digit PIN to continue</p>
        </div>

        {/* digit inputs */}
        <div
          className={`flex gap-3 transition-transform ${shake ? "animate-shake" : ""}`}
          style={shake ? { animation: "shake 0.5s ease" } : {}}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              disabled={loading}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className={`h-14 w-12 rounded-xl border text-center text-xl font-bold outline-none transition-all
                ${d ? "border-indigo-500 bg-indigo-950/60 text-white" : "border-zinc-700 bg-zinc-900 text-white"}
                focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30
                disabled:opacity-50`}
            />
          ))}
        </div>

        {/* error */}
        <div className="h-5">
          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* submit button (fallback if auto-submit doesn't fire) */}
        <button
          onClick={() => submit(digits.join(""))}
          disabled={digits.some((d) => !d) || loading}
          className="w-48 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {loading ? "Verifying…" : "Unlock"}
        </button>
      </div>

      <p className="mt-8 font-mono text-[11px] text-zinc-700">
        {process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev"}
      </p>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
          90% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
