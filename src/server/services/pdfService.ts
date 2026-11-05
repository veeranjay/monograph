import { db } from "../db.js";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

export interface PdfDocument {
  id: string;
  subject_id: string | null;
  subject_name?: string | null;
  title: string;
  filename: string;
  file_path: string;
  file_size: number;
  page_count: number;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
  highlight_count?: number;
}

export interface PdfHighlight {
  id: string;
  pdf_id: string;
  page_number: number;
  color: string;
  text: string;
  note?: string | null;
  rects?: string | null;
  created_at: string;
}

const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads", "pdfs"),
);

export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function getAllPdfs(subjectId?: string): PdfDocument[] {
  let query = `
    SELECT p.*, s.name as subject_name,
      (SELECT COUNT(*) FROM pdf_highlights h WHERE h.pdf_id = p.id) as highlight_count
    FROM pdfs p
    LEFT JOIN subjects s ON s.id = p.subject_id
  `;
  const params: any[] = [];
  if (subjectId) {
    query += ` WHERE p.subject_id = ? `;
    params.push(subjectId);
  }
  query += ` ORDER BY p.created_at DESC`;

  return db.prepare(query).all(...params) as unknown as PdfDocument[];
}

export function getPdfById(
  id: string,
): (PdfDocument & { highlights: PdfHighlight[] }) | null {
  const query = `
    SELECT p.*, s.name as subject_name,
      (SELECT COUNT(*) FROM pdf_highlights h WHERE h.pdf_id = p.id) as highlight_count
    FROM pdfs p
    LEFT JOIN subjects s ON s.id = p.subject_id
    WHERE p.id = ?
  `;
  const doc = db.prepare(query).get(id) as unknown as PdfDocument | undefined;
  if (!doc) return null;

  const highlights = db
    .prepare(
      `
    SELECT * FROM pdf_highlights
    WHERE pdf_id = ?
    ORDER BY page_number ASC, created_at ASC
  `,
    )
    .all(id) as unknown as PdfHighlight[];

  return { ...doc, highlights };
}

export function getPdfFilePath(id: string): string | null {
  const row = db.prepare("SELECT file_path FROM pdfs WHERE id = ?").get(id) as
    { file_path: string } | undefined;
  if (!row) return null;
  // Resolve inside this workspace, even when an imported database has absolute paths
  // from another computer. Test copies must never read or delete another workspace's PDFs.
  const relocatedPath = path.join(
    UPLOADS_DIR,
    path.basename(row.file_path.replaceAll("\\", "/")),
  );
  if (fs.existsSync(relocatedPath)) return relocatedPath;
  return null;
}

export function createPdf(data: {
  title: string;
  subject_id?: string | null;
  filename: string;
  fileData: string; // base64 encoded
  page_count?: number;
}): PdfDocument {
  ensureUploadsDir();

  const id = crypto.randomUUID();
  const safeFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${id}_${safeFilename}`;
  const diskPath = path.join(UPLOADS_DIR, storedFilename);

  // Clean base64 header if present (e.g. data:application/pdf;base64,...)
  let base64Clean = data.fileData;
  if (base64Clean.includes(";base64,")) {
    base64Clean = base64Clean.split(";base64,")[1];
  }

  const fileBuffer = Buffer.from(base64Clean, "base64");
  if (fileBuffer.length > 25 * 1024 * 1024)
    throw new Error("Please choose a PDF smaller than 25 MB");
  if (!fileBuffer.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("This file does not appear to be a PDF");
  if (
    data.subject_id &&
    !db.prepare("SELECT id FROM subjects WHERE id = ?").get(data.subject_id)
  )
    throw new Error("Notebook not found");
  fs.writeFileSync(diskPath, fileBuffer);

  const now = new Date().toISOString();
  const fileSize = fileBuffer.length;
  const pageCount = data.page_count || 1;

  db.prepare(
    `
    INSERT INTO pdfs (id, subject_id, title, filename, file_path, file_size, page_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    data.subject_id || null,
    data.title.trim() || data.filename,
    data.filename,
    diskPath,
    fileSize,
    pageCount,
    now,
    now,
  );

  return getPdfById(id)!;
}

export function deletePdf(id: string): boolean {
  const file = getPdfFilePath(id);
  if (file) {
    try {
      fs.unlinkSync(file);
    } catch (e) {
      console.error("Failed to unlink PDF file:", e);
    }
  }

  const result = db.prepare("DELETE FROM pdfs WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updatePdf(
  id: string,
  data: { title?: string; page_count?: number; subject_id?: string | null },
): boolean {
  const existing = db.prepare("SELECT * FROM pdfs WHERE id = ?").get(id) as
    PdfDocument | undefined;
  if (!existing) return false;

  const title = data.title !== undefined ? data.title.trim() : existing.title;
  const pageCount =
    data.page_count !== undefined
      ? Number(data.page_count)
      : existing.page_count;
  const subjectId =
    data.subject_id !== undefined ? data.subject_id : existing.subject_id;
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `
    UPDATE pdfs
    SET title = ?, page_count = ?, subject_id = ?, updated_at = ?
    WHERE id = ?
  `,
    )
    .run(title, pageCount, subjectId, now, id);

  return result.changes > 0;
}

export function createHighlight(
  pdfId: string,
  data: {
    page_number: number;
    color?: string;
    text: string;
    note?: string;
    rects?: any;
  },
): PdfHighlight {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rectsStr =
    typeof data.rects === "string"
      ? data.rects
      : JSON.stringify(data.rects || []);

  db.prepare(
    `
    INSERT INTO pdf_highlights (id, pdf_id, page_number, color, text, note, rects, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    pdfId,
    data.page_number,
    data.color || "yellow",
    data.text.trim(),
    data.note ? data.note.trim() : null,
    rectsStr,
    now,
  );

  // Update PDF updated_at
  db.prepare("UPDATE pdfs SET updated_at = ? WHERE id = ?").run(now, pdfId);

  return db
    .prepare("SELECT * FROM pdf_highlights WHERE id = ?")
    .get(id) as unknown as PdfHighlight;
}

export function deleteHighlight(highlightId: string): boolean {
  const result = db
    .prepare("DELETE FROM pdf_highlights WHERE id = ?")
    .run(highlightId);
  return result.changes > 0;
}

export function updateHighlight(
  highlightId: string,
  data: { note?: string; color?: string },
): boolean {
  const existing = db
    .prepare("SELECT * FROM pdf_highlights WHERE id = ?")
    .get(highlightId) as PdfHighlight | undefined;
  if (!existing) return false;

  const note = data.note !== undefined ? data.note : existing.note;
  const color = data.color !== undefined ? data.color : existing.color;

  const result = db
    .prepare(
      `
    UPDATE pdf_highlights
    SET note = ?, color = ?
    WHERE id = ?
  `,
    )
    .run(note ?? null, color ?? null, highlightId);

  return result.changes > 0;
}
