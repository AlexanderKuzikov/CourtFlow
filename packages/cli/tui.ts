// packages/cli/tui.ts
// Терминальный дашборд CourtFlow на blessed.
// Запуск: npm run tui [-- --api http://host:port]

import blessed from 'blessed';
import { ApiClient, parseApiUrl } from './client.js';
import type { Case, RunResult, CourtType } from '../core/types.js';

const apiUrl = parseApiUrl(process.argv);
const api = new ApiClient(apiUrl);

// ─── Состояние ──────────────────────────────────────────
type Tab = 'cases' | 'logs' | 'run';
let tab: Tab = 'cases';
let cases: Case[] = [];
let courts: Record<string, { name?: string; shortName?: string; address?: string; email?: string; phones?: string[]; vnkod?: string }> = {};
let logs: RunResult[] = [];
let logDays = 7;
let serverUp = false;
let courtFilter: CourtType | '' = '';
let searchQuery = '';
let fullRunning = false;
let retryRunning = false;
let staleThresholdH = 24;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing = false;
let searchActive = false;
let selectedCaseIdx = 0;

// ─── Утилиты ────────────────────────────────────────────
function typeLabel(t: string): string {
  return { district: 'Район', appeal: 'Апелл.', cassation: 'Касс.', magistrate: 'Мир.' }[t] || t;
}

function esc(s: string): string {
  return (s ?? '').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, ' ');
}

function pad(s: string, w: number): string {
  return s.padEnd(w, ' ');
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '›';
}

function isoDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

function getSep(): string {
  return screen.fullUnicode ? '│' : '|';
}

// ─── Экран ──────────────────────────────────────────────
const screen = blessed.screen({
  smartCSR: true,
  title: 'CourtFlow',
  fullUnicode: true,
});

// Header (строка 0)
const header = blessed.box({
  parent: screen,
  top: 0, left: 0, width: '100%', height: 1,
  style: { bg: 'blue', fg: 'white' },
});

// Column headers for cases list (строка 1)
const casesHeader = blessed.box({
  parent: screen,
  top: 1, left: 0, width: '100%', height: 1,
  style: { bg: 'blue', fg: 'white', bold: true },
});

// Cases list (строка 2..дно-1)
const casesList = blessed.list({
  parent: screen,
  top: 2, left: 0, width: '100%', height: '100%-3',
  keys: true, vi: true, mouse: true,
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
  style: {
    item: { fg: 'white', bg: 'black' },
    selected: { bg: 'white', fg: 'black', bold: true },
  },
});

// Logs view
const logsBox = blessed.box({
  parent: screen,
  top: 1, left: 0, width: '100%', height: '100%-2',
  scrollable: true, alwaysScroll: true,
  keys: true, vi: true, mouse: true,
  tags: true,
  style: { bg: 'black', fg: 'white' },
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
});

// Run view
const runTitle = blessed.box({
  parent: screen,
  top: 1, left: 'center', width: 'shrink', height: 1,
  content: ' Запуск парсинга ',
  style: { bg: 'blue', fg: 'white', bold: true },
});

const runBox = blessed.box({
  parent: screen,
  top: 3, left: 'center', width: 'shrink', height: 'shrink',
  tags: true,
  style: { bg: 'black', fg: 'white' },
});

// Detail popup
const detailBox = blessed.box({
  parent: screen,
  top: 'center', left: 'center', width: 62, height: 24,
  border: { type: 'line' },
  padding: { top: 1, left: 1, right: 1, bottom: 1 },
  scrollable: true, alwaysScroll: true,
  keys: true, vi: true, mouse: true,
  tags: true,
  style: { border: { fg: 'blue' }, bg: 'black', fg: 'white' },
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
});

// Status bar (последняя строка)
const statusbar = blessed.box({
  parent: screen,
  bottom: 0, left: 0, width: '100%', height: 1,
  tags: true,
  style: { bg: 'blue', fg: 'white' },
});

// ─── Начальное состояние ─────────────────────────────────
[casesHeader, casesList, logsBox, runBox, runTitle, detailBox].forEach(el => el.hide());

// ─── Данные ──────────────────────────────────────────────
async function loadCases(): Promise<void> {
  try {
    const [cs, co] = await Promise.all([api.cases(), api.courts()]);
    cases = cs;
    courts = co;
    serverUp = true;
  } catch { serverUp = false; }
  renderCurrent();
}

async function loadLogs(): Promise<void> {
  try {
    logs = await api.logs(logDays);
    serverUp = true;
  } catch { serverUp = false; }
  if (tab === 'logs') renderLogs();
}

async function pollRunStatus(): Promise<void> {
  try {
    const s = await api.runStatus();
    fullRunning = s.full.running;
    retryRunning = s.retry.running;
    serverUp = true;
  } catch { serverUp = false; }
  updateStatusBar();
}

// ─── Auto-refresh loop ───────────────────────────────────
async function autoRefresh(): Promise<void> {
  if (refreshing || detailBox.visible || searchActive) {
    refreshTimer = setTimeout(autoRefresh, 5000);
    return;
  }
  refreshing = true;
  try {
    await Promise.all([loadCases(), pollRunStatus()]);
  } finally {
    refreshing = false;
    refreshTimer = setTimeout(autoRefresh, 5000);
  }
}

// ─── Форматирование списка дел ───────────────────────────
const COL = { num: 24, type: 10, court: 28, judge: 20, evt: 5, date: 10 };
const sep = getSep();

function formatCaseItem(c: Case): string {
  const cn = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
  return (
    pad(clip(c.number || '—', COL.num - 1), COL.num) + sep +
    pad(typeLabel(c.courtType), COL.type) + sep +
    pad(clip(cn, COL.court - 1), COL.court) + sep +
    pad(clip(c.card?.judge || '—', COL.judge - 1), COL.judge) + sep +
    pad(String(c.events?.length ?? 0), COL.evt) + sep +
    pad(isoDate(c.events?.at(-1)?.eventDate ?? c.card?.hearingDate), COL.date)
  );
}

function buildHeaderLine(): string {
  return (
    pad('№ дела', COL.num) + sep +
    pad('Тип', COL.type) + sep +
    pad('Суд', COL.court) + sep +
    pad('Судья', COL.judge) + sep +
    pad('Соб.', COL.evt) + sep +
    pad('Посл.', COL.date)
  );
}

function getFilteredCases(): Case[] {
  return cases.filter(c => {
    if (courtFilter && c.courtType !== courtFilter) return false;
    if (!searchQuery) return true;
    const courtName = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
    const hay = [c.number, c.card?.judge, c.court, courtName].join(' ').toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });
}

// ─── Рендер ──────────────────────────────────────────────
function renderCases(): void {
  const filtered = getFilteredCases();
  const prevSelected = selectedCaseIdx;
  const items = filtered.map(formatCaseItem);
  casesHeader.setContent(buildHeaderLine());
  casesList.setItems(items);
  const sel = Math.min(prevSelected, Math.max(0, items.length - 1));
  if (items.length > 0) casesList.select(sel);
  selectedCaseIdx = sel;
  updateStatusBar();
}

function renderLogs(): void {
  if (!logs.length) {
    logsBox.setContent('  {grey-fg}Нет записей{/grey-fg}');
  } else {
    const lines = [...logs].reverse().map(e => {
      const ts = (e.timestamp || '').slice(0, 19).replace('T', ' ');
      if (e.success) {
        return ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  ${esc(e.uid || '')}  {green-fg}✓{/green-fg} {grey-fg}${e.duration}ms{/grey-fg}`;
      }
      return ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  {red-fg}✕ {bold}${esc(e.error || '')}{/bold}{/red-fg}`;
    });
    logsBox.setContent(lines.join('\n'));
  }
  updateStatusBar();
}

function renderRun(): void {
  const lines = [
    `  {blue-fg}{bold}▶  Основной прогон{/bold}{/blue-fg}`,
    `     Все URL из watch/ — независимо от даты последнего обновления.`,
    '',
    `     Состояние: ${fullRunning ? '{yellow-fg}⏳ В процессе{/yellow-fg}' : '{grey-fg}⏸ Ожидание{/grey-fg}'}`,
    '',
    '',
    `  {yellow-fg}{bold}🔄  Retry-прогон{/bold}{/yellow-fg}`,
    `     Только те URL, которые не обновлялись дольше ${staleThresholdH} часов.`,
    '',
    `     Состояние: ${retryRunning ? '{yellow-fg}⏳ В процессе{/yellow-fg}' : '{grey-fg}⏸ Ожидание{/grey-fg}'}`,
    '',
    '',
    `  {grey-fg}📦  Инструменты:{/grey-fg}`,
    `     {bold}E{/bold}  Справочник судов  |  {bold}D{/bold}  Обновить данные`,
    '',
    `  {cyan-fg}⏎ Enter — запустить выбранное действие{/cyan-fg}`,
  ];
  runBox.setContent(lines.join('\n'));
  updateStatusBar();
}

function updateStatusBar(): void {
  const count = getFilteredCases().length;
  const runInfo = fullRunning ? ' {yellow-fg}⏳ Парсинг{/yellow-fg}' : retryRunning ? ' {yellow-fg}⏳ Retry{/yellow-fg}' : '';
  const connInfo = serverUp
    ? ` {green-fg}●{/green-fg} ${apiUrl}`
    : ` {red-fg}● Сервер недоступен{/red-fg} {grey-fg}${apiUrl}{/grey-fg}`;
  const hints: Record<Tab, string> = {
    cases: `↑↓ Выбор  Enter Детали  / Поиск  F Фильтр  R Обновить  1|2|3 Вкладки  Q Выход`,
    logs:  `↑↓ Скролл  D Дней:${logDays}  R Обновить  1|2|3 Вкладки  Q Выход`,
    run:   `F Основной  R Retry  E Суды  D Данные  1|2|3 Вкладки  Q Выход`,
  };
  statusbar.setContent(` ${count} дел${runInfo}    ${connInfo}    ${hints[tab]}`);
}

function renderCurrent(): void {
  switch (tab) {
    case 'cases': renderCases(); break;
    case 'logs':  renderLogs(); break;
    case 'run':   renderRun(); break;
  }
}

// ─── Смена вкладки ───────────────────────────────────────
function showTab(t: Tab): void {
  tab = t;

  [casesHeader, casesList, logsBox, runBox, runTitle].forEach(el => el.hide());

  switch (t) {
    case 'cases':
      casesHeader.show();
      casesList.show();
      renderCases();
      casesList.focus();
      break;
    case 'logs':
      logsBox.show();
      loadLogs();
      logsBox.focus();
      break;
    case 'run':
      runTitle.show();
      runBox.show();
      pollRunStatus();
      renderRun();
      runBox.focus();
      break;
  }

  screen.render();
}

function nextTab(): void {
  const order: Tab[] = ['cases', 'logs', 'run'];
  showTab(order[(order.indexOf(tab) + 1) % order.length]);
}

// ─── Детали дела ─────────────────────────────────────────
function showDetail(idx: number): void {
  const filtered = getFilteredCases();
  const c = filtered[idx];
  if (!c) return;

  casesHeader.hide();
  casesList.hide();

  const court = courts[c.court] || {};
  const events = (c.events || []).slice(-20).map(e =>
    `  ${isoDate(e.eventDate)}  ${esc(e.eventName || '')}  ${esc(e.result || '')}`
  ).join('\n');
  const parties = (c.parties || []).map(p =>
    `  ${esc(p.role || '—')}  —  ${esc(p.name || '—')}`
  ).join('\n');

  const text = [
    `{cyan-fg}{bold}№ ${esc(c.number || '—')}{/bold}{/cyan-fg}`,
    '',
    `{bold}Тип:{/bold}       ${typeLabel(c.courtType)}`,
    `{bold}Суд:{/bold}       ${esc(court.name || c.court)}`,
    `{bold}Поддомен:{/bold}  ${esc(c.court)}`,
    `{bold}Судья:{/bold}     ${esc(c.card?.judge || '—')}`,
    `{bold}Поступление:{/bold} ${isoDate(c.card?.filingDate)}`,
    `{bold}Результат:{/bold}   ${esc(c.card?.result || '—')}`,
    `{bold}Адрес:{/bold}     ${esc(court.address || '—')}`,
    `{bold}Телефоны:{/bold}  ${(court.phones || []).join(', ') || '—'}`,
    `{bold}Участники:{/bold}  (${c.parties?.length || 0})`,
    parties || '  {grey-fg}нет{/grey-fg}',
    '',
    `{bold}События:{/bold}  (${c.events?.length || 0})`,
    events || '  {grey-fg}нет{/grey-fg}',
    '',
    `  {grey-fg}UID: ${esc(c.uid)}{/grey-fg}`,
  ].join('\n');

  detailBox.setContent(text);
  detailBox.setScroll(0);
  detailBox.show();
  detailBox.focus();
  screen.render();
}

function hideDetail(): void {
  detailBox.hide();
  showTab(tab);
}

detailBox.key('enter', () => { hideDetail(); });

// ─── Запуск парсинга ─────────────────────────────────────
async function startRun(mode: 'full' | 'retry'): Promise<void> {
  try {
    const r = mode === 'full' ? await api.startRun() : await api.startRetry();
    if (r.started) {
      statusbar.setContent(` {yellow-fg}⏳ ${mode === 'full' ? 'Основной' : 'Retry'} прогон запущен (PID ${r.pid}){/yellow-fg}`);
    } else if (r.error) {
      statusbar.setContent(` {red-fg}✕ ${esc(r.error)}{/red-fg}`);
    }
    screen.render();
    setTimeout(pollRunStatus, 2000);
  } catch {
    statusbar.setContent(' {red-fg}✕ Ошибка запуска{/red-fg}');
    screen.render();
  }
}

async function enrichCourts(): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/run/enrich-courts`, { method: 'POST' });
    if (res.ok) {
      statusbar.setContent(' {green-fg}✓ Справочник судов обновлён{/green-fg}');
    }
  } catch {
    statusbar.setContent(' {red-fg}✕ Ошибка{/red-fg}');
  }
  screen.render();
}

// ─── Клавиатура ──────────────────────────────────────────
screen.key(['q', 'C-c'], () => {
  if (detailBox.visible) { hideDetail(); return; }
  if (refreshTimer) clearTimeout(refreshTimer);
  screen.destroy();
  process.exit(0);
});

screen.key(['escape'], () => {
  if (detailBox.visible) { hideDetail(); return; }
  if (searchQuery) { searchQuery = ''; renderCases(); screen.render(); return; }
  if (courtFilter) { courtFilter = ''; renderCases(); screen.render(); return; }
});

screen.key(['tab'], () => {
  if (detailBox.visible) return;
  nextTab();
});

screen.key(['1'], () => { if (!detailBox.visible) showTab('cases'); });
screen.key(['2'], () => { if (!detailBox.visible) showTab('logs'); });
screen.key(['3'], () => { if (!detailBox.visible) showTab('run'); });

screen.key(['r'], () => {
  if (detailBox.visible) return;
  if (tab === 'cases') loadCases();
  if (tab === 'logs') loadLogs();
  if (tab === 'run') { pollRunStatus(); renderRun(); screen.render(); }
});

screen.key(['f'], () => {
  if (detailBox.visible) return;
  if (tab === 'run') { startRun('full'); return; }
  if (tab === 'cases') {
    const types: (CourtType | '')[] = ['', 'district', 'appeal', 'cassation', 'magistrate'];
    const idx = types.indexOf(courtFilter);
    courtFilter = types[(idx + 1) % types.length];
    renderCases();
    screen.render();
  }
});

screen.key(['/'], () => {
  if (detailBox.visible) return;
  if (tab !== 'cases') return;
  searchActive = true;
  const prompt = blessed.textbox({
    parent: screen,
    bottom: 1, left: 1, width: 30, height: 1,
    inputOnFocus: true,
    style: { bg: 'yellow', fg: 'black' },
  });
  prompt.setValue(searchQuery);
  prompt.readInput((_err, value) => {
    searchQuery = (value || '').trim();
    searchActive = false;
    prompt.destroy();
    renderCases();
    casesList.focus();
    screen.render();
  });
  prompt.focus();
  screen.render();
});

screen.key(['d'], () => {
  if (detailBox.visible) return;
  if (tab === 'logs') {
    logDays = logDays === 1 ? 7 : logDays === 7 ? 30 : 1;
    loadLogs();
    return;
  }
  if (tab === 'run') { loadCases(); loadCourtsConfig(); pollRunStatus(); renderRun(); screen.render(); }
});

screen.key(['e'], () => {
  if (detailBox.visible) return;
  if (tab === 'run') enrichCourts();
});

casesList.on('select', (_item: any, idx: number) => {
  if (tab !== 'cases') return;
  selectedCaseIdx = idx;
  showDetail(idx);
});

// ─── Инициализация ───────────────────────────────────────
async function loadCourtsConfig(): Promise<void> {
  try {
    const cfg = await api.config();
    if (typeof cfg.staleThresholdH === 'number') staleThresholdH = cfg.staleThresholdH;
  } catch { /* ignore */ }
}

async function init(): Promise<void> {
  header.setContent(` CourtFlow — Мониторинг дел  |  API: ${apiUrl}`);

  await Promise.all([loadCases(), loadCourtsConfig()]);

  showTab('cases');

  refreshTimer = setTimeout(autoRefresh, 5000);
}

screen.on('resize', () => {
  screen.render();
});

init().catch(err => {
  screen.destroy();
  console.error('TUI: ошибка инициализации:', err.message);
  process.exit(1);
});
