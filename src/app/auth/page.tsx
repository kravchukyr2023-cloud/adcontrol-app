"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    try {
      setLoading(true);
      setError("");

      if (isLogin) {
        const { error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          throw new Error(error.message);
        }
      } else {
        const { error } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (error) {
          throw new Error(error.message);
        }
      }

      window.location.href = "/projects";
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      setGoogleLoading(true);
      setError("");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/projects`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }
      // On success Supabase redirects the browser to Google — nothing else to do here.
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Google sign-in failed. Please try again.";
      setError(message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-zinc-800 bg-zinc-950 p-8 rounded-2xl">
        <h1 className="text-3xl font-bold mb-2">
          AdControl
        </h1>

        <p className="text-zinc-400 mb-8">
          {isLogin
            ? "Login to your account"
            : "Create your account"}
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="h-12 px-4 bg-black border border-zinc-800 rounded-lg outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className="h-12 px-4 bg-black border border-zinc-800 rounded-lg outline-none"
          />

          {error && (
            <p className="text-red-500 text-sm">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || googleLoading}
            className="h-12 rounded-lg bg-white text-black font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading
              ? "Loading..."
              : isLogin
              ? "Login"
              : "Create account"}
          </button>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-500">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={loading || googleLoading}
            className="h-12 rounded-lg border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 transition flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                fill="#FFC107"
                d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
              />
              <path
                fill="#FF3D00"
                d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
              />
            </svg>
            <span className="text-sm font-medium">
              {googleLoading
                ? "Redirecting..."
                : "Continue with Google"}
            </span>
          </button>

          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-sm text-zinc-400 hover:text-white transition"
          >
            {isLogin
              ? "Create new account"
              : "Already have account?"}
          </button>
        </div>
      </div>
    </div>
  );
}
