import * as db from './db.js';
import { money, today, byCategory, dateRange, inRange, previousRange, monthlySeries, balanceEvolution, fundsAt } from './calculations.js';

const app = document.querySelector('#app');
const COLORS = ['#7c5cff','#ff655f','#2698ff','#f3a529','#26c98b','#dc55a0','#5bc0d6'];
let preset = '1';
let customRange = { start: '', end: '' };
let enhancing = false;
let scheduled = false;

function pageTitle(page) {
  return page?.querySelector('.pagehead h2,.analysis-header h2')?.textContent.trim();
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceAnalysis();
  });
}

async function enhanceAnalysis() {
  if (!app || enhancing) return;
  const page = app.querySelector('.page');
  if (!page || pageTitle(page) !== 'Análisis' || page.dataset.analysisV2 === 'ready') return;

  enhancing = true;
  try {
    const [funds, transactions] = await Promise.all([db.all('funds'), db.all('transactions')]);
    const visible = app.querySelector('.page');
    if (!visible || pageTitle(visible) !== 'Análisis') return;
    visible.outerHTML = renderAnalysis(funds, transactions);
    bindAnalysis();
  } catch (error) {
    console.error('No se pudo construir el análisis visual.', error);
  } finally {
    enhancing = false;
  }
}

function renderAnalysis(funds, transactions) {
  const range = currentRange();
  const previous = previousRange(range);
  const filtered = inRange(transactions, range);
  const previousFiltered = inRange(transactions, previous);
  const income = totalByType(filtered, 'income');
  const expense = totalByType(filtered, 'expense');
  const balance = income - expense;
  const previousIncome = totalByType(previousFiltered, 'income');
  const previousExpense = totalByType(previousFiltered, 'expense');
  const categories = byCategory(filtered);
  const months = monthlySeries(transactions, range);
  const evolution = balanceEvolution(funds, transactions, range);
  const fundState = fundsAt(funds, transactions, range.end);
  const days = Math.max(1, dayNumber(range.end) - dayNumber(range.start) + 1);
  const savingRate = income > 0 ? balance / income * 100 : 0;
  const expenseChange = percentChange(expense, previousExpense);
  const incomeChange = percentChange(income, previousIncome);
  const highestExpense = Math.max(0, ...filtered.filter(item => item.type === 'expense').map(item => Number(item.amount) || 0));
  const weekly = weekBuckets(filtered, range);
  const topCategory = categories[0];

  return `<section class="page analysis-v2" data-analysis-v2="ready">
    <header class="analysis-header">
      <div>
        <h2>Análisis</h2>
        <p>Descubre cómo se mueve tu dinero y compáralo con el período anterior.</p>
      </div>
      <span class="analysis-period">▣ ${formatDate(range.start)} – ${formatDate(range.end)}</span>
    </header>

    <article class="analysis-filter-card">
      <div class="analysis-filter-main">
        <label for="analysisRange">Período</label>
        <select id="analysisRange">
          ${rangeOption('1','Mes actual')}
          ${rangeOption('prev','Mes anterior')}
          ${rangeOption('3','Últimos 3 meses')}
          ${rangeOption('6','Últimos 6 meses')}
          ${rangeOption('custom','Personalizado')}
        </select>
      </div>
      <div class="analysis-filter-date"><label for="analysisStart">Desde</label><input id="analysisStart" type="date" value="${range.start}" ${preset === 'custom' ? '' : 'disabled'}></div>
      <div class="analysis-filter-date"><label for="analysisEnd">Hasta</label><input id="analysisEnd" type="date" value="${range.end}" ${preset === 'custom' ? '' : 'disabled'}></div>
      <button type="button" class="btn secondary analysis-moves-button" data-go="moves">Ver movimientos</button>
    </article>

    <div class="analysis-kpis">
      ${kpi('income','↗','Ingresos',income,comparisonText(incomeChange,'frente al período anterior'))}
      ${kpi('expense','↘','Gastos',expense,comparisonText(expenseChange,'frente al período anterior'), expenseChange > 0)}
      ${kpi('balance','＝','Balance',balance,balance >= 0 ? 'Resultado positivo del período' : 'Gastaste más de lo que ingresó', balance < 0)}
      ${kpi('saving','◇','Tasa de ahorro',savingRate,'Porcentaje de ingresos conservado', savingRate < 0, true)}
      ${kpi('average','▤','Promedio diario',expense / days,`${days} días analizados`)}
    </div>

    <div class="analysis-panels">
      <article class="analysis-panel cashflow-panel">
        ${panelHeader('Flujo de caja','Ingresos y gastos por mes')}
        ${cashflowChart(months)}
      </article>

      <article class="analysis-panel category-analysis-panel">
        ${panelHeader('Gastos por categoría','Distribución del período')}
        ${categoryChart(categories, expense)}
      </article>

      <article class="analysis-panel balance-analysis-panel">
        ${panelHeader('Evolución del saldo','Cambios dentro del período')}
        ${balanceChart(evolution)}
      </article>

      <article class="analysis-panel funds-analysis-panel">
        ${panelHeader('Distribución del dinero',`Estado al ${formatDate(range.end)}`)}
        ${fundDistribution(fundState)}
      </article>

      <article class="analysis-panel weekly-analysis-panel">
        ${panelHeader('Gasto semanal','Últimas semanas del período')}
        ${weeklyChart(weekly)}
      </article>

      <article class="analysis-panel insight-panel">
        ${panelHeader('Lectura rápida','Datos que merecen atención')}
        <div class="analysis-insights">
          ${insight('⌁','Categoría principal',topCategory ? `${escapeHtml(topCategory[0])} · ${money(topCategory[1])}` : 'Sin gastos registrados')}
          ${insight('↑','Gasto más alto',highestExpense ? money(highestExpense) : 'Sin gastos registrados')}
          ${insight(expenseChange <= 0 ? '✓' : '!','Comparación de gastos',comparisonSentence(expenseChange, expense, previousExpense))}
          ${insight(balance >= 0 ? '◇' : '↘','Resultado del período',balance >= 0 ? `Conservaste ${money(balance)} después de gastos.` : `El balance quedó en ${money(balance)}.`)}
        </div>
      </article>
    </div>
  </section>`;
}

function bindAnalysis() {
  const root = app.querySelector('.analysis-v2');
  if (!root) return;
  root.querySelector('#analysisRange')?.addEventListener('change', event => {
    preset = event.target.value;
    if (preset === 'custom') {
      const range = dateRange('1', today());
      customRange = { start: customRange.start || range.start, end: customRange.end || range.end };
    }
    refreshAnalysis(root);
  });
  root.querySelectorAll('#analysisStart,#analysisEnd').forEach(input => input.addEventListener('change', event => {
    const key = event.target.id === 'analysisStart' ? 'start' : 'end';
    customRange[key] = event.target.value;
    if (customRange.start && customRange.end && customRange.start > customRange.end) {
      alert('La fecha inicial debe ser anterior a la fecha final.');
      return;
    }
    refreshAnalysis(root);
  }));
}

function refreshAnalysis(root) {
  root.removeAttribute('data-analysis-v2');
  scheduleEnhancement();
}

function currentRange() {
  const mapped = preset === 'prev' ? 'previous' : preset;
  return dateRange(mapped, today(), customRange);
}

function kpi(tone, icon, label, value, note, danger = false, percent = false) {
  const output = percent ? `${Number(value).toFixed(1)}%` : money(value);
  return `<article class="analysis-kpi tone-${tone} ${danger ? 'is-danger' : ''}"><span class="analysis-kpi-icon">${icon}</span><div><small>${label}</small><strong>${output}</strong><p>${note}</p></div></article>`;
}

function panelHeader(title, subtitle) {
  return `<header class="analysis-panel-heading"><div><h3>${title}</h3><p>${subtitle}</p></div></header>`;
}

function cashflowChart(months) {
  if (!months.length || !months.some(item => item.income || item.expense)) return empty('Aún no hay movimientos para este período.');
  const width = 720, height = 260, left = 42, bottom = 34, top = 18;
  const max = Math.max(1, ...months.flatMap(item => [item.income,item.expense]));
  const group = (width - left - 12) / months.length;
  const barWidth = Math.min(28, group * .28);
  const rects = months.map((item,index) => {
    const center = left + group * index + group / 2;
    const incomeHeight = item.income / max * (height - top - bottom);
    const expenseHeight = item.expense / max * (height - top - bottom);
    return `<rect class="cashflow-income" x="${center-barWidth-2}" y="${height-bottom-incomeHeight}" width="${barWidth}" height="${incomeHeight}" rx="5"></rect><rect class="cashflow-expense" x="${center+2}" y="${height-bottom-expenseHeight}" width="${barWidth}" height="${expenseHeight}" rx="5"></rect><text x="${center}" y="${height-10}" text-anchor="middle">${monthLabel(item.month)}</text>`;
  }).join('');
  return `<div class="analysis-chart-wrap"><svg class="cashflow-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos y gastos por mes"><line x1="${left}" y1="${height-bottom}" x2="${width}" y2="${height-bottom}"></line><line x1="${left}" y1="${top+(height-top-bottom)/2}" x2="${width}" y2="${top+(height-top-bottom)/2}"></line>${rects}</svg></div><div class="analysis-legend"><span><i class="legend-income"></i>Ingresos</span><span><i class="legend-expense"></i>Gastos</span></div>`;
}

function categoryChart(categories, total) {
  if (!categories.length || total <= 0) return empty('Las categorías aparecerán cuando registres gastos.');
  const visible = categories.slice(0,6);
  const shownTotal = visible.reduce((sum,item) => sum + item[1],0);
  let offset = 0;
  const segments = visible.map(([,value],index) => {
    const start = offset;
    offset += value / shownTotal * 100;
    return `${COLORS[index % COLORS.length]} ${start.toFixed(2)}% ${offset.toFixed(2)}%`;
  }).join(',');
  const rows = visible.map(([name,value],index) => `<div class="analysis-category-row"><i style="background:${COLORS[index % COLORS.length]}"></i><span>${escapeHtml(name)}</span><b>${Math.round(value/total*100)}%</b><strong>${money(value)}</strong></div>`).join('');
  return `<div class="analysis-category-content"><div class="analysis-donut" style="--segments:${segments}"><div><strong>${money(total)}</strong><span>Total gastado</span></div></div><div class="analysis-category-list">${rows}</div></div>`;
}

function balanceChart(evolution) {
  if (!evolution.length) return empty('Aún no hay cambios de saldo en este período.');
  const width = 680, height = 235, padding = 14;
  const values = evolution.map(item => Number(item.balance) || 0);
  const min = Math.min(0,...values), max = Math.max(1,...values), span = Math.max(1,max-min);
  const points = values.map((value,index) => {
    const x = values.length === 1 ? width/2 : padding + index/(values.length-1)*(width-padding*2);
    const y = height-padding-(value-min)/span*(height-padding*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<div class="analysis-chart-wrap"><svg class="balance-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución del saldo"><line x1="0" y1="25%" x2="100%" y2="25%"></line><line x1="0" y1="50%" x2="100%" y2="50%"></line><line x1="0" y1="75%" x2="100%" y2="75%"></line><polygon points="${padding},${height} ${points.join(' ')} ${width-padding},${height}"></polygon><polyline points="${points.join(' ')}"></polyline></svg></div><div class="analysis-chart-footer"><span>Inicio: ${formatDate(evolution[0].date)}</span><strong>${money(values.at(-1))}</strong><span>Fin: ${formatDate(evolution.at(-1).date)}</span></div>`;
}

function fundDistribution(state) {
  const total = Math.max(0, Number(state.total) || 0);
  const available = Math.max(0, Number(state.available) || 0);
  const protectedMoney = Math.max(0, Number(state.protectedMoney) || 0);
  const availablePercent = total ? available / total * 100 : 0;
  const protectedPercent = total ? protectedMoney / total * 100 : 0;
  return `<div class="fund-analysis-total"><span>Dinero total</span><strong>${money(total)}</strong></div><div class="fund-analysis-track"><i style="width:${clamp(availablePercent)}%"></i><b style="width:${clamp(protectedPercent)}%"></b></div><div class="fund-analysis-rows"><div><span><i class="fund-available-dot"></i>Disponible</span><b>${Math.round(availablePercent)}%</b><strong>${money(available)}</strong></div><div><span><i class="fund-protected-dot"></i>Protegido</span><b>${Math.round(protectedPercent)}%</b><strong>${money(protectedMoney)}</strong></div></div>`;
}

function weeklyChart(values) {
  if (!values.length || !values.some(item => item[1] > 0)) return empty('No hay gastos semanales en este período.');
  const max = Math.max(1,...values.map(item => item[1]));
  return `<div class="weekly-bars">${values.map(([label,value]) => `<div class="weekly-bar-row"><span>${label}</span><div><i style="width:${value/max*100}%"></i></div><strong>${money(value)}</strong></div>`).join('')}</div>`;
}

function insight(icon, title, text) {
  return `<div class="analysis-insight"><span>${icon}</span><div><strong>${title}</strong><p>${text}</p></div></div>`;
}

function empty(text) {
  return `<div class="analysis-empty"><span>◎</span><p>${text}</p></div>`;
}

function weekBuckets(transactions, range) {
  const start = dayNumber(range.start), end = dayNumber(range.end);
  const count = Math.max(1, Math.ceil((end-start+1)/7));
  const values = Array.from({length:count},(_,index) => [`Sem. ${index+1}`,0]);
  for (const item of transactions) {
    if (item.type !== 'expense') continue;
    const index = Math.min(count-1,Math.max(0,Math.floor((dayNumber(item.date)-start)/7)));
    values[index][1] += Number(item.amount) || 0;
  }
  return values.slice(-8);
}

function totalByType(transactions, type) {
  return transactions.filter(item => item.type === type).reduce((sum,item) => sum + (Number(item.amount) || 0),0);
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return (current-previous)/previous*100;
}

function comparisonText(value, suffix) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}% ${suffix}`;
}

function comparisonSentence(change, current, previous) {
  if (!current && !previous) return 'No hubo gastos en ninguno de los dos períodos.';
  if (!previous) return `Este período registró ${money(current)} y no existe una base anterior comparable.`;
  if (Math.abs(change) < .05) return 'El gasto se mantuvo prácticamente igual al período anterior.';
  return change > 0 ? `El gasto aumentó ${change.toFixed(1)}% frente al período anterior.` : `El gasto disminuyó ${Math.abs(change).toFixed(1)}% frente al período anterior.`;
}

function rangeOption(value, label) {
  return `<option value="${value}" ${preset === value ? 'selected' : ''}>${label}</option>`;
}

function monthLabel(value) {
  const [year,month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-PE',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1))).replace('.','');
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)).replace('.','');
}

function dayNumber(value) {
  const [year,month,day] = String(value).split('-').map(Number);
  return Math.floor(Date.UTC(year,month-1,day)/86400000);
}

function clamp(value) { return Math.max(0,Math.min(100,Number(value) || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  scheduleEnhancement();
}
