"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function AuthModal() {
  const { authOpen, setAuthOpen, login } = useStore();
  const titleId = useId();
  const descriptionId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "message"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = useCallback(() => {
    setAuthOpen(false);
    setFeedback(null);
    setShowPassword(false);
  }, [setAuthOpen]);

  useEffect(() => {
    if (!authOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => emailRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [authOpen, close]);

  if (!authOpen) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const result = await login(mode, name.trim(), email.trim(), password, phone, dateOfBirth);
    setSubmitting(false);
    if (result.error) {
      setFeedback({ type: "error", text: result.error });
      return;
    }
    if (result.message) {
      setFeedback({ type: "message", text: result.message });
      setPassword("");
      return;
    }
    reset();
  }

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setDateOfBirth("");
    setShowPassword(false);
  }

  function changeMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setFeedback(null);
    setPassword("");
  }

  return (
    <div className="auth-glass-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="auth-glass-orbs" aria-hidden="true">
        <span className="auth-glass-orb auth-glass-orb--one" />
        <span className="auth-glass-orb auth-glass-orb--two" />
        <span className="auth-glass-orb auth-glass-orb--three" />
      </div>

      <section ref={dialogRef} className="auth-glass-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="auth-glass-shine" aria-hidden="true" />
        <header className="auth-glass-header">
          <Link href="/" onClick={close} className="auth-glass-brand" aria-label="Yardly home">
            <span aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 27V13" /><path d="M16 17C9 17 6 12 6 6c6 0 10 3 10 9" /><path d="M16 13c1-6 5-9 11-9 0 7-4 11-11 11" /></svg></span>
            Yardly
          </Link>
          <button type="button" onClick={close} className="auth-glass-close" aria-label="Close login">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="auth-glass-intro">
          <p className="auth-glass-eyebrow">Room for the good stuff</p>
          <h2 id={titleId}>{mode === "login" ? "Welcome back" : "Join Yardly"}</h2>
          <p id={descriptionId}>{mode === "login" ? "Sign in to continue planning your next gathering." : "Create one account to book spaces, host your own, or do both."}</p>
        </div>

        <div className="auth-glass-tabs" role="tablist" aria-label="Choose account action">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => changeMode("login")}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => changeMode("signup")}>Sign up</button>
        </div>

        <form onSubmit={submit} className="auth-glass-form">
          {mode === "signup" && <div className="auth-glass-field"><label htmlFor="auth-name">Full name</label><input id="auth-name" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></div>}

          <div className="auth-glass-field">
            <label htmlFor="auth-email">Email address</label>
            <input ref={emailRef} id="auth-email" required type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </div>

          {mode === "signup" && (
            <div className="auth-glass-row">
              <div className="auth-glass-field"><label htmlFor="auth-phone">Phone number</label><input id="auth-phone" required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 555 123 4567" /></div>
              <div className="auth-glass-field"><label htmlFor="auth-birthday">Date of birth</label><input id="auth-birthday" required type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></div>
            </div>
          )}

          <div className="auth-glass-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-glass-password">
              <input id="auth-password" required type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "Create a secure password" : "Enter your password"} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </div>

          {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`auth-glass-feedback auth-glass-feedback--${feedback.type}`}>{feedback.text}</p>}

          <button type="submit" disabled={submitting} className="auth-glass-submit"><span>{submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</span>{!submitting && <span aria-hidden="true">→</span>}</button>

          {mode === "signup" && <p className="auth-glass-terms">By creating an account, you agree to Yardly&apos;s <Link href="/trust/#booking-policies" onClick={close}>booking policies</Link> and <Link href="/trust/#privacy" onClick={close}>privacy policy</Link>.</p>}

          <p className="auth-glass-switch">{mode === "login" ? "New to Yardly?" : "Already have an account?"}<button type="button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Log in instead"}</button></p>
        </form>

        <footer className="auth-glass-footer"><span><i aria-hidden="true" /> Secure authentication</span><span>Powered by Supabase</span></footer>
      </section>
    </div>
  );
}
