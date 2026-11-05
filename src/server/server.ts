import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import * as subjectsService from './services/subjectsService.js';
import * as sourcesService from './services/sourcesService.js';
import * as problemsService from './services/problemsService.js';
import * as attemptsService from './services/attemptsService.js';
import * as observationsService from './services/observationsService.js';
import * as tagsService from './services/tagsService.js';
import * as collectionsService from './services/collectionsService.js';
import * as analyticsService from './services/analyticsService.js';
import * as searchService from './services/searchService.js';
import * as breadcrumbsService from './services/breadcrumbsService.js';
import * as practiceLogsService from './services/practiceLogsService.js';
import * as tagCategoriesService from './services/tagCategoriesService.js';
import * as notesService from './services/notesService.js';
import * as pdfService from './services/pdfService.js';
import * as objectEngine from './services/objectEngine.js';
import * as relationEngine from './services/relationEngine.js';
import * as documentEngine from './services/documentEngine.js';
import * as viewEngine from './services/viewEngine.js';
import * as inboxEngine from './services/inboxEngine.js';
import * as eventEngine from './services/eventEngine.js';
import { workspaceRouter } from './routes/workspace.js';

export const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', isolated: process.env.NODE_ENV === 'test' });
});

app.use('/api', workspaceRouter);

// Breadcrumbs
app.get('/api/breadcrumbs', (req, res) => {
  try {
    const type = req.query.type as 'subject' | 'source' | 'problem';
    const id = req.query.id as string;
    if (!type || !id) {
      return res.status(400).json({ error: 'type and id query params are required' });
    }
    const breadcrumbs = breadcrumbsService.resolveBreadcrumbs(type, id);
    res.json(breadcrumbs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SUBJECTS ---
app.get('/api/subjects', (req, res) => {
  try {
    const subjects = subjectsService.getAllSubjects();
    res.json(subjects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subjects/:id', (req, res) => {
  try {
    const subject = subjectsService.getSubjectById(req.params.id);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    res.json(subject);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subjects/:id/sheets', (req, res) => {
  try {
    const subject = subjectsService.getSubjectById(req.params.id);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    const sheets = sourcesService.getAllSources(req.params.id);
    res.json(sheets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/subjects', (req, res) => {
  try {
    const { name, description, color, icon, metadata } = req.body || {};
    if (name === undefined || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Subject name must be a non-empty string' });
    }
    const subject = subjectsService.createSubject({ name, description, color, icon, metadata });
    res.status(201).json(subject);
  } catch (err: any) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))) {
      return res.status(409).json({ error: 'Subject with this name already exists' });
    }
    if (err.message && err.message.includes('Subject name must be a non-empty string')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/subjects/:id', (req, res) => {
  try {
    const { name } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Subject name must be a non-empty string' });
      }
    }
    const ok = subjectsService.updateSubject(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'Subject not found' });
    res.json({ success: true });
  } catch (err: any) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))) {
      return res.status(409).json({ error: 'Subject with this name already exists' });
    }
    if (err.message && err.message.includes('Subject name must be a non-empty string')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subjects/:id', (req, res) => {
  try {
    const { fallbackSubjectId } = req.body || {};
    const ok = subjectsService.deleteSubject(req.params.id, fallbackSubjectId);
    if (!ok) return res.status(404).json({ error: 'Subject not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SOURCES ---
app.get('/api/sources', (req, res) => {
  try {
    const subjectId = req.query.subjectId as string | undefined;
    const sources = sourcesService.getAllSources(subjectId);
    res.json(sources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sources/:id', (req, res) => {
  try {
    const source = sourcesService.getSourceById(req.params.id);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    res.json(source);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sources', (req, res) => {
  try {
    const { name, type, reference, metadata, subject_id } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (subject_id) {
      const sub = subjectsService.getSubjectById(subject_id);
      if (!sub) {
        return res.status(400).json({ error: 'Invalid subject_id: subject does not exist' });
      }
    }
    const source = sourcesService.createSource({ name, type, reference, metadata, subject_id });
    res.status(201).json(source);
  } catch (err: any) {
    if (err.message && (err.message.includes('FOREIGN KEY constraint failed') || err.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY'))) {
      return res.status(400).json({ error: 'Invalid subject_id: subject does not exist' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sources/:id', (req, res) => {
  try {
    const { subject_id } = req.body || {};
    if (subject_id) {
      const sub = subjectsService.getSubjectById(subject_id);
      if (!sub) {
        return res.status(400).json({ error: 'Invalid subject_id: subject does not exist' });
      }
    }
    const ok = sourcesService.updateSource(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'Source not found' });
    const updated = sourcesService.getSourceById(req.params.id);
    res.json({ success: true, ...updated });
  } catch (err: any) {
    if (err.message && (err.message.includes('FOREIGN KEY constraint failed') || err.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY'))) {
      return res.status(400).json({ error: 'Invalid subject_id: subject does not exist' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sources/:id', (req, res) => {
  try {
    const ok = sourcesService.deleteSource(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Source not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sources/:id/batch-problems', (req, res) => {
  try {
    const { start = 1, end = 20, prefix = '' } = req.body || {};
    const result = problemsService.batchCreateProblems(req.params.id, Number(start), Number(end), prefix);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/problems/batch', (req, res) => {
  try {
    const { source_id, count, start_number = 1, start = 1, prefix = '' } = req.body || {};
    if (!source_id || !count) {
      return res.status(400).json({ error: 'Source ID and count are required' });
    }
    const startNum = Number(start_number || start || 1);
    const endNum = startNum + Number(count) - 1;
    const result = problemsService.batchCreateProblems(source_id, startNum, endNum, prefix);
    res.status(201).json({ created: result.created, problems: result.problems });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PROBLEMS ---
app.get('/api/problems/:id', (req, res) => {
  try {
    const problem = problemsService.getProblemById(req.params.id);
    if (!problem) return res.status(404).json({ error: 'Problem not found' });
    res.json(problem);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/problems', (req, res) => {
  try {
    const { source_id, number, title, reference, tags } = req.body;
    if (!source_id || !number) {
      return res.status(400).json({ error: 'source_id and number are required' });
    }
    const problem = problemsService.createProblem({ source_id, number, title, reference, tags });
    res.status(201).json(problem);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/problems/:id', (req, res) => {
  try {
    const ok = problemsService.updateProblem(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'Problem not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/problems/:id', (req, res) => {
  try {
    const ok = problemsService.deleteProblem(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Problem not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ATTEMPTS ---
app.get('/api/attempts/recent', (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const attempts = attemptsService.getRecentAttempts(limit);
    res.json(attempts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attempts', (req, res) => {
  try {
    const {
      problem_id,
      result,
      recognition,
      help,
      confidence,
      time_seconds,
      notes,
      tags,
      problem_tags,
      heuristic_tags,
      meta_tags,
      for_review,
      log_id,
      observation
    } = req.body;
    if (!problem_id || !result) {
      return res.status(400).json({ error: 'problem_id and result are required' });
    }
    const attempt = attemptsService.createAttempt({
      problem_id,
      result,
      recognition,
      help,
      confidence,
      time_seconds,
      notes,
      tags,
      problem_tags,
      heuristic_tags,
      meta_tags,
      for_review,
      log_id,
      observation,
    });
    res.status(201).json(attempt);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/attempts/:id', (req, res) => {
  try {
    const ok = attemptsService.deleteAttempt(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Attempt not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PRACTICE LOGS ---
app.get('/api/logs', (req, res) => {
  try {
    const { sourceId, status, limit } = req.query;
    const logs = practiceLogsService.getAllLogs({
      source_id: sourceId as string,
      status: status as string,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs/active', (req, res) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    const log = practiceLogsService.getActiveLog(sourceId);
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs/:id', (req, res) => {
  try {
    const log = practiceLogsService.getLogById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Practice log not found' });
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs', (req, res) => {
  try {
    const { source_id, current_problem_id, time_seconds, notes_draft } = req.body || {};
    if (!source_id) {
      return res.status(400).json({ error: 'source_id is required' });
    }
    const log = practiceLogsService.createLog({ source_id, current_problem_id, time_seconds, notes_draft });
    res.status(201).json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/logs/:id', (req, res) => {
  try {
    const ok = practiceLogsService.updateLog(req.params.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Practice log not found' });
    const updated = practiceLogsService.getLogById(req.params.id);
    res.json({ success: true, log: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs/:id/complete', (req, res) => {
  try {
    const { time_seconds } = req.body || {};
    const ok = practiceLogsService.completeLog(req.params.id, { time_seconds });
    if (!ok) return res.status(404).json({ error: 'Practice log not found' });
    const completed = practiceLogsService.getLogById(req.params.id);
    res.json({ success: true, log: completed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/logs/:id', (req, res) => {
  try {
    const ok = practiceLogsService.deleteLog(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Practice log not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- OBSERVATIONS ---
app.get('/api/observations', (req, res) => {
  try {
    const { type, problem_id, limit } = req.query;
    const observations = observationsService.getObservations({
      type: type as string,
      problem_id: problem_id as string,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(observations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/observations', (req, res) => {
  try {
    const { problem_id, attempt_id, type, content } = req.body;
    if (!problem_id || !type || !content) {
      return res.status(400).json({ error: 'problem_id, type, and content are required' });
    }
    const obs = observationsService.createObservation({ problem_id, attempt_id, type, content });
    res.status(201).json(obs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/observations/:id', (req, res) => {
  try {
    const ok = observationsService.deleteObservation(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Observation not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TAGS ---
app.get('/api/tags', (req, res) => {
  try {
    const tags = tagsService.getAllTags();
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- COLLECTIONS ---
app.get('/api/collections', (req, res) => {
  try {
    const collections = collectionsService.getAllCollections();
    res.json(collections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections/:id', (req, res) => {
  try {
    const collection = collectionsService.getCollectionById(req.params.id);
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json(collection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collections', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const collection = collectionsService.createCollection(name, description);
    res.status(201).json(collection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collections/:id/problems', (req, res) => {
  try {
    const { problemId } = req.body;
    if (!problemId) return res.status(400).json({ error: 'problemId is required' });
    const ok = collectionsService.addProblemToCollection(req.params.id, problemId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/collections/:id/problems/:problemId', (req, res) => {
  try {
    const ok = collectionsService.removeProblemFromCollection(req.params.id, req.params.problemId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ANALYTICS ---
app.get('/api/analytics', (req, res) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    const subjectId = req.query.subjectId as string | undefined;
    const analytics = analyticsService.getAnalytics(sourceId, subjectId);
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function firstBlockPreview(content: string): string {
  try {
    const blocks = JSON.parse(content);
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block.content && Array.isArray(block.content)) {
          let text = '';
          for (const child of block.content) {
            if (child.text) text += child.text;
          }
          if (text.trim().length > 0) return text.trim().substring(0, 100);
        } else if (block.text) {
          if (block.text.trim().length > 0) return block.text.trim().substring(0, 100);
        } else if (block.content && typeof block.content === 'string') {
          if (block.content.trim().length > 0) return block.content.trim().substring(0, 100);
        }
      }
    }
  } catch {
    // ignore
  }
  return '';
}

// --- SEARCH ---
app.get('/api/search', (req, res) => {
  try {
    const q = req.query.q as string || '';
    const results = searchService.searchGlobal(q);
    
    const notes = notesService.searchNotes(q);
    const noteResults = notes.map(n => ({
      type: 'note',
      id: n.id,
      title: n.title,
      subtitle: n.subject_name || 'Standalone note',
      context: firstBlockPreview(n.content),
      url: '#note/' + n.id,
      badge: n.type
    }));

    const pdfs = q.trim() ? pdfService.getAllPdfs().filter(p => 
      p.title.toLowerCase().includes(q.toLowerCase()) || 
      p.filename.toLowerCase().includes(q.toLowerCase())
    ) : [];
    const pdfResults = pdfs.map(p => ({
      type: 'pdf',
      id: p.id,
      title: p.title,
      subtitle: p.subject_name || 'Notebook PDF',
      context: `${p.page_count} pages • ${(p.file_size / 1024 / 1024).toFixed(1)} MB`,
      url: '#pdf/' + p.id,
      badge: 'pdf'
    }));
    
    res.json([...results, ...noteResults, ...pdfResults]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TAG CATEGORIES ---
app.get('/api/tag-categories', (req, res) => {
  try {
    const categories = tagCategoriesService.getAllTagCategories();
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tag-categories/:id', (req, res) => {
  try {
    const category = tagCategoriesService.getTagCategoryById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Tag category not found' });
    res.json(category);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tag-categories', (req, res) => {
  try {
    const category = tagCategoriesService.createTagCategory(req.body);
    res.status(201).json(category);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tag-categories/:id', (req, res) => {
  try {
    const ok = tagCategoriesService.updateTagCategory(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'Tag category not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tag-categories/:id', (req, res) => {
  try {
    const ok = tagCategoriesService.deleteTagCategory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Tag category not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- NOTES ---
app.get('/api/notes/recent', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const notes = notesService.getRecentNotes(limit);
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notes', (req, res) => {
  try {
    const params = {
      subject_id: req.query.subject_id as string | undefined,
      type: req.query.type as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    };
    const notes = notesService.getAllNotes(params);
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notes/:id', (req, res) => {
  try {
    const note = notesService.getNoteById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes', (req, res) => {
  try {
    const note = notesService.createNote(req.body);
    res.status(201).json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notes/:id', (req, res) => {
  try {
    const note = notesService.updateNote(req.params.id, req.body);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', (req, res) => {
  try {
    const ok = notesService.deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PDFS & ANNOTATIONS ---
app.get('/api/pdfs', (req, res) => {
  try {
    const subjectId = req.query.subject_id as string | undefined;
    const pdfs = pdfService.getAllPdfs(subjectId);
    res.json(pdfs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pdfs/:id', (req, res) => {
  try {
    const pdf = pdfService.getPdfById(req.params.id);
    if (!pdf) return res.status(404).json({ error: 'PDF not found' });
    res.json(pdf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pdfs/:id/file', (req, res) => {
  try {
    const filePath = pdfService.getPdfFilePath(req.params.id);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pdfs', (req, res) => {
  try {
    const { subject_id, title, filename, file_data_base64, fileData, page_count } = req.body;
    const payloadData = file_data_base64 || fileData;
    if (!payloadData || !filename) {
      return res.status(400).json({ error: 'filename and file_data_base64/fileData are required' });
    }
    const pdf = pdfService.createPdf({
      subject_id,
      title: title || filename.replace(/\.pdf$/i, ''),
      filename,
      fileData: payloadData,
      page_count: page_count ? Number(page_count) : 1
    });
    res.status(201).json(pdf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pdfs/:id', (req, res) => {
  try {
    const ok = pdfService.deletePdf(req.params.id);
    if (!ok) return res.status(404).json({ error: 'PDF not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pdfs/:id', (req, res) => {
  try {
    const ok = pdfService.updatePdf(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'PDF not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pdfs/:id/highlights', (req, res) => {
  try {
    const { page_number, color, text, note, rects } = req.body;
    if (page_number === undefined || !text) {
      return res.status(400).json({ error: 'page_number and text are required' });
    }
    const highlight = pdfService.createHighlight(req.params.id, {
      page_number: Number(page_number),
      color: color || '#fef08a',
      text,
      note,
      rects
    });
    res.status(201).json(highlight);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pdfs/highlights/:highlightId', (req, res) => {
  try {
    const ok = pdfService.deleteHighlight(req.params.highlightId);
    if (!ok) return res.status(404).json({ error: 'Highlight not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pdfs/highlights/:highlightId', (req, res) => {
  try {
    const ok = pdfService.updateHighlight(req.params.highlightId, req.body);
    if (!ok) return res.status(404).json({ error: 'Highlight not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: OBJECT TYPES ---
app.get('/api/object-types', (req, res) => {
  try {
    const types = objectEngine.getAllObjectTypes();
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/object-types/:id', (req, res) => {
  try {
    let type = objectEngine.getObjectTypeById(req.params.id);
    if (!type) type = objectEngine.getObjectTypeBySlug(req.params.id);
    if (!type) return res.status(404).json({ error: 'Object type not found' });
    res.json(type);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/object-types', (req, res) => {
  try {
    const created = objectEngine.createObjectType(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/object-types/:id/fields', (req, res) => {
  try {
    const fields = objectEngine.getFieldDefinitions(req.params.id);
    res.json(fields);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/object-types/:id/fields', (req, res) => {
  try {
    const field = objectEngine.createFieldDefinition(req.params.id, req.body);
    res.status(201).json(field);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: OBJECTS ---
app.get('/api/objects', (req, res) => {
  try {
    const result = objectEngine.queryObjects({
      typeSlug: req.query.type as string | undefined,
      search: req.query.search as string | undefined,
      filterProperty: req.query.filter_property as string | undefined,
      filterValue: req.query.filter_value as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sortBy: req.query.sort_by as any,
      sortDir: req.query.sort_dir as any,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/objects/:id', (req, res) => {
  try {
    const obj = objectEngine.getObjectById(req.params.id);
    if (!obj) return res.status(404).json({ error: 'Object not found' });
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/objects', (req, res) => {
  try {
    const typeSlugOrId = req.body.type || req.body.type_id || req.body.type_slug;
    if (!typeSlugOrId) {
      return res.status(400).json({ error: 'type or type_id is required' });
    }
    const created = objectEngine.createObject(typeSlugOrId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/objects/:id', (req, res) => {
  try {
    const updated = objectEngine.updateObject(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/objects/:id', (req, res) => {
  try {
    const ok = objectEngine.deleteObject(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Object not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: RELATIONS & GRAPH ---
app.get('/api/relations/graph', (req, res) => {
  try {
    const centerId = req.query.center_id as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const graph = relationEngine.getGraph(centerId, limit);
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/relations', (req, res) => {
  try {
    const objectId = req.query.object_id as string | undefined;
    if (!objectId) {
      return res.status(400).json({ error: 'object_id query param is required' });
    }
    const direction = (req.query.direction as any) || 'both';
    const relations = relationEngine.getRelationsForObject(objectId, direction);
    res.json(relations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relations', (req, res) => {
  try {
    const { source_id, target_id, relation_type, metadata } = req.body;
    if (!source_id || !target_id || !relation_type) {
      return res.status(400).json({ error: 'source_id, target_id, and relation_type are required' });
    }
    const rel = relationEngine.createRelation(source_id, target_id, relation_type, metadata);
    res.status(201).json(rel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relations/:id', (req, res) => {
  try {
    const ok = relationEngine.deleteRelation(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Relation not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relations', (req, res) => {
  try {
    const { source_id, target_id, relation_type } = req.body || {};
    if (!source_id || !target_id) {
      return res.status(400).json({ error: 'source_id and target_id are required' });
    }
    const ok = relationEngine.deleteRelationBetween(source_id, target_id, relation_type);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: DOCUMENTS ---
app.get('/api/documents/by-object/:objectId', (req, res) => {
  try {
    const doc = documentEngine.getDocumentByObjectId(req.params.objectId);
    if (!doc) return res.status(404).json({ error: 'Document not found for object' });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents/:id/export/latex', (req, res) => {
  try {
    const latex = documentEngine.exportDocumentToLatex(req.params.id);
    res.json({ latex });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents/:id', (req, res) => {
  try {
    const doc = documentEngine.getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', (req, res) => {
  try {
    const doc = documentEngine.createDocument(req.body);
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/documents/:id', (req, res) => {
  try {
    const doc = documentEngine.updateDocument(req.params.id, req.body);
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: VIEWS ---
app.get('/api/views/:id/execute', (req, res) => {
  try {
    const result = viewEngine.executeView(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/views/:id', (req, res) => {
  try {
    const view = viewEngine.getViewById(req.params.id);
    if (!view) return res.status(404).json({ error: 'View not found' });
    res.json(view);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/views', (req, res) => {
  try {
    const objectTypeId = req.query.object_type_id as string | undefined;
    const views = viewEngine.getAllViews(objectTypeId);
    res.json(views);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/views', (req, res) => {
  try {
    const view = viewEngine.createView(req.body);
    res.status(201).json(view);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/views/:id', (req, res) => {
  try {
    const view = viewEngine.updateView(req.params.id, req.body);
    res.json(view);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/views/:id', (req, res) => {
  try {
    const ok = viewEngine.deleteView(req.params.id);
    if (!ok) return res.status(404).json({ error: 'View not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: INBOX ---
app.get('/api/inbox', (req, res) => {
  try {
    const onlyUnprocessed = req.query.unprocessed !== 'false';
    const items = inboxEngine.getInboxItems(onlyUnprocessed);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inbox', (req, res) => {
  try {
    const item = inboxEngine.createInboxItem(req.body);
    res.status(201).json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inbox/:id/convert', (req, res) => {
  try {
    const { target_type, title, properties } = req.body;
    if (!target_type || !title) {
      return res.status(400).json({ error: 'target_type and title are required' });
    }
    const result = inboxEngine.convertInboxItem(req.params.id, target_type, title, properties);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inbox/:id', (req, res) => {
  try {
    const ok = inboxEngine.deleteInboxItem(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Inbox item not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERIC WORKSPACE ENGINE: EVENTS ---
app.get('/api/events/recent', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const events = eventEngine.getRecentEvents(limit);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/object/:objectId', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const events = eventEngine.getEventsForObject(req.params.objectId, limit);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend in production
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(clientDist, 'index.html'));
  });
}

const isDirectRun = Boolean(process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')));
if (isDirectRun && process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), process.env.HOST || '127.0.0.1', () => {
    console.log(`Monograph API server listening on http://localhost:${PORT}`);
  });
}
