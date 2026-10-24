import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("receipts")
    .select("*")
    .order("doc_date", { ascending: false, nullsFirst: false });
  if (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ rows: data });
}

export async function POST(req: Request) {
  const { rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "ไม่มีข้อมูล" }, { status: 400 });
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("receipts").insert(rows);
  if (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, count: rows.length });
}