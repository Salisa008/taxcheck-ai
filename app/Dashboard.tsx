"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  id: string;
  doc_date: string | null;
  month: string | null;
  doc_type: string | null;
  invoice_no: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  category: string | null;
  status: "ok" | "review" | "invalid";
  reasons: string | null;
  file_name: string | null;
};

const LABEL = { ok: "ขอคืนได้", review: "รอตรวจสอบ", invalid: "ต้องห้าม" } as const;
const BADGE = {
  ok: "bg-green-100 text-green-800",
  review: "bg-yellow-100 text-yellow-800",
  invalid: "bg-red-100 text-red-800",
} as const;
const BAR = { ok: "bg-[#0f6b57]", review: "bg-yellow-400", invalid: "bg-red-500" } as const;

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Dashboard({ mode }: { mode: "dashboard" | "library" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/receipts");
      const json = await res.json();
      if (json.rows) setRows(json.rows);
      else setError(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const months = Array.from(new Set(rows.map((r) => r.month).filter(Boolean) as string[])).sort().reverse();
  const filtered = month === "all" ? rows : rows.filter((r) => r.month === month);

  const sumVat = (s: Row["status"]) =>
    filtered.filter((r) => r.status === s).reduce((a, r) => a + (r.vat ?? 0), 0);

  const byMonth = new Map<string, Record<Row["status"], number>>();
  for (const r of rows) {
    const k = r.month ?? "ไม่ระบุ";
    const cur = byMonth.get(k) ?? { ok: 0, review: 0, invalid: 0 };
    cur[r.status] += r.vat ?? 0;
    byMonth.set(k, cur);
  }
  const monthList = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMonth = Math.max(1, ...monthList.map(([, v]) => v.ok + v.review + v.invalid));

  function exportExcel() {
    const detail = filtered.map((r) => ({
      วันที่: r.doc_date,
      เลขที่เอกสาร: r.invoice_no,
      ชื่อผู้ขาย: r.seller_name,
      เลขประจำตัวผู้เสียภาษี: r.seller_tax_id,
      ชื่อผู้ซื้อ: r.buyer_name,
      มูลค่าสินค้า: r.subtotal,
      "ภาษีมูลค่าเพิ่ม (7%)": r.vat,
      จำนวนเงินรวม: r.total,
      หมวดบัญชี: r.category,
      สถานะ: LABEL[r.status],
      เหตุผล: r.reasons,
      ไฟล์: r.file_name,
    }));
    const summary = monthList.map(([m, v]) => ({
      เดือน: m,
      "ภาษีซื้อขอคืนได้": v.ok,
      "ภาษีซื้อรอตรวจสอบ": v.review,
      "ภาษีซื้อต้องห้าม": v.invalid,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Receipts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.writeFile(wb, `taxcheck-${month === "all" ? "ทั้งหมด" : month}.xlsx`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-[#0d2a24]">
          {mode === "dashboard" ? "แดชบอร์ด" : "คลังใบเสร็จ"}
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">ทุกเดือน</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            รีเฟรช
          </button>
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="rounded-lg bg-[#0f6b57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0c5748] disabled:bg-gray-400"
          >
            ส่งออก Excel
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-gray-500">กำลังโหลด...</p>}
      {error && <p className="mt-6 text-red-600">{error}</p>}

      {!loading && !error && mode === "dashboard" && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {(["ok", "invalid", "review"] as const).map((s) => (
              <div key={s} className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-500">
                  ภาษีซื้อที่{s === "ok" ? "ขอคืนได้" : s === "invalid" ? "ต้องห้าม" : "รอตรวจสอบ"}
                </p>
                <p className="mt-2 text-3xl font-bold">฿{fmt(sumVat(s))}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {filtered.filter((r) => r.status === s).length} ใบ
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <p className="font-bold">ภาษีซื้อรายเดือน</p>
            {monthList.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">ยังไม่มีข้อมูล ไปยืนยันใบเสร็จที่แท็บ “ตรวจทาน” ก่อน</p>
            )}
            <div className="mt-4 space-y-3">
              {monthList.map(([m, v]) => (
                <div key={m} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-gray-500">{m}</span>
                  <div className="flex h-6 flex-1 overflow-hidden rounded bg-gray-100">
                    {(["ok", "review", "invalid"] as const).map((s) => (
                      <div
                        key={s}
                        className={BAR[s]}
                        style={{ width: `${(v[s] / maxMonth) * 100}%` }}
                        title={`${LABEL[s]} ฿${fmt(v[s])}`}
                      />
                    ))}
                  </div>
                  <span className="w-28 shrink-0 text-right">฿{fmt(v.ok + v.review + v.invalid)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-gray-500">
              <span><i className="mr-1 inline-block h-2 w-2 bg-[#0f6b57]" />ขอคืนได้</span>
              <span><i className="mr-1 inline-block h-2 w-2 bg-yellow-400" />รอตรวจสอบ</span>
              <span><i className="mr-1 inline-block h-2 w-2 bg-red-500" />ต้องห้าม</span>
            </div>
          </div>
        </>
      )}

      {!loading && !error && mode === "library" && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {["วันที่", "เลขที่", "ผู้ขาย", "เลขภาษี", "ก่อน VAT", "VAT", "รวม", "หมวด", "สถานะ"].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100" title={r.reasons ?? ""}>
                  <td className="px-3 py-2">{r.doc_date ?? "-"}</td>
                  <td className="px-3 py-2">{r.invoice_no ?? "-"}</td>
                  <td className="px-3 py-2">{r.seller_name ?? "-"}</td>
                  <td className="px-3 py-2">{r.seller_tax_id ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.subtotal)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.vat)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total)}</td>
                  <td className="px-3 py-2">{r.category ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${BADGE[r.status]}`}>
                      {LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}