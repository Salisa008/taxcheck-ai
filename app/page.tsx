"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { useRef, useState } from "react";
import {
  validateReceipt,
  isValidTaxId,
  type ReceiptData,
  type Status,
} from "@/lib/validate";
import Dashboard from "./Dashboard";

type Item = {
  id: string;
  file: File;
  preview: string;
  state: "queue" | "reading" | "done" | "error";
  data?: ReceiptData & Record<string, unknown>;
  error?: string;
  label?: string;
  saved?: boolean;
};

type Tab = "upload" | "review" | "dashboard" | "library";

const TABS: [Tab, string][] = [
  ["upload", "อัปโหลด"],
  ["review", "ตรวจทาน"],
  ["dashboard", "แดชบอร์ด"],
  ["library", "คลังใบเสร็จ"],
];

const STATUS_UI: Record<Status, { icon: string; label: string; cls: string }> = {
  ok: { icon: "✅", label: "ใช้ได้", cls: "bg-green-100 text-green-800" },
  review: { icon: "⚠️", label: "ตรวจสอบเพิ่ม", cls: "bg-yellow-100 text-yellow-800" },
  invalid: { icon: "❌", label: "ใช้ไม่ได้", cls: "bg-red-100 text-red-800" },
};

const FIELDS: [string, string][] = [
  ["seller_name", "ผู้ขาย"],
  ["seller_tax_id", "เลขภาษี"],
  ["buyer_name", "ชื่อผู้ซื้อ"],
  ["invoice_no", "เลขที่เอกสาร"],
  ["date", "วันที่ (YYYY-MM-DD)"],
  ["subtotal", "ก่อน VAT"],
  ["vat", "VAT"],
  ["total", "รวม"],
  ["category", "หมวดบัญชี"],
];

const isPdf = (f: File) => f.type === "application/pdf";

async function shrinkImage(file: File, maxSize = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", 0.85)
  );
  return new File([blob], file.name, { type: "image/jpeg" });
}

function Chip({ label, state }: { label: string; state: "done" | "wait" | "fail" }) {
  const cls =
    state === "done"
      ? "bg-[#e3f2ec] text-[#0f6b57]"
      : state === "fail"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-500";
  const mark = state === "done" ? "✓ " : state === "fail" ? "✗ " : "… ";
  return (
    <span className={`rounded-full px-3 py-1 text-xs ${cls}`}>
      {mark}
      {label}
    </span>
  );
}

function Thumb({ item }: { item: Item }) {
  if (isPdf(item.file)) {
    return (
      <div className="flex h-14 w-11 items-center justify-center rounded-lg bg-red-50 text-xs font-bold text-red-600">
        PDF
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.preview}
      alt={item.file.name}
      className="h-14 w-11 rounded-lg bg-gray-100 object-cover"
    />
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("upload");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  function patch(id: string, p: Partial<Item>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter(
      (f) => f.type.startsWith("image/") || isPdf(f)
    );
    if (files.length === 0) return;
        const tooBig = files.filter((f) => isPdf(f) && f.size > 4 * 1024 * 1024);
    if (tooBig.length > 0) {
      alert("PDF ใหญ่เกิน 4 MB ยังอัปโหลดไม่ได้: " + tooBig.map((f) => f.name).join(", "));
    }
    const newItems: Item[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      preview: URL.createObjectURL(f),
      state: "queue",
    }));
    setItems((prev) => [...prev, ...newItems]);

    for (const it of newItems) {
      patch(it.id, { state: "reading" });
      try {
        const form = new FormData();
        form.append("file", isPdf(it.file) ? it.file : await shrinkImage(it.file));
        const res = await fetch("/api/read-receipt", { method: "POST", body: form });
        const json = await res.json();

        if (Array.isArray(json.data) && json.data.length > 0) {
          const [first, ...rest] = json.data as Item["data"][];
          patch(it.id, {
            state: "done",
            data: first,
            label: json.data.length > 1 ? "ใบที่ 1" : undefined,
          });
          if (rest.length > 0) {
            const extra: Item[] = rest.map((d, k) => ({
              id: crypto.randomUUID(),
              file: it.file,
              preview: it.preview,
              state: "done" as const,
              data: d,
              label: `ใบที่ ${k + 2}`,
            }));
            setItems((prev) => {
              const idx = prev.findIndex((x) => x.id === it.id);
              return [...prev.slice(0, idx + 1), ...extra, ...prev.slice(idx + 1)];
            });
          }
        } else {
          patch(it.id, {
            state: "error",
            error: json.error ?? "ไม่พบใบเสร็จในไฟล์นี้",
          });
        }
      } catch {
        patch(it.id, { state: "error", error: "เชื่อมต่อไม่ได้" });
      }
    }
  }

  function updateField(id: string, field: string, value: string) {
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== id || !r.data) return r;
        const numeric = ["subtotal", "vat", "total"].includes(field);
        const parsed = numeric ? (value === "" ? null : Number(value)) : value || null;
        return { ...r, data: { ...r.data, [field]: parsed } };
      })
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function save(ids: string[]) {
    const targets = items.filter((x) => ids.includes(x.id) && x.data && !x.saved);
    if (targets.length === 0) return;
    const rows = targets.map((x) => {
      const d = x.data!;
      const v = validateReceipt(d);
      const okDate = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
      return {
        doc_date: okDate ? d.date : null,
        month: okDate ? d.date!.slice(0, 7) : null,
        doc_type: d.doc_type,
        invoice_no: d.invoice_no,
        seller_name: d.seller_name,
        seller_tax_id: d.seller_tax_id,
        buyer_name: d.buyer_name,
        subtotal: d.subtotal,
        vat: d.vat,
        total: d.total,
        category: d.category,
        status: v.status,
        reasons: v.reasons.join(" | "),
        file_name: x.file.name + (x.label ? ` ${x.label}` : ""),
      };
    });
    setSaving(true);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (json.ok) {
        setItems((prev) =>
          prev.map((x) => (targets.some((t) => t.id === x.id) ? { ...x, saved: true } : x))
        );
      } else {
        alert("บันทึกไม่สำเร็จ: " + (json.error ?? "ไม่ทราบสาเหตุ"));
      }
    } catch {
      alert("บันทึกไม่สำเร็จ: เชื่อมต่อไม่ได้");
    }
    setSaving(false);
  }

  const doneItems = items.filter((x) => x.state === "done" && x.data);
  const unsaved = doneItems.filter((x) => !x.saved);

  return (
    <div className="min-h-screen bg-[#f3f5f4] text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f6b57] text-white">
              🧾
            </div>
            <span className="font-bold">TaxCheck AI</span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-2 text-sm ${
                  tab === key
                    ? "bg-[#e3f2ec] font-semibold text-[#0f6b57]"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <span className="ml-auto text-sm text-gray-500">
            [ชื่อบริษัทของคุณ] · ตุลาคม 2569
          </span>
                    <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              window.location.href = "/login";
            }}
            className="text-sm text-gray-500 hover:text-red-600"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {tab === "upload" && (
          <>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#0d2a24]">
              โยนใบเสร็จเข้ามา แล้วได้รายงานภาษีซื้อที่พร้อมใช้
            </h1>
            <p className="mt-4 max-w-3xl text-gray-600">
              AI อ่านใบกำกับภาษีให้ ตรวจเลขผู้เสียภาษีและยอด VAT ให้
              แล้วบอกว่าใบไหนนำไปหักภาษีซื้อได้ ไม่ต้องคีย์ทีละใบอีกต่อไป
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`mt-8 flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-14 text-center ${
                dragging ? "border-[#0f6b57] bg-[#e3f2ec]" : "border-[#8fb8ab] bg-white"
              }`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e3f2ec] text-2xl text-[#0f6b57]">
                ⬆
              </div>
              <p className="mt-6 text-2xl font-bold">ลากไฟล์ใบเสร็จมาวางที่นี่</p>
              <p className="mt-4 text-sm text-gray-500">
                เลือกได้หลายใบพร้อมกัน · รองรับ JPG, PNG, PDF
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg bg-[#0f6b57] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0c5748]"
                >
                  เลือกไฟล์จากเครื่อง
                </button>
                <button
                  onClick={() => camRef.current?.click()}
                  className="rounded-lg border border-[#0f6b57] bg-white px-6 py-3 text-sm font-semibold text-[#0f6b57] hover:bg-[#e3f2ec]"
                >
                  ถ่ายรูปด้วยมือถือ
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {items.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-bold">กำลังประมวลผล</h2>
                <div className="mt-4 space-y-3">
                  {items.map((it) => {
                    const d = it.data;
                    const taxOk = d ? isValidTaxId(d.seller_tax_id) : false;
                    const vatOk =
                      d && d.subtotal != null && d.vat != null && d.total != null
                        ? Math.abs(d.subtotal + d.vat - d.total) <= 0.05
                        : false;
                    const sub =
                      it.state === "queue"
                        ? "รอคิว"
                        : it.state === "reading"
                        ? "กำลังอ่านข้อมูล..."
                        : it.state === "error"
                        ? it.error
                        : it.saved
                        ? "บันทึกแล้ว"
                        : "อ่านเสร็จแล้ว · พร้อมตรวจทาน";
                    return (
                      <div
                        key={it.id}
                        className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4"
                      >
                        <Thumb item={it} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">
                            {it.file.name} {it.label ?? ""}
                          </p>
                          <p
                            className={`text-sm ${
                              it.state === "error" ? "text-red-600" : "text-gray-500"
                            }`}
                          >
                            {sub}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {it.state === "queue" && <Chip label="รอ" state="wait" />}
                          {it.state === "reading" && <Chip label="อ่านข้อมูล" state="wait" />}
                          {it.state === "done" && (
                            <>
                              <Chip label="อ่านข้อมูล" state="done" />
                              <Chip label="ตรวจเลขภาษี" state={taxOk ? "done" : "fail"} />
                              <Chip label="ตรวจ VAT" state={vatOk ? "done" : "fail"} />
                              <button
                                onClick={() => setTab("review")}
                                className="ml-2 text-sm font-semibold text-[#0f6b57]"
                              >
                                ตรวจทาน →
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => removeItem(it.id)}
                            className="ml-1 text-sm text-gray-400 hover:text-red-500"
                            aria-label="ลบ"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                ["ขั้นที่ 1", "อัปโหลด", "ลากวางหรือถ่ายรูปใบเสร็จจากมือถือได้เลย"],
                ["ขั้นที่ 2", "AI อ่านและตรวจสอบ", "ดึงข้อมูล เช็คเลขภาษี 13 หลัก ยอด VAT และภาษีซื้อต้องห้าม"],
                ["ขั้นที่ 3", "ตรวจทานแล้วยืนยัน", "แก้ช่องที่ AI ไม่มั่นใจ แล้วส่งออก Excel สำหรับ ภ.พ.30"],
              ].map(([step, title, desc]) => (
                <div key={step}>
                  <p className="text-xs font-semibold text-[#0f6b57]">{step}</p>
                  <p className="mt-1 font-bold">{title}</p>
                  <p className="mt-1 text-sm text-gray-500">{desc}</p>
                </div>
              ))}
            </section>
          </>
        )}

        {tab === "review" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-[#0d2a24]">ตรวจทาน</h1>
              {unsaved.length > 0 && (
                <button
                  onClick={() => save(unsaved.map((x) => x.id))}
                  disabled={saving}
                  className="ml-auto rounded-lg bg-[#0f6b57] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0c5748] disabled:bg-gray-400"
                >
                  {saving ? "กำลังบันทึก..." : `ยืนยันทั้งหมด (${unsaved.length} ใบ)`}
                </button>
              )}
            </div>
            <p className="mt-2 text-gray-600">
              รูปต้นฉบับอยู่ซ้าย ข้อมูลที่อ่านได้อยู่ขวา แก้ไขได้ทันที
              ช่องสีเหลืองคือช่องที่ AI ไม่มั่นใจ
            </p>
            {doneItems.length === 0 && (
              <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
                ยังไม่มีใบเสร็จที่อ่านเสร็จ ไปที่แท็บ “อัปโหลด” ก่อนนะ
              </div>
            )}
            <div className="mt-8 space-y-6">
              {doneItems.map((r) => {
                const v = validateReceipt(r.data!);
                const ui = STATUS_UI[v.status];
                const conf = r.data!.confidence as Record<string, number> | undefined;
                const pageNo = Number(r.data?.page) || 1;
                return (
                  <div
                    key={r.id}
                    className="grid gap-6 rounded-2xl border border-gray-200 bg-white p-5 md:grid-cols-[280px_1fr]"
                  >
                    {isPdf(r.file) ? (
                      <iframe
                        key={`${r.id}-${pageNo}`}
                        src={`${r.preview}#page=${pageNo}`}
                        title={r.file.name}
                        className="h-96 w-full rounded-xl bg-gray-100"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.preview}
                        alt={r.file.name}
                        className="max-h-96 w-full rounded-xl bg-gray-100 object-contain"
                      />
                    )}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold">
                          {r.file.name} {r.label ?? ""}
                          {isPdf(r.file) && (
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              หน้า {pageNo}
                            </span>
                          )}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${ui.cls}`}
                        >
                          {ui.icon} {ui.label}
                        </span>
                      </div>
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                        {v.reasons.map((reason, j) => (
                          <li
                            key={j}
                            className={
                              v.status === "ok" ? "text-green-700" : "font-medium text-red-600"
                            }
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
                        {FIELDS.map(([field, label]) => {
                          const val = String(r.data?.[field] ?? "");
                          const low = conf?.[field] !== undefined && conf[field] < 0.8;
                          return (
                            <label key={field} className="contents">
                              <span className="self-center text-gray-500">{label}</span>
                              <input
                                disabled={r.saved}
                                className={`rounded border px-2 py-1 disabled:bg-gray-100 ${
                                  val === ""
                                    ? "border-red-500 bg-red-50"
                                    : low
                                    ? "border-yellow-400 bg-yellow-50"
                                    : "border-gray-300"
                                }`}
                                value={val}
                                onChange={(e) => updateField(r.id, field, e.target.value)}
                              />
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-4 flex justify-end">
                        {r.saved ? (
                          <span className="text-sm font-semibold text-[#0f6b57]">
                            ✓ บันทึกแล้ว
                          </span>
                        ) : (
                          <button
                            onClick={() => save([r.id])}
                            disabled={saving}
                            className="rounded-lg bg-[#0f6b57] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0c5748] disabled:bg-gray-400"
                          >
                            ยืนยันและบันทึก
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "dashboard" && <Dashboard key="dash" mode="dashboard" />}
        {tab === "library" && <Dashboard key="lib" mode="library" />}
      </main>
    </div>
  );
}