import * as db from './db.js';
import { balances, money, summary, today } from './calculations.js';

const app = document.querySelector('#app');
const COLORS = ['#7c5cff','#ff655f','#2698ff','#f3a529','#26c98b','#dc55a0','#5bc0d6'];
let enhancing = false;
let scheduled = false;

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceHome();
  });
}

async function enhanceHome() {
  if (!app || enhancing) return;
  const currentPage = app.querySelector('.page');
  const title = currentPage?.querySelector('.pagehead h2')?.textContent.trim();
  if (!currentPage || currentPage.dataset.dashboardV2 === 'ready' || !['Resumen','Tu resumen'].includes(title)) return;

  enhancing = true;
  try {
    const [funds, transactions, settings] = await Promise.all([
      db.all('funds'),
      db.all('transactions'),
      db.get('settings','main'),
    ]);

    const pageStillVisible = app.querySelector('.page');
    const currentTitle = pageStillVisible?.querySelector('.pagehead h2')?.textContent.trim();
    if (!pageStillVisible || !['Resumen','Tu resumen'].includes(currentTitle)) return;

    pageStillVisible.outerHTML = renderDashboard(funds, transactions, settings || {});
  } catch (error) {
    console.error('No se pudo construir el resumen visual.', error);
  } finally {
    enhancing = false;
  }
}

function renderDashboard(funds, transactions, settings) {
  const ordered = [...transactions].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.created || 0) - Number(a.created || 0));
  const totals = summary(funds, transactions);
  const month = today().slice(0,7);
  const monthTransactions = ordered.filter(transaction => transaction.date?.startsWith(month));
  const expenseTransactions = monthTransactions.filter(transaction => transaction.type === 'expense');
  const incomeTransactions = monthTransactions.filter(transaction => transaction.type === 'income');
  const categories = categorySummary(expenseTransactions);
  const dailyExpense = dailyValues(expenseTransactions);
  const dailyIncome = dailyValues(incomeTransactions);
  const cumulativeExpense = cumulative(dailyExpense);
  const cumulativeIncome = cumulative(dailyIncome);
  const cumulativeSaving = cumulativeIncome.map((value,index) => value - cumulativeExpense[index]);
  const balanceTrend = monthlyBalanceTrend(funds, transactions);
  const fundValues = funds.map(fund => Math.max(0,Number(totals.bal[fund.id]) || 0));
  const limit = Math.max(0,Number(settings.monthlyLimit) || 0);
  const limitPercent = limit ? totals.expense / limit * 100 : 0;
  const days = Math.max(1,dailyExpense.length);
  const highestExpense = Math.max(0,...dailyExpense);
  const fundNames = Object.fromEntries(funds.map(fund => [fund.id,fund.name]));

  const cards = [
    kpiCard('income','↗','Ingresos',totals.income,'Este mes',cumulativeIncome),
    kpiCard('expense','↘','Gastos',totals.expense,'Este mes',cumulativeExpense),
    kpiCard('saving','↗','Ahorro',totals.balance,'Ingresos menos gastos',cumulativeSaving),
    kpiCard('available','♢','Disponible real',totals.available,'Dinero que puedes usar',balanceTrend),
    kpiCard('protected','▣','Dinero protegido',totals.protectedMoney,'Fondos marcados como no tocar',fundValues),
    kpiCard('total','▤','Balance general',totals.total,'Total en todos tus fondos',balanceTrend),
  ].join('');

  return `<section class="page dashboard-v2" data-dashboard-v2="ready">
    <header class="summary-header">
      <div>
        <h2>Resumen</h2>
        <p>Aquí tienes una visión general de tus finanzas</p>
      </div>
      <span class="period-chip" aria-label="Período actual">▣ Este mes</span>
    </header>

    <div class="summary-kpis">${cards}</div>

    <div class="summary-panels">
      <article class="dashboard-panel category-panel">
        ${panelHeader('Gastos por categoría','Distribución de tus gastos','moves')}
        ${categoryDonut(categories,totals.expense)}
      </article>

      <article class="dashboard-panel evolution-panel">
        ${panelHeader('Evolución de gastos','Tendencia diaria del mes','analysis')}
        <div class="main-line-chart">${lineSvg(cumulativeExpense,'expense',640,230,true)}</div>
        <div class="chart-labels"><span>1 ${monthName()}</span><span>${Math.ceil(days/2)} ${monthName()}</span><span>${days} ${monthName()}</span></div>
        <div class="metric-strip">
          <div><small>Promedio diario</small><strong>${money(totals.expense/days)}</strong></div>
          <div><small>Gasto más alto</small><strong>${money(highestExpense)}</strong></div>
        </div>
      </article>

      <article class="dashboard-panel budget-panel">
        ${panelHeader('Presupuesto','Controla tu límite mensual','settings')}
        <div class="budget-overview">
          <div>
            <span>Límite mensual general</span>
            <strong>${money(totals.expense)} <small>de ${money(limit)}</small></strong>
          </div>
          <b class="${limitPercent>100?'danger-text':''}">${Math.round(limitPercent)}%</b>
        </div>
        <div class="budget-track"><i style="width:${clamp(limitPercent)}%"></i></div>
        <div class="budget-status ${limitPercent>=100?'is-over':limitPercent>=80?'is-warning':''}">${budgetMessage(limitPercent,limit)}</div>
        <div class="budget-categories">${budgetRows(categories,limit,totals.expense)}</div>
      </article>

      <article class="dashboard-panel movements-panel">
        ${panelHeader('Últimos movimientos','Tus transacciones más recientes','moves')}
        <div class="dashboard-movements">${movementRows(ordered.slice(0,5),fundNames)}</div>
      </article>
    </div>
  </section>`;
}

function kpiCard(tone,icon,label,value,caption,series) {
  return `<article class="summary-kpi tone-${tone}">
    <div class="kpi-icon" aria-hidden="true">${icon}</div>
    <div class="kpi-copy"><span>${label}</span><strong>${money(value)}</strong><small>${caption}</small></div>
    <div class="kpi-spark" aria-hidden="true">${lineSvg(series,tone,130,40,false)}</div>
  </article>`;
}

function panelHeader(title,subtitle,target) {
  return `<header class="panel-heading"><div><h3>${title}</h3><p>${subtitle}</p></div><button type="button" class="dashboard-link" data-go="${target}">Ver todos</button></header>`;
}

function categorySummary(transactions) {
  const values = new Map();
  for (const transaction of transactions) {
    const name = transaction.category?.trim() || 'Sin categoría';
    values.set(name,(values.get(name) || 0) + Number(transaction.amount || 0));
  }
  const ordered = [...values.entries()].sort((a,b) => b[1] - a[1]);
  if (ordered.length <= 6) return ordered;
  const visible = ordered.slice(0,5);
  visible.push(['Otros',ordered.slice(5).reduce((total,item) => total + item[1],0)]);
  return visible;
}

function categoryDonut(categories,total) {
  if (!categories.length || total <= 0) return `<div class="dashboard-empty">Aún no registraste gastos este mes.</div>`;
  let offset = 0;
  const segments = categories.map(([name,value],index) => {
    const start = offset;
    offset += value / total * 100;
    return `${COLORS[index%COLORS.length]} ${start.toFixed(2)}% ${offset.toFixed(2)}%`;
  }).join(',');
  const legend = categories.map(([name,value],index) => `<div class="category-legend-row"><i style="background:${COLORS[index%COLORS.length]}"></i><span>${escapeHtml(name)}</span><b>${Math.round(value/total*100)}%</b><strong>${money(value)}</strong></div>`).join('');
  return `<div class="category-content"><div class="donut" style="--segments:${segments}" role="img" aria-label="Gastos por categoría"><div><strong>${money(total)}</strong><span>Total</span></div></div><div class="category-legend">${legend}</div></div>`;
}

function budgetRows(categories,limit,totalExpense) {
  if (!categories.length) return `<div class="dashboard-empty compact">Las categorías aparecerán cuando registres gastos.</div>`;
  return categories.slice(0,4).map(([name,value],index) => {
    const percent = limit > 0 ? value/limit*100 : totalExpense > 0 ? value/totalExpense*100 : 0;
    return `<div class="budget-row"><div class="budget-row-head"><span><i style="background:${COLORS[index%COLORS.length]}"></i>${escapeHtml(name)}</span><b>${Math.round(percent)}%</b></div><div class="category-track"><i style="width:${clamp(percent)}%;background:${COLORS[index%COLORS.length]}"></i></div><small>${money(value)} del límite mensual</small></div>`;
  }).join('');
}

function movementRows(transactions,fundNames) {
  if (!transactions.length) return `<div class="dashboard-empty">Aún no registraste movimientos.</div>`;
  return transactions.map(transaction => {
    const kind = {income:'Ingreso',expense:'Gasto',transfer:'Transferencia'}[transaction.type] || 'Movimiento';
    const icon = transaction.type === 'income' ? '↓' : transaction.type === 'expense' ? '↑' : '↔';
    const detail = transaction.type === 'transfer'
      ? `${escapeHtml(fundNames[transaction.from] || 'Fondo')} → ${escapeHtml(fundNames[transaction.to] || 'Fondo')}`
      : escapeHtml(transaction.category || kind);
    const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
    return `<div class="dashboard-movement movement-${transaction.type}"><span class="movement-symbol" aria-hidden="true">${icon}</span><div><strong>${escapeHtml(transaction.description || kind)}</strong><small>${detail}</small></div><time>${formatDate(transaction.date)}</time><b>${sign}${money(transaction.amount)}</b><button type="button" data-detail="${Number(transaction.id)}" aria-label="Ver detalle de ${escapeHtml(transaction.description || kind)}">Ver</button></div>`;
  }).join('');
}

function dailyValues(transactions) {
  const current = today();
  const count = Number(current.slice(8));
  const values = Array.from({length:Math.max(1,count)},() => 0);
  for (const transaction of transactions) {
    const day = Number(transaction.date?.slice(8));
    if (day >= 1 && day <= values.length) values[day-1] += Number(transaction.amount || 0);
  }
  return values;
}

function monthlyBalanceTrend(funds,transactions) {
  const current = today();
  const month = current.slice(0,7);
  const monthStart = `${month}-01`;
  const before = transactions.filter(transaction => transaction.date < monthStart);
  const start = Object.values(balances(funds,before)).reduce((total,value) => total + Number(value || 0),0);
  const income = dailyValues(transactions.filter(transaction => transaction.type === 'income' && transaction.date?.startsWith(month)));
  const expense = dailyValues(transactions.filter(transaction => transaction.type === 'expense' && transaction.date?.startsWith(month)));
  let running = start;
  return income.map((value,index) => running += value - expense[index]);
}

function cumulative(values) {
  let total = 0;
  return values.map(value => total += Number(value || 0));
}

function lineSvg(values,tone,width,height,filled) {
  const clean = values?.length ? values.map(value => Number(value) || 0) : [0,0];
  const min = Math.min(0,...clean);
  const max = Math.max(1,...clean);
  const span = Math.max(1,max-min);
  const points = clean.map((value,index) => {
    const x = clean.length === 1 ? width/2 : index/(clean.length-1)*width;
    const y = height-4-(value-min)/span*(height-10);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = filled ? `<polygon class="line-area" points="0,${height} ${points.join(' ')} ${width},${height}"></polygon>` : '';
  return `<svg class="trend-svg trend-${tone}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" focusable="false" aria-hidden="true">${filled?'<line x1="0" y1="25%" x2="100%" y2="25%"></line><line x1="0" y1="50%" x2="100%" y2="50%"></line><line x1="0" y1="75%" x2="100%" y2="75%"></line>':''}${area}<polyline points="${points.join(' ')}"></polyline></svg>`;
}

function budgetMessage(percent,limit) {
  if (!limit) return 'Configura un límite mensual para medir tu avance.';
  if (percent >= 100) return 'Superaste el límite mensual. Revisa tus gastos recientes.';
  if (percent >= 80) return 'Estás cerca de alcanzar el límite mensual.';
  return `Te queda ${money(Math.max(0,limit-limit*percent/100))} disponible dentro del límite.`;
}

function monthName() {
  return new Intl.DateTimeFormat('es-PE',{month:'short',timeZone:'UTC'}).format(new Date(`${today().slice(0,7)}-01T00:00:00Z`)).replace('.','');
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)).replace('.','');
}

function clamp(value) { return Math.max(0,Math.min(100,Number(value) || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  scheduleEnhancement();
}
