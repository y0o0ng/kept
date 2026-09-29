// side panel 화면 로직: 목록·검색·복사·추가/편집·폴더·휴지통·백업 배너·내보내기.
// 상태 변경은 전부 storage.js의 순수 함수로 만들고, commit()이 저장 후 다시 그림.
import * as S from './storage.js';

const $ = (id) => document.getElementById(id);
let state;
let inTrash = false;
let editingId = null; // null이면 새 프롬프트
let selected = new Set(); // 일괄 삭제용 선택 (보이는 항목 안에서만 유지)
const ALL = '__all__'; // 폴더 필터: 전체 / '' 미분류 / 폴더 id

async function commit(next) {
  try {
    await S.save(next); // 용량 초과 등은 여기서 명확한 메시지로 던져짐
  } catch (e) {
    toast(e.message, 4000);
    return;
  }
  state = next;
  render();
  return true;
}

// ---------- 그리기 (textContent만 사용 → 내용이 HTML로 해석되지 않음) ----------
function render() {
  const cur = $('folder').options.length ? $('folder').value : ALL; // ''(미분류)도 유효한 선택값
  const opts = [['All folders', ALL], ['Uncategorized', ''], ...state.folders.map((f) => [f.name, f.id])];
  $('folder').replaceChildren(...opts.map(([t, v]) => new Option(t, v)));
  $('folder').value = opts.some(([, v]) => v === cur) ? cur : ALL; // 삭제된 폴더면 All로
  const real = $('folder').value !== ALL && $('folder').value !== '';
  $('fRename').disabled = $('fDel').disabled = !real;

  $('main').hidden = inTrash;
  $('trashHead').hidden = !inTrash;
  $('foot').hidden = inTrash;

  const b = S.backupStatus(state);
  $('backupText').textContent = b.text;
  $('backupDot').className = `dot ${b.level}`; // 색만으로 전달하지 않도록 문구도 함께 바뀜
  const n = S.unbackedCount(state);
  $('banner').hidden = inTrash || n === 0;
  $('bannerText').textContent = `⚠ ${n} new prompt${n === 1 ? '' : 's'} since your last backup.`;

  const items = inTrash ? S.trashedPrompts(state) : visible();
  const shown = new Set(items.map((p) => p.id));
  selected = new Set([...selected].filter((id) => shown.has(id))); // 안 보이게 된 항목은 선택 해제
  $('list').replaceChildren(...items.map(inTrash ? trashRow : row));
  $('emptyTrash').disabled = !items.length;
  $('bulk').hidden = !items.length;
  $('selAll').checked = items.length > 0 && selected.size === items.length;
  $('restoreSel').hidden = !inTrash;
  $('restoreSel').disabled = $('delSel').disabled = !selected.size;
  $('delSel').textContent = `${inTrash ? 'Delete forever' : 'Delete selected'} (${selected.size})`;
  $('empty').hidden = items.length > 0;
  const noPrompts = !inTrash && S.activePrompts(state).length === 0; // 휴지통에만 있어도 "0개"
  const q = $('q').value.trim();
  $('emptyActions').hidden = !noPrompts;
  $('emptyMsg').textContent = inTrash
    ? 'Trash is empty.'
    : noPrompts
      ? 'No prompts yet. Add one, or import a backup or a file from AI Prompt Genius.'
      : q
        ? `No prompts match "${q}".`
        : 'No prompts in this folder.'; // 검색어 없이 폴더 필터만으로 비었을 때
}

const visible = () => {
  const f = $('folder').value;
  return S.search(state, $('q').value).filter((p) => f === ALL || (p.folderId ?? '') === f);
};

// aria-label에 프롬프트 제목을 넣어 스크린리더가 어느 항목의 버튼인지 알 수 있게 함
const btn = (label, onclick, aria) =>
  Object.assign(document.createElement('button'), { textContent: label, onclick, ariaLabel: aria ?? null });
const titleOf = (p) => p.title || '(untitled)';

function base(p, buttons) {
  const li = document.createElement('li');
  const body = document.createElement('div');
  body.className = 'body';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = titleOf(p);
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.textContent = p.text.split('\n')[0];
  body.append(title, preview);
  const b = document.createElement('div');
  b.className = 'btns';
  b.append(...buttons);
  li.append(body, b);
  return li;
}

// clipboard는 클릭 핸들러 안에서 바로 호출해야 함
const row = (p) => {
  const li = base(p, [
    btn('Copy', () => navigator.clipboard.writeText(p.text).then(() => toast('Copied'), () => toast('Copy failed')), `Copy ${titleOf(p)}`),
    btn('Edit', () => openEditor(p), `Edit ${titleOf(p)}`),
    btn('Delete', () => commit(S.trashPrompt(state, p.id)), `Delete ${titleOf(p)}`), // 휴지통으로만 감 → 복구 가능
  ]);
  li.prepend(checkbox(p));
  return li;
};

const trashRow = (p) => {
  const li = base(p, [
    btn('Restore', () => commit(S.restorePrompt(state, p.id)), `Restore ${titleOf(p)}`),
    btn('Delete forever', () => confirm(`Permanently delete "${titleOf(p)}"?`) && commit(S.purgePrompt(state, p.id)), `Delete ${titleOf(p)} forever`),
  ]);
  li.prepend(checkbox(p));
  return li;
};

function checkbox({ id, title }) {
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: selected.has(id), ariaLabel: `Select ${title || '(untitled)'}` });
  box.onchange = () => { box.checked ? selected.add(id) : selected.delete(id); render(); };
  return box;
}

// ---------- 일괄 삭제 / 휴지통 비우기 ----------
$('selAll').onchange = () => {
  const items = inTrash ? S.trashedPrompts(state) : visible();
  selected = $('selAll').checked ? new Set(items.map((p) => p.id)) : new Set();
  render();
};
// 일반 화면의 선택 삭제는 휴지통으로 가므로 복구 가능 → 확인 창 없음.
// 휴지통 화면의 선택 삭제는 영구 삭제 → 확인 창.
$('delSel').onclick = () => {
  const ids = [...selected];
  if (inTrash && !confirm(`Permanently delete ${ids.length} selected prompt${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
  selected = new Set();
  commit(inTrash ? S.purgeMany(state, ids) : S.trashMany(state, ids));
};
$('restoreSel').onclick = () => {
  const ids = [...selected];
  selected = new Set();
  commit(S.restoreMany(state, ids));
};
$('emptyTrash').onclick = () => {
  const n = S.trashedPrompts(state).length;
  if (n && confirm(`Permanently delete all ${n} prompt${n === 1 ? '' : 's'} in the trash? This cannot be undone.`)) commit(S.emptyTrash(state));
};

// ---------- 편집 ----------
function openEditor(p) {
  editingId = p?.id ?? null;
  $('fTitle').value = p?.title ?? '';
  $('fText').value = p?.text ?? '';
  const sel = $('fFolder');
  sel.replaceChildren(new Option('Uncategorized', ''), ...state.folders.map((f) => new Option(f.name, f.id)));
  const cur = p ? p.folderId : $('folder').value; // 새 프롬프트는 현재 보고 있는 폴더에
  sel.value = state.folders.some((f) => f.id === cur) ? cur : '';
  $('dlg').showModal();
}

$('dlg').addEventListener('close', () => {
  if ($('dlg').returnValue !== 'ok') return;
  const fields = { title: $('fTitle').value.trim(), text: $('fText').value, folderId: $('fFolder').value || null };
  if (!fields.title && !fields.text) return toast('Nothing to save.');
  commit(editingId ? S.updatePrompt(state, editingId, fields) : S.addPrompt(state, fields));
});

// ---------- 폴더 (window.prompt/confirm 사용: 가장 단순) ----------
const curFolder = () => state.folders.find((f) => f.id === $('folder').value);
$('fNew').onclick = () => {
  const name = prompt('Folder name')?.trim();
  if (!name) return;
  if (state.folders.some((f) => f.name === name)) return toast('That folder already exists.');
  commit(S.addFolder(state, name));
};
$('fRename').onclick = () => {
  const f = curFolder();
  const name = f && prompt('New name', f.name)?.trim();
  if (!name || name === f.name) return;
  if (state.folders.some((x) => x.name === name)) return toast('That folder already exists.');
  commit(S.renameFolder(state, f.id, name));
};
$('fDel').onclick = () => {
  const f = curFolder();
  if (f && confirm(`Delete folder "${f.name}"? Its prompts move to Uncategorized.`)) commit(S.deleteFolder(state, f.id));
};

// ---------- 가져오기: 자체 백업 JSON / AI Prompt Genius JSON·CSV ----------
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0];
  $('file').value = ''; // 같은 파일을 다시 골라도 change가 발생하도록
  if (!file) return;
  toast('Importing…', 60000); // 큰 저장소에서는 저장이 몇 초 걸릴 수 있음
  let result;
  try {
    result = S.importText(state, await file.text()); // 전체 검증 통과 시에만 결과가 나옴
  } catch (e) {
    return toast(`Import failed: ${e.message} Nothing was changed.`, 5000);
  }
  try {
    if (await commit(result.state)) toast(`Imported ${result.imported}, skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}.`, 4000);
    else console.error('import: save failed'); // commit이 이미 에러 토스트를 띄움
  } catch (e) {
    console.error(e); // 저장 이후 단계(화면 그리기 등)에서 난 예상 밖 에러도 화면에 드러냄
    toast(`Import failed: ${e.message}`, 6000);
  }
};

// ---------- 내보내기 ----------
function exportBackup() {
  const now = Date.now();
  const json = JSON.stringify(S.buildExport(state, now), null, 2);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `prompt-vault-${new Date(now).toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  // ponytail: 다운로드가 실제로 저장됐는지는 알 수 없음(취소 가능). 필요하면 downloads 권한 없이는 불가.
  commit(S.markExported(state, now));
}

// ---------- 연결 ----------
let timer;
function toast(msg, ms = 1200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('on'), ms);
}

$('q').addEventListener('input', render);
$('folder').addEventListener('change', render);
$('new').onclick = $('emptyNew').onclick = () => openEditor(null);
$('emptyImport').onclick = () => $('file').click();
$('backup').onclick = $('export').onclick = exportBackup;
$('trash').onclick = () => { inTrash = true; selected = new Set(); render(); };
$('back').onclick = () => { inTrash = false; selected = new Set(); render(); };
// 다른 창의 변경 반영. 이벤트에 새 값이 들어 있으므로 큰 저장소를 다시 읽지 않음
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vault) { state = changes.vault.newValue ?? S.emptyState(); render(); }
});
// 틀과 "Loading…"(HTML에 이미 있음)이 먼저 그려지도록 한 프레임 양보한 뒤 읽음.
// 저장 데이터가 크면 읽는 데 몇 초 걸릴 수 있음
await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
state = await S.load();
render();
