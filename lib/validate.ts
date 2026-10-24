export type ReceiptData = {
  page?: number | null;
  doc_type: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  invoice_no: string | null;
  date: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  category: string | null;
};

export type Status = "ok" | "review" | "invalid";

export type ValidationResult = {
  status: Status;
  reasons: string[];
};

// เช็กเลขผู้เสียภาษี 13 หลักด้วย checksum
export function isValidTaxId(id: string | null): boolean {
  if (!id || !/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(id[i]) * (13 - i);
  }
  const check = (11 - (sum % 11)) % 10;
  return check === Number(id[12]);
}

export function validateReceipt(r: ReceiptData): ValidationResult {
  const reasons: string[] = [];
  let status: Status = "ok";

  const bump = (s: Status) => {
    if (s === "invalid" || (s === "review" && status === "ok")) status = s;
  };

  // 1) เลขผู้เสียภาษีผู้ขาย
  if (!r.seller_tax_id) {
    reasons.push("ไม่พบเลขประจำตัวผู้เสียภาษีของผู้ขาย");
    bump("invalid");
  } else if (!isValidTaxId(r.seller_tax_id)) {
    reasons.push("เลขผู้เสียภาษีผู้ขายไม่ผ่าน checksum (อาจอ่านผิดหรือเป็นเลขปลอม)");
    bump("invalid");
  }

  // 2) ยอดเงิน
  if (r.subtotal == null || r.vat == null || r.total == null) {
    reasons.push("ยอดเงินอ่านได้ไม่ครบ ต้องตรวจเอง");
    bump("review");
  } else {
    if (Math.abs(r.subtotal + r.vat - r.total) > 0.05) {
      reasons.push("ยอดก่อน VAT + VAT ไม่เท่ากับยอดรวม");
      bump("invalid");
    }
    if (Math.abs(r.subtotal * 0.07 - r.vat) > 0.05) {
      reasons.push("VAT ไม่ใช่ 7% ของยอดก่อน VAT");
      bump("review");
    }
  }

  // 3) วันที่
  if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
    reasons.push("ไม่พบวันที่ หรือรูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
    bump("review");
  } else {
    const year = Number(r.date.slice(0, 4));
    if (year > 2400) {
      reasons.push("ปีในวันที่เป็น พ.ศ. ต้องแปลงเป็น ค.ศ.");
      bump("review");
    } else if (new Date(r.date).getTime() > Date.now() + 86400000) {
      reasons.push("วันที่เป็นอนาคต ตรวจปีอีกครั้ง");
      bump("review");
    }
  }

  // 4) ภาษีซื้อต้องห้าม / เงื่อนไขเพิ่มเติม
  if (r.doc_type?.includes("อย่างย่อ")) {
    reasons.push("ใบกำกับภาษีอย่างย่อ ปกติขอคืน VAT ไม่ได้");
    bump("review");
  }
  if (!r.buyer_name) {
    reasons.push("ไม่มีชื่อผู้ซื้อ ใช้เป็นภาษีซื้อไม่ได้ถ้าไม่ระบุชื่อบริษัท");
    bump("review");
  }

  if (reasons.length === 0) reasons.push("ผ่านการตรวจเบื้องต้นทุกข้อ");
  return { status, reasons };
}