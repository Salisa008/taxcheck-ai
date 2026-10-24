import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.8-flash";

function buildPrompt() {
  const year = new Date().getFullYear();
  return `คุณคือผู้ช่วยอ่านใบเสร็จ/ใบกำกับภาษีของประเทศไทย
ไฟล์นี้อาจมีใบเสร็จหลายใบ (หลายหน้า หรือหลายรูปใน PDF) ให้แยกทีละใบ
ตอบเป็น JSON array เท่านั้น แต่ละสมาชิกคือหนึ่งใบเสร็จ ห้ามมีข้อความอื่นหรือ markdown
ถ้ามีใบเดียวให้ตอบ array ที่มี 1 สมาชิก ถ้าไม่มีใบเสร็จเลยให้ตอบ []
ข้ามหน้าหรือรูปที่ไม่ใช่ใบเสร็จ (เช่น รูปสินค้า รูปกล่องพัสดุ)

กติกาสำคัญ:
- ถ้าอ่านไม่ออกหรือไม่มีข้อมูล ให้ใส่ null ห้ามเดา
- เลขผู้เสียภาษีมี 13 หลัก ให้ตอบเฉพาะตัวเลข ไม่มีขีดหรือช่องว่าง ถ้าอ่านได้ไม่ครบ 13 หลักให้ใส่ null
- วันที่ตอบเป็น YYYY-MM-DD แบบ ค.ศ. ถ้าปีในเอกสารมากกว่า 2400 เป็น พ.ศ. ให้ลบ 543
- ปีปัจจุบันคือ ค.ศ. ${year} ใช้ช่วยตัดสินเฉพาะตอนที่ตัวเลขปีไม่ชัด ห้ามแก้ปีที่อ่านได้ชัดเจน
- ตัวเลขเงินตอบเป็น number ไม่มีเครื่องหมายคั่น
- subtotal คือยอดก่อน VAT, vat คือภาษีมูลค่าเพิ่ม, total คือยอดรวมสุทธิ
- ใบที่ตัวหนังสือเล็ก เบลอ หรือเอียง ให้ใส่ confidence ต่ำ (ต่ำกว่า 0.7) ในช่องที่ไม่แน่ใจ
- "page" คือเลขหน้าของไฟล์ที่พบใบนั้น (รูปภาพให้ใส่ 1)

โครงสร้างของแต่ละใบ:
{
  "page": number,
  "doc_type": "ใบกำกับภาษีเต็มรูป | ใบกำกับภาษีอย่างย่อ | ใบเสร็จรับเงิน | อื่นๆ",
  "seller_name": string|null,
  "seller_tax_id": string|null,
  "branch": string|null,
  "buyer_name": string|null,
  "buyer_tax_id": string|null,
  "invoice_no": string|null,
  "date": string|null,
  "subtotal": number|null,
  "vat": number|null,
  "total": number|null,
  "category": string|null (หมวดบัญชี เช่น ค่าน้ำมัน ค่าอาหาร ค่าเครื่องเขียน ยาและเวชภัณฑ์),
  "confidence": { "seller_tax_id": 0-1, "date": 0-1, "subtotal": 0-1, "vat": 0-1, "total": 0-1 }
}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = buildPrompt();

    let text = "";
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model: MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: file.type || "image/jpeg",
                    data: buffer.toString("base64"),
                  },
                },
              ],
            },
          ],
          config: { responseMimeType: "application/json" },
        });
        text = (result.text ?? "").replace(/```json|```/g, "").trim();
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (!text) throw lastErr;

    const parsed = JSON.parse(text);
    return Response.json({ data: Array.isArray(parsed) ? parsed : [parsed] });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "อ่านใบเสร็จไม่สำเร็จ" }, { status: 500 });
  }
}