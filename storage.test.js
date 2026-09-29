import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from './storage.js';

const withPrompt = (extra = {}) => {
  let s = S.addFolder(S.emptyState(), 'Writing');
  s = S.addPrompt(s, { title: 'T', text: 'body', folderId: s.folders[0].id }, 100);
  s.prompts[0].extra = extra;
  return s;
};

test('trash → restore → purge only from trash', () => {
  let s = withPrompt();
  const pid = s.prompts[0].id;
  assert.equal(S.purgePrompt(s, pid).prompts.length, 1); // 휴지통 밖이면 영구삭제 불가
  s = S.trashPrompt(s, pid, 200);
  assert.equal(S.activePrompts(s).length, 0);
  assert.equal(S.restorePrompt(s, pid).prompts[0].deletedAt, null);
  assert.equal(S.purgePrompt(s, pid).prompts.length, 0);
});

test('trashMany trashes only given ids; emptyTrash purges only trashed', () => {
  let s = S.addPrompt(S.addPrompt(S.addPrompt(S.emptyState(), { title: 'a' }, 1), { title: 'b' }, 2), { title: 'c' }, 3);
  const [c, b, a] = s.prompts.map((p) => p.id); // 최신순
  s = S.trashMany(s, [a, b], 10);
  assert.deepEqual(S.activePrompts(s).map((p) => p.id), [c]);
  assert.equal(S.trashedPrompts(s).length, 2);
  s = S.emptyTrash(s);
  assert.deepEqual(s.prompts.map((p) => p.id), [c]); // 휴지통 밖 c는 남음
});

test('purgeMany/restoreMany only affect trashed prompts', () => {
  let s = S.addPrompt(S.addPrompt(S.addPrompt(S.emptyState(), { title: 'a' }, 1), { title: 'b' }, 2), { title: 'c' }, 3);
  const [c, b, a] = s.prompts.map((p) => p.id);
  s = S.trashMany(s, [a, b], 10);
  assert.equal(S.purgeMany(s, [c]).prompts.length, 3); // 휴지통 밖 c는 못 지움
  assert.deepEqual(S.purgeMany(s, [a, c]).prompts.map((p) => p.id), [c, b]);
  assert.equal(S.activePrompts(S.restoreMany(s, [a, b])).length, 3);
});

test('deleteFolder moves prompts to uncategorized', () => {
  const s = withPrompt();
  assert.equal(S.deleteFolder(s, s.folders[0].id).prompts[0].folderId, null);
});

test('search title+body, case-insensitive, skips trash', () => {
  let s = withPrompt();
  assert.equal(S.search(s, 'BOD').length, 1);
  s = S.trashPrompt(s, s.prompts[0].id);
  assert.equal(S.search(s, 'bod').length, 0);
});

test('unbackedCount', () => {
  let s = withPrompt();
  assert.equal(S.unbackedCount(s), 1);
  assert.equal(S.unbackedCount(S.markExported(s, 150)), 0);
  assert.equal(S.unbackedCount(S.markExported(s, 50)), 1);
});

test('backupStatus', () => {
  const day = 86400000;
  const base = S.addPrompt(S.emptyState(), { title: 'a' }, 5 * day); // 5일째 만든 프롬프트 1개
  const st = (lastExportedAt) => S.backupStatus({ ...base, lastExportedAt }, 10 * day);
  // 프롬프트 0개: "today"처럼 보이지 않고 회색
  assert.deepEqual(S.backupStatus(S.emptyState()), { level: 'idle', text: 'Nothing to back up yet' });
  assert.equal(S.backupStatus(S.markExported(S.emptyState(), 10 * day), 10 * day).level, 'idle');
  assert.deepEqual(st(null), { level: 'warn', text: 'No backup yet' });
  assert.deepEqual(st(10 * day - 1000), { level: 'ok', text: 'Last backup: today' });
  assert.deepEqual(st(9 * day), { level: 'ok', text: 'Last backup: 1 day ago' });
  assert.deepEqual(st(3 * day), { level: 'warn', text: 'Last backup: 7 days ago · 1 new' }); // 백업 후 새 프롬프트
  assert.equal(st(20 * day).text, 'Last backup: today'); // 미래 시각이어도 음수가 되지 않음
});

test('export → wipe → import restores everything incl. extra and trash', () => {
  let s = withPrompt({ tags: ['a'], description: 'd' });
  s = S.addPrompt(s, { title: '한글😀', text: 'x' }, 300);
  s = S.trashPrompt(s, s.prompts[0].id, 400);
  const file = JSON.stringify(S.buildExport(s));
  const { state, imported, skipped } = S.importText(S.emptyState(), file);
  assert.deepEqual([imported, skipped], [2, 0]);
  assert.deepEqual(state.prompts, s.prompts);
  assert.deepEqual(state.folders, s.folders);
});

test('importing same file twice skips duplicates', () => {
  const file = JSON.stringify(S.buildExport(withPrompt()));
  const once = S.importText(S.emptyState(), file).state;
  const twice = S.importText(once, file);
  assert.deepEqual([twice.imported, twice.skipped, twice.state.prompts.length], [0, 1, 1]);
});

test('Genius JSON: folder by name found or created, rest goes to extra', () => {
  const s = S.addFolder(S.emptyState(), 'Work');
  const json = JSON.stringify([
    { title: 'a', text: 'b', folder: 'Work', description: 'd', tags: ['x'], foo: 1 },
    { title: 'c', text: 'd', folder: 'New' },
    { title: 'e', text: 'f' },
  ]);
  const { state } = S.importText(s, json);
  assert.equal(state.folders.length, 2);
  const a = state.prompts.find((p) => p.title === 'a');
  assert.equal(a.folderId, s.folders[0].id);
  assert.deepEqual(a.extra, { description: 'd', tags: ['x'], foo: 1 });
  assert.equal(state.prompts.find((p) => p.title === 'e').folderId, null);
});

test('Genius CSV: quoted comma, newline in body, escaped quote, CRLF, BOM, blank field', () => {
  const csv = '﻿title,text,description,folder,tags\r\n' +
    '"a, b","line1\nline2 ""q""",desc,F,x;y\r\n' +
    '한글😀,본문,,,\r\n\r\n';
  const { state, imported } = S.importText(S.emptyState(), csv);
  assert.equal(imported, 2);
  const a = state.prompts.find((p) => p.title === 'a, b');
  assert.equal(a.text, 'line1\nline2 "q"');
  assert.deepEqual(a.extra, { description: 'desc', tags: ['x', 'y'] });
  const k = state.prompts.find((p) => p.title === '한글😀');
  assert.deepEqual([k.extra, k.folderId], [{}, null]);
});

test('bad input throws and leaves nothing half-imported', () => {
  const s = withPrompt();
  const bad = [
    '{ broken json',
    '',
    '[{"title":"ok","text":"ok"},{"title":"no text"}]', // 2번째 항목이 나빠도 1번째는 안 들어감
    '{"schemaVersion":1,"folders":[],"prompts":[{"id":"x"}]}',
    'title,text\n"unclosed,x',
  ];
  for (const b of bad) assert.throws(() => S.importText(s, b), Error, b);
  assert.equal(s.prompts.length, 1);
});
