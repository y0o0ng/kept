// 데이터 로직(순수 함수, chrome API 없음) + 맨 아래에 chrome.storage.local 얇은 래퍼.
// 모든 함수는 state를 수정하지 않고 새 state를 돌려줌.

const KEY = 'vault';

export const emptyState = () => ({ version: 1, lastExportedAt: null, folders: [], prompts: [] });

const id = () => crypto.randomUUID();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// ---------- 프롬프트 ----------
export function addPrompt(s, { title = '', text = '', folderId = null }, now = Date.now()) {
  const p = { id: id(), title, text, folderId, createdAt: now, updatedAt: now, deletedAt: null, extra: {} };
  return { ...s, prompts: [p, ...s.prompts] };
}

const patch = (s, pid, fn) => ({ ...s, prompts: s.prompts.map((p) => (p.id === pid ? fn(p) : p)) });

export const updatePrompt = (s, pid, fields, now = Date.now()) =>
  patch(s, pid, (p) => ({ ...p, ...pick(fields, ['title', 'text', 'folderId']), updatedAt: now }));
export const trashPrompt = (s, pid, now = Date.now()) => patch(s, pid, (p) => ({ ...p, deletedAt: now }));
export const restorePrompt = (s, pid) => patch(s, pid, (p) => ({ ...p, deletedAt: null }));
// 일괄 삭제: 여러 개를 한 번에 휴지통으로 (이미 휴지통인 건 시각 유지)
export const trashMany = (s, ids, now = Date.now()) => {
  const set = new Set(ids);
  return { ...s, prompts: s.prompts.map((p) => (set.has(p.id) && p.deletedAt === null ? { ...p, deletedAt: now } : p)) };
};
// 선택 복구 / 선택 영구 삭제: 둘 다 휴지통에 있는 것만 대상
export const restoreMany = (s, ids) => {
  const set = new Set(ids);
  return { ...s, prompts: s.prompts.map((p) => (set.has(p.id) ? { ...p, deletedAt: null } : p)) };
};
export const purgeMany = (s, ids) => {
  const set = new Set(ids);
  return { ...s, prompts: s.prompts.filter((p) => !(set.has(p.id) && p.deletedAt !== null)) };
};
// 휴지통 비우기: 휴지통에 있는 것만 영구 삭제
export const emptyTrash = (s) => ({ ...s, prompts: s.prompts.filter((p) => p.deletedAt === null) });
// 영구 삭제는 휴지통에 있는 것만
export const purgePrompt = (s, pid) => ({
  ...s,
  prompts: s.prompts.filter((p) => !(p.id === pid && p.deletedAt !== null)),
});

function pick(o, keys) {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
}

// ---------- 폴더 ----------
export const addFolder = (s, name) => ({ ...s, folders: [...s.folders, { id: id(), name }] });
export const renameFolder = (s, fid, name) => ({
  ...s,
  folders: s.folders.map((f) => (f.id === fid ? { ...f, name } : f)),
});
// 폴더 삭제 시 안의 프롬프트는 미분류(null)로
export const deleteFolder = (s, fid) => ({
  ...s,
  folders: s.folders.filter((f) => f.id !== fid),
  prompts: s.prompts.map((p) => (p.folderId === fid ? { ...p, folderId: null } : p)),
});

// ---------- 조회 ----------
export const activePrompts = (s) => s.prompts.filter((p) => p.deletedAt === null);
export const trashedPrompts = (s) => s.prompts.filter((p) => p.deletedAt !== null);

export function search(s, q) {
  const n = q.trim().toLowerCase();
  return activePrompts(s).filter((p) => !n || (p.title + '\n' + p.text).toLowerCase().includes(n));
}

// 백업 배너용: 마지막 내보내기 이후 만들어진 (휴지통 아닌) 프롬프트 수
export const unbackedCount = (s) =>
  activePrompts(s).filter((p) => s.lastExportedAt === null || p.createdAt > s.lastExportedAt).length;

// 상단 백업 상태 한 줄: level은 점 색(idle 회색 / ok 초록 / warn 주황). 배너와 같은 기준(unbackedCount)
export function backupStatus(s, now = Date.now()) {
  const total = activePrompts(s).length;
  if (total === 0) return { level: 'idle', text: 'Nothing to back up yet' };
  if (s.lastExportedAt === null) return { level: 'warn', text: 'No backup yet' };
  const days = Math.max(0, Math.floor((now - s.lastExportedAt) / 86400000)); // 시계가 뒤로 가도 음수 방지
  const label = days === 0 ? 'Last backup: today' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago`;
  const n = unbackedCount(s);
  return n === 0 ? { level: 'ok', text: label } : { level: 'warn', text: `${label} · ${n} new` };
}

// ---------- 내보내기 ----------
export const buildExport = (s, now = Date.now()) => ({
  schemaVersion: 1,
  exportedAt: new Date(now).toISOString(),
  folders: s.folders,
  prompts: s.prompts, // 휴지통 포함: 복원하면 휴지통 상태까지 같아야 함
});
export const markExported = (s, now = Date.now()) => ({ ...s, lastExportedAt: now });

// ---------- 가져오기 ----------
// importText(state, text) → { state, imported, skipped }. 형식이 틀리면 Error를 던지고 state는 그대로.
export function importText(s, text) {
  const items = parseAny(text);
  return merge(s, items);
}

function parseAny(text) {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) throw new Error('The file is empty.');
  if (t[0] === '{' || t[0] === '[') {
    let data;
    try {
      data = JSON.parse(t);
    } catch {
      throw new Error('This file is not valid JSON.');
    }
    if (Array.isArray(data)) return { folders: [], prompts: data.map(fromGenius) };
    if (isObj(data) && data.schemaVersion === 1) return fromBackup(data);
    throw new Error('Unrecognized JSON format.');
  }
  return { folders: [], prompts: parseCsv(t).slice(1).map(fromCsvRow) };
}

// AI Prompt Genius JSON 항목. title/text/folder(이름) 외에는 전부 extra로 보관.
function fromGenius(o, i) {
  if (!isObj(o) || typeof o.title !== 'string' || typeof o.text !== 'string')
    throw new Error(`Item ${i + 1}: "title" and "text" must be strings.`);
  const { title, text, folder, ...extra } = o;
  return { title, text, folderName: typeof folder === 'string' && folder ? folder : null, extra };
}

// CSV 열 순서: title, text, description, folder, tags(;구분)
function fromCsvRow(r, i) {
  if (r.length < 2) throw new Error(`CSV row ${i + 2}: expected at least title and text.`);
  const [title, text, description = '', folder = '', tags = ''] = r;
  const extra = {};
  if (description) extra.description = description;
  const tagList = tags.split(';').map((x) => x.trim()).filter(Boolean);
  if (tagList.length) extra.tags = tagList;
  return { title, text, folderName: folder || null, extra };
}

// 우리 백업 파일: id·시각·휴지통 상태·extra까지 그대로 복원
function fromBackup(d) {
  if (!Array.isArray(d.folders) || !Array.isArray(d.prompts)) throw new Error('Backup is missing folders or prompts.');
  d.folders.forEach((f, i) => {
    if (!isObj(f) || typeof f.id !== 'string' || typeof f.name !== 'string') throw new Error(`Folder ${i + 1} is invalid.`);
  });
  const prompts = d.prompts.map((p, i) => {
    const ok =
      isObj(p) && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.text === 'string' &&
      (p.folderId === null || typeof p.folderId === 'string') &&
      Number.isFinite(p.createdAt) && Number.isFinite(p.updatedAt) &&
      (p.deletedAt === null || Number.isFinite(p.deletedAt)) && isObj(p.extra);
    if (!ok) throw new Error(`Prompt ${i + 1} in backup is invalid.`);
    return { ...p };
  });
  return { folders: d.folders, prompts };
}

// 검증이 끝난 items만 들어옴 → 여기서는 실패하지 않으므로 "반쯤 들어간 상태" 없음
function merge(s, { folders: inFolders, prompts: inPrompts }) {
  const folders = [...s.folders];
  const byName = new Map(folders.map((f) => [f.name, f.id]));
  const folderIdFor = (name, preferredId) => {
    if (!byName.has(name)) {
      // 백업 복원 시 원래 폴더 id 유지 (이미 쓰는 id면 새로 발급)
      const f = { id: preferredId && !folders.some((x) => x.id === preferredId) ? preferredId : id(), name };
      folders.push(f);
      byName.set(name, f.id);
    }
    return byName.get(name);
  };
  // 백업 파일의 폴더 id → 우리 폴더 id (같은 이름이면 합침)
  const idMap = new Map(inFolders.map((f) => [f.id, folderIdFor(f.name, f.id)]));

  const seen = new Set(s.prompts.map((p) => key(p)));
  const usedIds = new Set(s.prompts.map((p) => p.id));
  const added = [];
  let skipped = 0;
  const now = Date.now();
  for (const p of inPrompts) {
    if (seen.has(key(p))) { skipped++; continue; }
    seen.add(key(p));
    const folderId = 'folderName' in p ? (p.folderName ? folderIdFor(p.folderName) : null) : idMap.get(p.folderId) ?? null;
    const pid = p.id && !usedIds.has(p.id) ? p.id : id();
    usedIds.add(pid);
    added.push({
      id: pid, title: p.title, text: p.text, folderId,
      createdAt: p.createdAt ?? now, updatedAt: p.updatedAt ?? now, deletedAt: p.deletedAt ?? null,
      extra: p.extra ?? {},
    });
  }
  return { state: { ...s, folders, prompts: [...added, ...s.prompts] }, imported: added.length, skipped };
}

const key = (p) => JSON.stringify([p.title, p.text]);

// RFC 4180 CSV: 따옴표 안 쉼표/줄바꿈/"" 처리. 빈 줄은 무시.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false, i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (q) throw new Error('CSV has an unclosed quote.');
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// ---------- chrome.storage.local 래퍼 (여기만 chrome API 사용) ----------
export async function load() {
  const r = await chrome.storage.local.get(KEY);
  return r[KEY] ?? emptyState();
}

export async function save(s) {
  try {
    await chrome.storage.local.set({ [KEY]: s });
  } catch (e) {
    if (/quota/i.test(String(e?.message))) throw new Error('Storage is full — export a backup before adding more prompts.');
    throw e;
  }
}
