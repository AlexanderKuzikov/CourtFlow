// packages/cli/tui.ts
// Терминальный дашборд CourtFlow на blessed.
// Запуск: npm run tui [-- --api http://host:port]

import blessed from 'blessed';
import { ApiClient, parseApiUrl } from './client.js';
import type { Case, RunResult, CourtType } from '../core/types.js';

type Tab = 'cases' | 'logs' | 'run';
type CourtInfo = { name?: string; shortName?: string; address?: string; email?: string; phones?: string[]; vnkod?: string };

let apiUrl = '';
let api!: ApiClient;
let tab: Tab = 'cases';
let cases: Case[] = [];
let courts: Record<string, CourtInfo> = {};
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
let destroyed = false;
let searchActive = false;
let selectedCaseIdx = 0;

export function typeLabel(t: string): string {
  return { district: 'Район', appeal: 'Апелл.', cassation: 'Касс.', magistrate: 'Мир.' }[t] || t;
}
export function esc(s: string | null | undefined): string { return (s ?? '').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, ' '); }
export function pad(s: string, width: number): string { return s.padEnd(width, ' '); }
export function clip(s: string, max: number): string { return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '›'; }
export function isoDate(d: string | null | undefined): string { return d ? d.slice(0, 10) : '—'; }
export const COL = { num: 24, type: 10, court: 28, judge: 20, evt: 5, date: 10 };

const screen = blessed.screen({ smartCSR: true, title: 'CourtFlow', fullUnicode: true });
export function getSep(): string { return screen.fullUnicode ? '│' : '|'; }
function sep(): string { return getSep(); }

const header = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, style: { bg: 'blue', fg: 'white' } });
const casesHeader = blessed.box({ parent: screen, top: 1, left: 0, width: '100%', height: 1, style: { bg: 'blue', fg: 'white', bold: true } });
const casesList = blessed.list({ parent: screen, top: 2, left: 0, width: '100%', height: '100%-3', keys: true, vi: true, mouse: true, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } }, style: { item: { fg: 'white', bg: 'black' }, selected: { bg: 'white', fg: 'black', bold: true } } });
const logsBox = blessed.box({ parent: screen, top: 1, left: 0, width: '100%', height: '100%-2', scrollable: true, alwaysScroll: true, keys: true, vi: true, mouse: true, tags: true, style: { bg: 'black', fg: 'white' }, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } } });
const runTitle = blessed.box({ parent: screen, top: 1, left: 'center', width: 'shrink', height: 1, content: ' Запуск парсинга ', style: { bg: 'blue', fg: 'white', bold: true } });
const runBox = blessed.box({ parent: screen, top: 3, left: 'center', width: 'shrink', height: 'shrink', tags: true, style: { bg: 'black', fg: 'white' } });
const detailBox = blessed.box({ parent: screen, top: 'center', left: 'center', width: 62, height: 24, border: { type: 'line' }, padding: { top: 1, left: 1, right: 1, bottom: 1 }, scrollable: true, alwaysScroll: true, keys: true, vi: true, mouse: true, tags: true, style: { border: { fg: 'blue' }, bg: 'black', fg: 'white' }, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } } });
const statusbar = blessed.box({ parent: screen, bottom: 0, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white' } });
[casesHeader, casesList, logsBox, runBox, runTitle, detailBox].forEach(el => el.hide());

export function buildHeaderLine(): string {
  return pad('№ дела', COL.num) + sep() + pad('Тип', COL.type) + sep() + pad('Суд', COL.court) + sep() + pad('Судья', COL.judge) + sep() + pad('Соб.', COL.evt) + sep() + pad('Посл.', COL.date);
}
export function formatCaseItem(c: Case, directory: Record<string, CourtInfo> = courts): string {
  const court = directory[c.court]?.shortName || directory[c.court]?.name || c.court;
  return pad(clip(c.number || '—', COL.num - 1), COL.num) + sep() + pad(typeLabel(c.courtType), COL.type) + sep() + pad(clip(court, COL.court - 1), COL.court) + sep() + pad(clip(c.card?.judge || '—', COL.judge - 1), COL.judge) + sep() + pad(String(c.events?.length ?? 0), COL.evt) + sep() + pad(isoDate(c.events?.at(-1)?.eventDate ?? c.card?.hearingDate), COL.date);
}
function filteredCases(): Case[] {
  return cases.filter(c => {
    if (courtFilter && c.courtType !== courtFilter) return false;
    if (!searchQuery) return true;
    const court = courts[c.court]?.shortName || courts[c.court]?.name || c.court;
    return [c.number, c.card?.judge, c.court, court].join(' ').toLowerCase().includes(searchQuery.toLowerCase());
  });
}
function updateStatusBar(): void {
  const run = fullRunning ? ' {yellow-fg}⏳ Парсинг{/yellow-fg}' : retryRunning ? ' {yellow-fg}⏳ Retry{/yellow-fg}' : '';
  const connection = serverUp ? ` {green-fg}●{/green-fg} ${apiUrl}` : ` {red-fg}● Сервер недоступен{/red-fg} {grey-fg}${apiUrl}{/grey-fg}`;
  const hints: Record<Tab, string> = { cases: '↑↓ Выбор  Enter Детали  / Поиск  F Фильтр  R Обновить  1|2|3 Вкладки  Q Выход', logs: `↑↓ Скролл  D Дней:${logDays}  R Обновить  1|2|3 Вкладки  Q Выход`, run: 'F Основной  R Retry  E Суды  D Данные  1|2|3 Вкладки  Q Выход' };
  statusbar.setContent(` ${filteredCases().length} дел${run}    ${connection}    ${hints[tab]}`);
}
function renderCases(): void {
  const list = filteredCases();
  casesHeader.setContent(buildHeaderLine());
  casesList.setItems(list.map(c => formatCaseItem(c)));
  const selected = Math.min(selectedCaseIdx, Math.max(0, list.length - 1));
  if (list.length) casesList.select(selected);
  selectedCaseIdx = selected;
  updateStatusBar();
}
function renderLogs(): void {
  logsBox.setContent(!logs.length ? '  {grey-fg}Нет записей{/grey-fg}' : [...logs].reverse().map(e => {
    const ts = (e.timestamp || '').slice(0, 19).replace('T', ' ');
    return e.success ? ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  ${esc(e.uid || '')}  {green-fg}✓{/green-fg} {grey-fg}${e.duration}ms{/grey-fg}` : ` ${ts}  {bold}${clip(e.courtId, 30)}{/bold}  {red-fg}✕ {bold}${esc(e.error || '')}{/bold}{/red-fg}`;
  }).join('\n'));
  updateStatusBar();
}
function renderRun(): void {
  runBox.setContent([`  {blue-fg}{bold}▶  Основной прогон{/bold}{/blue-fg}`, '     Все URL из watch/ — независимо от даты последнего обновления.', '', `     Состояние: ${fullRunning ? '{yellow-fg}⏳ В процессе{/yellow-fg}' : '{grey-fg}⏸ Ожидание{/grey-fg}'}`, '', '', `  {yellow-fg}{bold}🔄  Retry-прогон{/bold}{/yellow-fg}`, `     Только URL, не обновлявшиеся дольше ${staleThresholdH} часов.`, '', `     Состояние: ${retryRunning ? '{yellow-fg}⏳ В процессе{/yellow-fg}' : '{grey-fg}⏸ Ожидание{/grey-fg}'}`, '', '', '  {grey-fg}📦  Инструменты:{/grey-fg}', '     {bold}E{/bold}  Справочник судов  |  {bold}D{/bold}  Обновить данные', '', '  {cyan-fg}⏎ Enter — запустить выбранное действие{/cyan-fg}'].join('\n'));
  updateStatusBar();
}
function renderCurrent(): void { if (destroyed) return; if (tab === 'cases') renderCases(); else if (tab === 'logs') renderLogs(); else renderRun(); }
async function loadCases(): Promise<void> { try { const [cs, co] = await Promise.all([api.cases(), api.courts()]); if (destroyed) return; cases = cs; courts = co; serverUp = true; } catch { serverUp = false; } renderCurrent(); }
async function loadLogs(): Promise<void> { try { logs = await api.logs(logDays); serverUp = true; } catch { serverUp = false; } if (!destroyed && tab === 'logs') renderLogs(); }
async function pollRunStatus(): Promise<void> { try { const s = await api.runStatus(); fullRunning = s.full.running; retryRunning = s.retry.running; serverUp = true; } catch { serverUp = false; } if (!destroyed) updateStatusBar(); }
async function autoRefresh(): Promise<void> { if (destroyed) return; if (refreshing || detailBox.visible || searchActive) { if (!destroyed) refreshTimer = setTimeout(autoRefresh, 5000); return; } refreshing = true; try { await Promise.all([loadCases(), pollRunStatus()]); } finally { refreshing = false; if (!destroyed) refreshTimer = setTimeout(autoRefresh, 5000); } }
function showTab(next: Tab): void { tab = next; [casesHeader, casesList, logsBox, runBox, runTitle].forEach(el => el.hide()); if (next === 'cases') { casesHeader.show(); casesList.show(); renderCases(); casesList.focus(); } else if (next === 'logs') { logsBox.show(); void loadLogs(); logsBox.focus(); } else { runTitle.show(); runBox.show(); void pollRunStatus(); renderRun(); runBox.focus(); } screen.render(); }
function showDetail(idx: number): void { const c = filteredCases()[idx]; if (!c) return; casesHeader.hide(); casesList.hide(); const court = courts[c.court] || {}; const parties = (c.parties || []).map(p => `  ${esc(p.role || '—')}  —  ${esc(p.name || '—')}`).join('\n'); const events = (c.events || []).slice(-20).map(e => `  ${isoDate(e.eventDate)}  ${esc(e.eventName || '')}  ${esc(e.result || '')}`).join('\n'); detailBox.setContent([`{cyan-fg}{bold}№ ${esc(c.number || '—')}{/bold}{/cyan-fg}`, '', `{bold}Тип:{/bold}       ${typeLabel(c.courtType)}`, `{bold}Суд:{/bold}       ${esc(court.name || c.court)}`, `{bold}Поддомен:{/bold}  ${esc(c.court)}`, `{bold}Судья:{/bold}     ${esc(c.card?.judge || '—')}`, `{bold}Поступление:{/bold} ${isoDate(c.card?.filingDate)}`, `{bold}Результат:{/bold}   ${esc(c.card?.result || '—')}`, `{bold}Адрес:{/bold}     ${esc(court.address || '—')}`, `{bold}Телефоны:{/bold}  ${(court.phones || []).join(', ') || '—'}`, `{bold}Участники:{/bold}  (${c.parties?.length || 0})`, parties || '  {grey-fg}нет{/grey-fg}', '', `{bold}События:{/bold}  (${c.events?.length || 0})`, events || '  {grey-fg}нет{/grey-fg}', '', `  {grey-fg}UID: ${esc(c.uid)}{/grey-fg}`].join('\n')); detailBox.setScroll(0); detailBox.show(); detailBox.focus(); screen.render(); }
function hideDetail(): void { detailBox.hide(); showTab(tab); }
async function startRun(mode: 'full' | 'retry'): Promise<void> { try { const result = mode === 'full' ? await api.startRun() : await api.startRetry(); statusbar.setContent(result.started ? ` {yellow-fg}⏳ ${mode === 'full' ? 'Основной' : 'Retry'} прогон запущен (PID ${result.pid}){/yellow-fg}` : ` {red-fg}✕ ${esc(result.error || 'Не удалось запустить прогон')}{/red-fg}`); screen.render(); if (!destroyed) setTimeout(() => { void pollRunStatus(); }, 2000); } catch { statusbar.setContent(' {red-fg}✕ Ошибка запуска{/red-fg}'); screen.render(); } }
async function enrichCourts(): Promise<void> { try { const result = await api.enrichCourts(); statusbar.setContent(result.started ? ' {green-fg}✓ Обновление справочника запущено{/green-fg}' : ` {red-fg}✕ ${esc(result.error || 'Не удалось запустить обновление')}{/red-fg}`); } catch (err) { statusbar.setContent(` {red-fg}✕ ${esc(err instanceof Error ? err.message : 'Ошибка')}{/red-fg}`); } screen.render(); }
async function loadCourtsConfig(): Promise<void> { try { const cfg = await api.config(); if (typeof cfg.staleThresholdH === 'number') staleThresholdH = cfg.staleThresholdH; } catch { /* config is optional for TUI */ } }

screen.key(['q', 'C-c'], () => { if (detailBox.visible) { hideDetail(); return; } destroyed = true; if (refreshTimer) clearTimeout(refreshTimer); screen.program.showCursor(); screen.destroy(); process.exit(0); });
screen.key(['escape'], () => { if (detailBox.visible) { hideDetail(); return; } if (searchQuery) { searchQuery = ''; renderCases(); screen.render(); } else if (courtFilter) { courtFilter = ''; renderCases(); screen.render(); } });
screen.key(['tab'], () => { if (!detailBox.visible) showTab(({ cases: 'logs', logs: 'run', run: 'cases' } as Record<Tab, Tab>)[tab]); });
screen.key(['1'], () => { if (!detailBox.visible) showTab('cases'); }); screen.key(['2'], () => { if (!detailBox.visible) showTab('logs'); }); screen.key(['3'], () => { if (!detailBox.visible) showTab('run'); });
screen.key(['r'], () => { if (detailBox.visible) return; if (tab === 'cases') void loadCases(); else if (tab === 'logs') void loadLogs(); else { void pollRunStatus(); renderRun(); screen.render(); } });
screen.key(['f'], () => { if (detailBox.visible) return; if (tab === 'run') { void startRun('full'); return; } if (tab === 'cases') { const types: (CourtType | '')[] = ['', 'district', 'appeal', 'cassation', 'magistrate']; courtFilter = types[(types.indexOf(courtFilter) + 1) % types.length]; renderCases(); screen.render(); } });
screen.key(['/'], () => { if (detailBox.visible || tab !== 'cases') return; searchActive = true; const prompt = blessed.textbox({ parent: screen, bottom: 1, left: 1, width: 30, height: 1, inputOnFocus: true, style: { bg: 'yellow', fg: 'black' } }); prompt.setValue(searchQuery); prompt.readInput((_err, value) => { searchQuery = (value || '').trim(); searchActive = false; prompt.destroy(); renderCases(); casesList.focus(); screen.render(); }); prompt.focus(); screen.render(); });
screen.key(['d'], () => { if (detailBox.visible) return; if (tab === 'logs') { logDays = logDays === 1 ? 7 : logDays === 7 ? 30 : 1; void loadLogs(); } else if (tab === 'run') { void loadCases(); void loadCourtsConfig(); void pollRunStatus(); renderRun(); screen.render(); } });
screen.key(['e'], () => { if (!detailBox.visible && tab === 'run') void enrichCourts(); });
detailBox.key('enter', hideDetail);
casesList.on('select item', (_item: unknown, idx: number) => { if (tab === 'cases') selectedCaseIdx = idx; });
casesList.on('select', (_item: unknown, idx: number) => { if (tab === 'cases') showDetail(idx); });
screen.on('resize', () => { if (!destroyed) screen.render(); });

async function init(): Promise<void> { apiUrl = parseApiUrl(process.argv); api = new ApiClient(apiUrl); header.setContent(` CourtFlow — Мониторинг дел  |  API: ${apiUrl}`); process.stdout.write('\\x1b[?25l'); process.on('exit', () => process.stdout.write('\\x1b[?25h')); await Promise.all([loadCases(), loadCourtsConfig()]); if (destroyed) return; showTab('cases'); refreshTimer = setTimeout(autoRefresh, 5000); }
if (!process.env.VITEST) init().catch(err => { screen.program.showCursor(); screen.destroy(); console.error('TUI: ошибка инициализации:', err.message); process.exit(1); });
