"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg("");
    const sb = supabaseBrowser();
    const { error } = signUp
      ? await sb.auth.signUp({ email, password })
      : await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f4] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xl font-bold text-[#0d2a24]">TaxCheck AI</p>
        <p className="mt-1 text-sm text-gray-500">
          {signUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
        </p>
        <input
          type="email"
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        <button
          onClick={submit}
          disabled={busy || !email || !password}
          className="mt-4 w-full rounded-lg bg-[#0f6b57] py-2 text-sm font-semibold text-white hover:bg-[#0c5748] disabled:bg-gray-400"
        >
          {busy ? "รอสักครู่..." : signUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
        </button>
        <button
          onClick={() => setSignUp(!signUp)}
          className="mt-3 w-full text-sm text-[#0f6b57]"
        >
          {signUp ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครสมาชิก"}
        </button>
      </div>
    </div>
  );
}