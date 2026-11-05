import { db } from '../db.js';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export function resolveBreadcrumbs(
  entityType: 'subject' | 'source' | 'problem',
  entityId: string
): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Subjects', href: '#subjects', active: false }
  ];

  if (entityType === 'subject') {
    const sub = db.prepare('SELECT id, name FROM subjects WHERE id = ?').get(entityId) as any;
    if (sub) {
      breadcrumbs.push({ label: sub.name, active: true });
    }
    return breadcrumbs;
  }

  if (entityType === 'source') {
    const src = db.prepare(`
      SELECT s.name as sheet_name, s.subject_id, sub.name as subject_name
      FROM sources s
      LEFT JOIN subjects sub ON sub.id = s.subject_id
      WHERE s.id = ?
    `).get(entityId) as any;

    if (src) {
      if (src.subject_id && src.subject_name) {
        breadcrumbs.push({ label: src.subject_name, href: `#subject/${src.subject_id}`, active: false });
      }
      breadcrumbs.push({ label: src.sheet_name, active: true });
    }
    return breadcrumbs;
  }

  if (entityType === 'problem') {
    const prob = db.prepare(`
      SELECT p.number, s.id as source_id, s.name as source_name, s.subject_id, sub.name as subject_name
      FROM problems p
      JOIN sources s ON s.id = p.source_id
      LEFT JOIN subjects sub ON sub.id = s.subject_id
      WHERE p.id = ?
    `).get(entityId) as any;

    if (prob) {
      if (prob.subject_id && prob.subject_name) {
        breadcrumbs.push({ label: prob.subject_name, href: `#subject/${prob.subject_id}`, active: false });
      }
      breadcrumbs.push({ label: prob.source_name, href: `#source/${prob.source_id}`, active: false });
      breadcrumbs.push({ label: `Q${prob.number}`, active: true });
    }
    return breadcrumbs;
  }

  return breadcrumbs;
}
