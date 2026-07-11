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
let refreshTimer: ReturnType<typeof setInterval> | null = null;

let staleThresholdH = 24;

// ─── Утилиты ────────────────────────────────────────────
function typeLabel(t: string): string {
  return { district: 'Район', appeal: 'Апелл.', cassation: 'Касс.', magistrate: 'Мир.' }[t] || t;
}

function esc(s: string): string {
  return (s ?? '').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, ' ');
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

function isoDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return d.slice(0, 10);
}

// ─── Экран и лэйаут ─────────────────────────────────────
const screen = blessed.screen({
  smartCSR: true,
  title: 'CourtFlow',
  cursor: { shape: 'line', blink: true, artificial: false, color: 'white' },
  fullUnicode: true,
});

const STYLES = {
  header: { bg: 'blue' as const, fg: 'white' as const },
  tabActive: { bg: 'blue' as const, fg: 'white' as const },
  tabInactive: { bg: 'black' as const, fg: 'white' as const },
  tableHeader: { fg: 'white' as const, bg: 'blue' as const, bold: true as const },
  tableCell: { fg: 'white' as const, bg: 'black' as const },
  tableSelected: { bg: 'cyan' as const, fg: 'black' as const },
  statusbar: { bg: 'blue' as const, fg: 'white' as const },
  detail: { bg: 'black' as const, fg: 'white' as const },
  logOk: { fg: 'green' as const },
  logFail: { fg: 'red' as const },
  running: { fg: 'yellow' as const },
  muted: { fg: 'grey' as const },
};

// Header
const header = blessed.box({
  parent: screen,
  top: 0, left: 0, width: '100%', height: 1,
  content: ' CourtFlow \u2014 \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0445 \u0434\u0435\u043B',
  style: STYLES.header,
});

// Content area
const content = blessed.box({
  parent: screen,
  top: 1, left: 0, width: '100%', height: '100%-2',
  style: { bg: 'black' },
});

// Status bar
const statusbar = blessed.box({
  parent: screen,
  bottom: 0, left: 0, width: '100%', height: 1,
  style: STYLES.statusbar,
});

// ─── Cases table ─────────────────────────────────────────
const casesTable = blessed.listtable({
  parent: content,
  top: 0, left: 0, width: '100%', height: '100%',
  align: 'left',
  keys: false, vi: false, mouse: true,
  tags: false,
  style: {
    header: STYLES.tableHeader,
    cell: STYLES.tableCell,
    selected: STYLES.tableSelected,
  },
});

// ─── Logs view ───────────────────────────────────────────
const logsBox = blessed.box({
  parent: content,
  top: 0, left: 0, width: '100%', height: '100%',
  scrollable: true,
  alwaysScroll: true,
  keys: true, vi: true, mouse: true,
  style: { bg: 'black', fg: 'white' },
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
  hidden: true,
});

// ─── Run view ────────────────────────────────────────────
const runBox = blessed.box({
  parent: content,
  top: 2, left: 'center', width: 'shrink', height: 'shrink',
  tags: true,
  style: { bg: 'black', fg: 'white' },
  hidden: true,
});

const runTitle = blessed.box({
  parent: content,
  top: 0, left: 'center', width: 'shrink', height: 1,
  content: ' Запуск парсинга ',
  style: { bg: 'blue', fg: 'white', bold: true },
  hidden: true,
});

// ─── Detail popup ────────────────────────────────────────
const detailBox = blessed.box({
  parent: screen,
  top: 'center', left: 'center', width: 62, height: 24,
  border: { type: 'line' },
  padding: { top: 1, left: 1, right: 1, bottom: 1 },
  scrollable: true,
  alwaysScroll: true,
  keys: true, vi: true, mouse: true,
  style: { border: { fg: 'blue' }, bg: 'black', fg: 'white' },
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
  hidden: true,
});

// ─── Данные ──────────────────────────────────────────────
async function loadCases(): Promise<void> {
  try {
    const [cs, co] = await Promise.all([api.cases(), api.courts()]);
    cases = cs;
    courts = co;
    serverUp = true;
  } catch {
    serverUp = false;
  }
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

// ─── Рендер ──────────────────────────────────────────────
function getFilteredCases(): Case[] {
  return cases.filter(c => {
    if (courtFilter && c.courtType !== courtFilter) return false;
    if (!searchQuery) return true;
    const courtName = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
    const hay = [c.number, c.card?.judge, c.court, courtName].join(' ').toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });
}

function renderCases(): void {
  const filtered = getFilteredCases();
  const rows: string[][] = [
    ['\u2116 дела', 'Тип', 'Суд', 'Судья', 'Соб.', 'Посл.'],
    ...filtered.map(c => {
      const cn = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
      return [
        clip(c.number || '\u2014', 18),
        typeLabel(c.courtType),
        clip(cn, 22),
        clip(c.card?.judge || '\u2014', 16),
        String(c.events?.length ?? 0),
        isoDate(c.events?.at(-1)?.eventDate ?? c.card?.hearingDate),
      ];
    }),
  ];
  casesTable.setData(rows);
  updateStatusBar();
}

function renderLogs(): void {
  const lines: string[] = [];
  if (!logs.length) {
    lines.push('  {grey-fg}Нет записей{/grey-fg}');
  } else {
    const reversed = [...logs].reverse();
    for (const e of reversed) {
      const ts = (e.timestamp || '').slice(0, 19).replace('T', ' ');
      const ok = e.success
        ? `{green-fg}\u2713{/green-fg} {grey-fg}${e.duration}ms{/grey-fg}`
        : `{red-fg}\u2715 {bold}${esc(e.error || '')}{/bold}{/red-fg}`;
      lines.push(` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  ${esc(e.uid || '')}  ${ok}`);
    }
  }
  logsBox.setContent(lines.join('\n'));
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
    cases: `\u2191\u2193 Выбор  Enter Детали  / Поиск  F Фильтр  R Обновить  Tab Вкладка  Q Выход`,
    logs:  `\u2191\u2193 Скролл  D Дней:${logDays}  R Обновить  Tab Вкладка  Q Выход`,
    run:   `F Основной  R Retry  E Суды  D Данные  Tab Вкладка  Q Выход`,
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
  casesTable.hidden = t !== 'cases';
  logsBox.hidden = t !== 'logs';
  runBox.hidden = t !== 'run';
  runTitle.hidden = t !== 'run';

  if (t === 'cases') { casesTable.focus(); renderCases(); }
  if (t === 'logs')  { logsBox.focus(); loadLogs(); }
  if (t === 'run')   { runBox.focus(); pollRunStatus(); renderRun(); }

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

  const court = courts[c.court] || {};
  const events = (c.events || []).slice(-20).map(e =>
    `  ${isoDate(e.eventDate)}  ${esc(e.eventName || '')}  ${esc(e.result || '')}`
  ).join('\n');
  const parties = (c.parties || []).map(p =>
    `  ${esc(p.role || '\u2014')}  \u2014  ${esc(p.name || '\u2014')}`
  ).join('\n');

  const text = [
    `{cyan-fg}{bold}\u2116 ${esc(c.number || '\u2014')}{/bold}{/cyan-fg}`,
    ``,
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
    ``,
    `{bold}\u0421\u043E\u0431\u044B\u0442\u0438\u044F:{/bold}  (${c.events?.length || 0})`,
    events || '  {grey-fg}\u043D\u0435\u0442{/grey-fg}',
    ``,
    `  {grey-fg}UID: ${esc(c.uid)}{/grey-fg}`,
  ].join('\n');

  detailBox.setContent(text);
  detailBox.setScroll(0);
  detailBox.hidden = false;
  detailBox.focus();
  screen.render();
}

function hideDetail(): void {
  detailBox.hidden = true;
  showTab(tab);
}

// ─── Запуск парсинга ─────────────────────────────────────
async function startRun(mode: 'full' | 'retry'): Promise<void> {
  try {
    const r = mode === 'full' ? await api.startRun() : await api.startRetry();
    if (r.started) {
      statusbar.setContent(` {yellow-fg}\u23F3 ${mode === 'full' ? '\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439' : 'Retry'} \u043F\u0440\u043E\u0433\u043E\u043D \u0437\u0430\u043F\u0443\u0449\u0435\u043D (PID ${r.pid}){/yellow-fg}`);
    } else if (r.error) {
      statusbar.setContent(` {red-fg}\u2715 ${esc(r.error)}{/red-fg}`);
    }
    screen.render();
    setTimeout(pollRunStatus, 2000);
  } catch {
    statusbar.setContent(' {red-fg}\u2715 \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430{/red-fg}');
    screen.render();
  }
}

async function enrichCourts(): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/run/enrich-courts`, { method: 'POST' });
    if (res.ok) {
      statusbar.setContent(' {green-fg}\u2713 \u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D{/green-fg}');
    }
  } catch {
    statusbar.setContent(' {red-fg}\u2715 \u041E\u0448\u0438\u0431\u043A\u0430{/red-fg}');
  }
  screen.render();
}

// ─── Клавиатура ──────────────────────────────────────────
screen.key(['q', 'C-c'], () => {
  if (!detailBox.hidden) { hideDetail(); return; }
  if (refreshTimer) clearInterval(refreshTimer);
  screen.destroy();
  process.exit(0);
});

screen.key(['escape'], () => {
  if (!detailBox.hidden) { hideDetail(); return; }
  if (searchQuery) { searchQuery = ''; renderCases(); screen.render(); return; }
  if (courtFilter) { courtFilter = ''; renderCases(); screen.render(); return; }
});

screen.key(['tab'], () => {
  if (!detailBox.hidden) return;
  nextTab();
});

screen.key(['r'], () => {
  if (!detailBox.hidden) return;
  if (tab === 'cases') loadCases();
  if (tab === 'logs') loadLogs();
  if (tab === 'run') { pollRunStatus(); renderRun(); screen.render(); }
});

screen.key(['f'], () => {
  if (!detailBox.hidden) return;
  if (tab === 'run') { startRun('full'); return; }
  const types: (CourtType | '')[] = ['', 'district', 'appeal', 'cassation', 'magistrate'];
  const idx = types.indexOf(courtFilter);
  courtFilter = types[(idx + 1) % types.length];
  if (tab === 'cases') { renderCases(); screen.render(); }
});

screen.key(['/'], () => {
  if (!detailBox.hidden) return;
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
    if (tab === 'cases') { renderCases(); screen.render(); }
    casesTable.focus();
    screen.render();
  });
  prompt.focus();
  screen.render();
});

screen.key(['d'], () => {
  if (!detailBox.hidden) return;
  if (tab === 'logs') {
    logDays = logDays === 1 ? 7 : logDays === 7 ? 30 : 1;
    loadLogs();
    return;
  }
  if (tab === 'run') { loadCases(); loadCourtsConfig(); pollRunStatus(); renderRun(); screen.render(); return; }
});

screen.key(['e'], () => {
  if (!detailBox.hidden) return;
  if (tab === 'run') enrichCourts();
});

casesTable.on('select', (_item: any, index: number) => {
  if (tab !== 'cases') return;
  const realIdx = index < 1 ? 0 : index - 1;
  showDetail(realIdx);
});

// Явная навигация по таблице (в обход keys:true — надёжнее на разных терминалах)
screen.key(['up', 'k'], () => {
  if (tab !== 'cases' || !detailBox.hidden) return;
  casesTable.up(1);
  screen.render();
});

screen.key(['down', 'j'], () => {
  if (tab !== 'cases' || !detailBox.hidden) return;
  casesTable.down(1);
  screen.render();
});

screen.key(['home'], () => {
  if (tab !== 'cases' || !detailBox.hidden) return;
  casesTable.select(0);
  screen.render();
});

screen.key(['end'], () => {
  if (tab !== 'cases' || !detailBox.hidden) return;
  const rows = getFilteredCases().length;
  casesTable.select(rows > 0 ? rows : 0);
  screen.render();
});

// ─── Инициализация ───────────────────────────────────────
async function loadCourtsConfig(): Promise<void> {
  try {
    const cfg = await api.config();
    if (typeof cfg.staleThresholdH === 'number') staleThresholdH = cfg.staleThresholdH;
  } catch { /* ignore */ }
}

async function init(): Promise<void> {
  // Header info
  header.setContent(` CourtFlow \u2014 \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u0434\u0435\u043B  |  API: ${apiUrl}`);

  await Promise.all([loadCases(), loadCourtsConfig()]);

  casesTable.focus();
  renderCases();
  screen.render();

  refreshTimer = setInterval(async () => {
    await Promise.all([loadCases(), pollRunStatus()]);
  }, 5000);
}

screen.on('resize', () => {
  screen.render();
  renderCurrent();
});

init().catch(err => {
  screen.destroy();
  console.error('TUI: ошибка инициализации:', err.message);
  process.exit(1);
});
