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
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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
  return s.slice(0, max - 1) + '\u203A';
}

function isoDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return d.slice(0, 10);
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

// ─── Форматирование списка дел ───────────────────────────
const COL = { num: 24, type: 10, court: 28, judge: 20, evt: 5, date: 10 };

function formatCaseItem(c: Case): string {
  const cn = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
  return (
    pad(clip(c.number || '\u2014', COL.num - 1), COL.num) + '\u2502' +
    pad(typeLabel(c.courtType), COL.type) + '\u2502' +
    pad(clip(cn, COL.court - 1), COL.court) + '\u2502' +
    pad(clip(c.card?.judge || '\u2014', COL.judge - 1), COL.judge) + '\u2502' +
    pad(String(c.events?.length ?? 0), COL.evt) + '\u2502' +
    pad(isoDate(c.events?.at(-1)?.eventDate ?? c.card?.hearingDate), COL.date)
  );
}

function buildHeaderLine(): string {
  return (
    pad('\u2116 дела', COL.num) + '\u2502' +
    pad('Тип', COL.type) + '\u2502' +
    pad('Суд', COL.court) + '\u2502' +
    pad('Судья', COL.judge) + '\u2502' +
    pad('Соб.', COL.evt) + '\u2502' +
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
  const prevSelected = (casesList as any).selected ?? 0;
  const items = filtered.map(formatCaseItem);
  casesHeader.setContent(buildHeaderLine());
  casesList.setItems(items);
  const sel = Math.min(prevSelected, Math.max(0, items.length - 1));
  if (items.length > 0) casesList.select(sel);
  updateStatusBar();
}

function renderLogs(): void {
  if (!logs.length) {
    logsBox.setContent('  {grey-fg}Нет записей{/grey-fg}');
  } else {
    const lines = [...logs].reverse().map(e => {
      const ts = (e.timestamp || '').slice(0, 19).replace('T', ' ');
      if (e.success) {
        return ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  ${esc(e.uid || '')}  {green-fg}\u2713{/green-fg} {grey-fg}${e.duration}ms{/grey-fg}`;
      }
      return ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  {red-fg}\u2715 {bold}${esc(e.error || '')}{/bold}{/red-fg}`;
    });
    logsBox.setContent(lines.join('\n'));
  }
  updateStatusBar();
}

function renderRun(): void {
  const lines = [
    `  {blue-fg}{bold}\u25B6  Основной прогон{/bold}{/blue-fg}`,
    `     Все URL из watch/ — независимо от даты последнего обновления.`,
    '',
    `     Состояние: ${fullRunning ? '{yellow-fg}\u23F3 В процессе{/yellow-fg}' : '{grey-fg}\u23F8 Ожидание{/grey-fg}'}`,
    '',
    '',
    `  {yellow-fg}{bold}\u{1F504}  Retry-прогон{/bold}{/yellow-fg}`,
    `     Только те URL, которые не обновлялись дольше ${staleThresholdH} часов.`,
    '',
    `     Состояние: ${retryRunning ? '{yellow-fg}\u23F3 В процессе{/yellow-fg}' : '{grey-fg}\u23F8 Ожидание{/grey-fg}'}`,
    '',
    '',
    `  {grey-fg}\u{1F4E6}  Инструменты:{/grey-fg}`,
    `     {bold}E{/bold}  Справочник судов  |  {bold}D{/bold}  Обновить данные`,
    '',
    `  {cyan-fg}\u23CE Enter \u2014 запустить выбранное действие{/cyan-fg}`,
  ];
  runBox.setContent(lines.join('\n'));
  updateStatusBar();
}

function updateStatusBar(): void {
  const count = getFilteredCases().length;
  const runInfo = fullRunning ? ' {yellow-fg}\u23F3 Парсинг{/yellow-fg}' : retryRunning ? ' {yellow-fg}\u23F3 Retry{/yellow-fg}' : '';
  const connInfo = serverUp
    ? ` {green-fg}\u25CF{/green-fg} ${apiUrl}`
    : ` {red-fg}\u25CF Сервер недоступен{/red-fg} {grey-fg}${apiUrl}{/grey-fg}`;
  const hints: Record<Tab, string> = {
    cases: `\u2191\u2193 Выбор  Enter Детали  / Поиск  F Фильтр  R Обновить  1\u25022\u25023 Вкладки  Q Выход`,
    logs:  `\u2191\u2193 Скролл  D Дней:${logDays}  R Обновить  1\u25022\u25023 Вкладки  Q Выход`,
    run:   `F Основной  R Retry  E Суды  D Данные  1\u25022\u25023 Вкладки  Q Выход`,
  };
  statusbar.setContent(` ${count} \u0434\u0435\u043B${runInfo}    ${connInfo}    ${hints[tab]}`);
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
    `  ${esc(p.role || '\u2014')}  \u2014  ${esc(p.name || '\u2014')}`
  ).join('\n');

  const text = [
    `{cyan-fg}{bold}\u2116 ${esc(c.number || '\u2014')}{/bold}{/cyan-fg}`,
    '',
    `{bold}\u0422\u0438\u043F:{/bold}       ${typeLabel(c.courtType)}`,
    `{bold}\u0421\u0443\u0434:{/bold}       ${esc(court.name || c.court)}`,
    `{bold}\u041F\u043E\u0434\u0434\u043E\u043C\u0435\u043D:{/bold}  ${esc(c.court)}`,
    `{bold}\u0421\u0443\u0434\u044C\u044F:{/bold}     ${esc(c.card?.judge || '\u2014')}`,
    `{bold}\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435:{/bold} ${isoDate(c.card?.filingDate)}`,
    `{bold}\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442:{/bold}   ${esc(c.card?.result || '\u2014')}`,
    `{bold}\u0410\u0434\u0440\u0435\u0441:{/bold}     ${esc(court.address || '\u2014')}`,
    `{bold}\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u044B:{/bold}  ${(court.phones || []).join(', ') || '\u2014'}`,
    `{bold}\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438:{/bold}  (${c.parties?.length || 0})`,
    parties || '  {grey-fg}\u043D\u0435\u0442{/grey-fg}',
    '',
    `{bold}\u0421\u043E\u0431\u044B\u0442\u0438\u044F:{/bold}  (${c.events?.length || 0})`,
    events || '  {grey-fg}\u043D\u0435\u0442{/grey-fg}',
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
      statusbar.setContent(` {yellow-fg}\u23F3 ${mode === 'full' ? 'Основной' : 'Retry'} прогон запущен (PID ${r.pid}){/yellow-fg}`);
    } else if (r.error) {
      statusbar.setContent(` {red-fg}\u2715 ${esc(r.error)}{/red-fg}`);
    }
    screen.render();
    setTimeout(pollRunStatus, 2000);
  } catch {
    statusbar.setContent(' {red-fg}\u2715 Ошибка запуска{/red-fg}');
    screen.render();
  }
}

async function enrichCourts(): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/run/enrich-courts`, { method: 'POST' });
    if (res.ok) {
      statusbar.setContent(' {green-fg}\u2713 Справочник судов обновлён{/green-fg}');
    }
  } catch {
    statusbar.setContent(' {red-fg}\u2715 Ошибка{/red-fg}');
  }
  screen.render();
}

// ─── Клавиатура ──────────────────────────────────────────
screen.key(['q', 'C-c'], () => {
  if (detailBox.visible) { hideDetail(); return; }
  if (refreshTimer) clearInterval(refreshTimer);
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
  const prompt = blessed.textbox({
    parent: screen,
    bottom: 1, left: 1, width: 30, height: 1,
    inputOnFocus: true,
    style: { bg: 'yellow', fg: 'black' },
  });
  prompt.setValue(searchQuery);
  prompt.readInput((_err, value) => {
    searchQuery = (value || '').trim();
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
  header.setContent(` CourtFlow \u2014 \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u0434\u0435\u043B  |  API: ${apiUrl}`);

  await Promise.all([loadCases(), loadCourtsConfig()]);

  showTab('cases');

  refreshTimer = setInterval(async () => {
    if (detailBox.visible) return;
    await Promise.all([loadCases(), pollRunStatus()]);
  }, 5000);
}

screen.on('resize', () => {
  renderCurrent();
  screen.render();
});

init().catch(err => {
  screen.destroy();
  console.error('TUI: ошибка инициализации:', err.message);
  process.exit(1);
});
