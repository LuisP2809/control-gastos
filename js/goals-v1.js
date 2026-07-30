import * as db from './db.js';
import { isGoalFund, money, summary, today } from './calculations.js';

const app = document.querySelector('#app');
const navigation = document.querySelector('.bottom');
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modalBody');
const GOAL_KIND = 'savings-goal';
let rendering = false;
let patchScheduled = false;

function createId(prefix='goal') {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

async function loadData() {
  const [budgets, funds, transactions] = await Promise.all([
    db.all('budgets'),
    db.all('funds'),
    db.all('transactions'),
  ]);
  const goals = budgets.filter(item => item.kind === GOAL_KIND);
  return { goals, funds, transactions, totals: summary(funds, transactions) };
}

function setActiveNavigation(pageName) {
  navigation?.querySelectorAll('button[data-page]').forEach(button => {
    const active = button.dataset.page === pageName;
    button.classList.toggle('active', active);
    button.toggleAttribute('aria-current', active);
    if (active) button.setAttribute('aria-current','page');
  });
}

async function openGoalsPage() {
  if (!app || rendering) return;
  rendering = true;
  setActiveNavigation('goals');
  try {
    const data = await loadData();
    app.innerHTML = renderGoals(data);
    bindGoalsPage(data);
    app.focus();
  } catch (error) {
    console.error('No se pudieron cargar las metas de ahorro.', error);
    app.innerHTML = `<section class="page goals-v1"><header class="goals-header"><div><h2>Metas de ahorro</h2><p>No se pudo cargar esta sección.</p></div></header><article class="goals-empty"><span>!</span><h3>Ocurrió un problema</h3><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><button type="button" class="btn" data-goals-retry>Reintentar</button></article></section>`;
    app.querySelector('[data-goals-retry]')?.addEventListener('click', openGoalsPage);
  } finally {
    rendering = false;
  }
}

function renderGoals({ goals, funds, transactions, totals }) {
  const ordered = [...goals].sort((a,b) => statusOrder(a)-statusOrder(b) || Number(b.created||0)-Number(a.created||0));
  const active = ordered.filter(goal => goal.status !== 'completed');
  const activeTarget = active.reduce((sum,goal) => sum + Number(goal.targetAmount||0),0);
  const activeSaved = active.reduce((sum,goal) => sum + goalBalance(goal, totals.bal),0);
  const remaining = active.reduce((sum,goal) => sum + Math.max(0,Number(goal.targetAmount||0)-goalBalance(goal,totals.bal)),0);
  const recommended = active.reduce((sum,goal) => sum + monthlyRecommendation(goal,goalBalance(goal,totals.bal)),0);
  const cards = ordered.map(goal => goalCard(goal, funds, transactions, totals.bal)).join('');

  return `<section class="page goals-v1" data-goals-v1="ready">
    <header class="goals-header">
      <div><h2>Metas de ahorro</h2><p>Separa dinero para tus objetivos sin confundirlo con lo que puedes gastar.</p></div>
      <button type="button" class="btn goals-new" data-new-goal>＋ Nueva meta</button>
    </header>

    <article class="allocation-hero">
      <div class="allocation-hero-copy"><span class="eyebrow">Tu dinero distribuido</span><h3>${money(totals.total)}</h3><p>El total no cambia al aportar: solo cambia cuánto queda realmente disponible.</p></div>
      <div class="allocation-values">
        ${allocationValue('available','✓','Disponible para gastar',totals.available)}
        ${allocationValue('goals','◇','Destinado a metas',totals.goalMoney)}
        ${allocationValue('protected','▣','Dinero protegido',totals.protectedMoney)}
      </div>
      ${allocationTrack(totals)}
      <div class="allocation-formula"><strong>Disponible real</strong><span>${money(totals.total)} − ${money(totals.goalMoney)} − ${money(totals.protectedMoney)}</span><b>= ${money(totals.available)}</b></div>
    </article>

    <div class="goal-stat-grid">
      ${goalStat('◎','Metas activas',active.length,'Objetivos en curso')}
      ${goalStat('◇','Ahorrado en metas',totals.goalMoney,'Dinero separado','goals')}
      ${goalStat('⌁','Falta por ahorrar',remaining,activeTarget ? `${Math.round(activeSaved/activeTarget*100)}% del objetivo activo` : 'Crea tu primera meta','remaining')}
      ${goalStat('↗','Aporte recomendado',recommended,'Estimado para este mes','recommended')}
    </div>

    <div class="goals-section-heading"><div><span class="eyebrow">Plan personal</span><h3>Tus objetivos</h3></div><p>${ordered.length ? 'Aporta desde cualquier fondo disponible.' : 'Empieza definiendo para qué quieres ahorrar.'}</p></div>
    ${cards ? `<div class="goal-card-grid">${cards}</div>` : emptyGoals()}
  </section>`;
}

function allocationValue(tone, icon, label, value) {
  return `<div class="allocation-value tone-${tone}"><span>${icon}</span><div><small>${label}</small><strong>${money(value)}</strong></div></div>`;
}

function allocationTrack(totals) {
  const denominator = Math.max(0,Number(totals.total)||0);
  const available = denominator ? Math.max(0,Number(totals.available)||0)/denominator*100 : 0;
  const goals = denominator ? Math.max(0,Number(totals.goalMoney)||0)/denominator*100 : 0;
  const protectedPercent = denominator ? Math.max(0,Number(totals.protectedMoney)||0)/denominator*100 : 0;
  return `<div class="allocation-track" role="img" aria-label="Distribución entre disponible, metas y protegido"><i style="width:${clamp(available)}%"></i><b style="width:${clamp(goals)}%"></b><em style="width:${clamp(protectedPercent)}%"></em></div>`;
}

function goalStat(icon,label,value,caption,tone='') {
  const output = typeof value === 'number' && label !== 'Metas activas' ? money(value) : value;
  return `<article class="goal-stat ${tone ? `tone-${tone}` : ''}"><span>${icon}</span><div><small>${label}</small><strong>${output}</strong><p>${caption}</p></div></article>`;
}

function goalCard(goal, funds, transactions, balances) {
  const saved = goalBalance(goal,balances);
  const target = Math.max(0,Number(goal.targetAmount)||0);
  const progress = target > 0 ? saved/target*100 : 0;
  const reached = target > 0 && saved >= target;
  const completed = goal.status === 'completed';
  const remaining = Math.max(0,target-saved);
  const recommended = monthlyRecommendation(goal,saved);
  const related = transactions.filter(item => item.from === goal.fundId || item.to === goal.fundId).sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')) || Number(b.created||0)-Number(a.created||0));
  const fundExists = funds.some(fund => fund.id === goal.fundId);
  const status = completed ? 'Completada' : reached ? 'Objetivo alcanzado' : 'En progreso';
  const plan = goal.contributionMode === 'percent'
    ? `${Number(goal.contributionValue||0)}% de cada ingreso que decidas separar`
    : `${money(goal.contributionValue||0)} por aporte planificado`;

  return `<article class="goal-card ${completed ? 'is-completed' : reached ? 'is-reached' : ''}" data-goal-card="${escapeHtml(goal.id)}">
    <header class="goal-card-head"><span class="goal-icon">${escapeHtml(goal.icon||'🎯')}</span><div><span class="goal-status">${completed?'✓':reached?'★':'◇'} ${status}</span><h3>${escapeHtml(goal.name)}</h3><p>${goal.targetDate ? `Objetivo para ${formatDate(goal.targetDate)}` : 'Sin fecha límite'}</p></div></header>
    <div class="goal-money"><div><small>Ahorrado</small><strong>${money(saved)}</strong></div><div><small>Objetivo</small><strong>${money(target)}</strong></div></div>
    <div class="goal-progress-head"><span>Progreso</span><b>${Math.min(999,Math.max(0,progress)).toFixed(0)}%</b></div>
    <div class="goal-progress"><i style="width:${clamp(progress)}%"></i></div>
    <div class="goal-details">
      <div><small>Falta</small><strong>${money(remaining)}</strong></div>
      <div><small>Aporte recomendado</small><strong>${money(recommended)}</strong></div>
      <div><small>Plan</small><strong>${plan}</strong></div>
      <div><small>Último movimiento</small><strong>${related[0] ? formatDate(related[0].date) : 'Sin aportes'}</strong></div>
    </div>
    ${fundExists ? '' : '<p class="goal-warning">El fondo asociado no existe. Edita la meta para repararlo.</p>'}
    <footer class="goal-actions">
      ${completed ? `<button type="button" class="btn secondary" data-reopen-goal="${escapeHtml(goal.id)}">Reabrir</button>` : `<button type="button" class="btn" data-contribute-goal="${escapeHtml(goal.id)}">＋ Aportar</button>`}
      <button type="button" class="btn secondary" data-withdraw-goal="${escapeHtml(goal.id)}" ${saved<=0?'disabled':''}>Retirar</button>
      <button type="button" class="btn secondary" data-edit-goal="${escapeHtml(goal.id)}">Editar</button>
      ${!completed && reached ? `<button type="button" class="btn goal-complete" data-complete-goal="${escapeHtml(goal.id)}">✓ Completar</button>` : ''}
    </footer>
  </article>`;
}

function emptyGoals() {
  return `<article class="goals-empty"><span>🎯</span><h3>Aún no tienes metas</h3><p>Crea una meta para separar parte de tu dinero y conocer tu disponible real.</p><button type="button" class="btn" data-new-goal>Crear primera meta</button></article>`;
}

function bindGoalsPage(data) {
  const root = app.querySelector('.goals-v1');
  if (!root) return;
  root.addEventListener('click', async event => {
    const newButton = event.target.closest('[data-new-goal]');
    const editButton = event.target.closest('[data-edit-goal]');
    const contributionButton = event.target.closest('[data-contribute-goal]');
    const withdrawalButton = event.target.closest('[data-withdraw-goal]');
    const completeButton = event.target.closest('[data-complete-goal]');
    const reopenButton = event.target.closest('[data-reopen-goal]');
    if (newButton) return openGoalEditor();
    if (editButton) return openGoalEditor(data.goals.find(goal => goal.id === editButton.dataset.editGoal));
    if (contributionButton) return openContribution(data.goals.find(goal => goal.id === contributionButton.dataset.contributeGoal), data);
    if (withdrawalButton) return openWithdrawal(data.goals.find(goal => goal.id === withdrawalButton.dataset.withdrawGoal), data);
    if (completeButton) return changeGoalStatus(completeButton.dataset.completeGoal,'completed');
    if (reopenButton) return changeGoalStatus(reopenButton.dataset.reopenGoal,'active');
  });
}

function openGoalEditor(goal={}) {
  if (!modalBody || !modal) return;
  const editing = Boolean(goal.id);
  modalBody.innerHTML = `<h2 id="modalTitle">${editing?'Editar':'Nueva'} meta de ahorro</h2>
    <form id="goalForm" class="goal-modal-form">
      <input type="hidden" name="id" value="${escapeHtml(goal.id||'')}">
      <div class="field"><label for="goalName">Nombre de la meta</label><input id="goalName" name="name" maxlength="50" value="${escapeHtml(goal.name||'')}" placeholder="Ej. Laptop nueva" required></div>
      <div class="goal-form-grid">
        <div class="field"><label for="goalTarget">Monto objetivo</label><input id="goalTarget" name="targetAmount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(goal.targetAmount)||''}" required></div>
        <div class="field"><label for="goalDate">Fecha objetivo</label><input id="goalDate" name="targetDate" type="date" min="${today()}" value="${escapeHtml(goal.targetDate||'')}"></div>
        <div class="field"><label for="goalMode">Forma de aporte</label><select id="goalMode" name="contributionMode"><option value="fixed" ${goal.contributionMode!=='percent'?'selected':''}>Monto fijo</option><option value="percent" ${goal.contributionMode==='percent'?'selected':''}>Porcentaje de un ingreso</option></select></div>
        <div class="field"><label for="goalValue">Valor del aporte</label><input id="goalValue" name="contributionValue" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(goal.contributionValue)||0}" required></div>
        <div class="field full"><label for="goalIcon">Icono</label><input id="goalIcon" name="icon" maxlength="4" value="${escapeHtml(goal.icon||'🎯')}"></div>
      </div>
      <div class="goal-modal-note"><span>◇</span><p>La aplicación creará o conservará un fondo no gastable vinculado a esta meta. Ese saldo aparecerá como <strong>ahorro destinado</strong>, no como dinero protegido general.</p></div>
      <button type="submit" class="btn">${editing?'Guardar cambios':'Crear meta'}</button>
    </form>`;
  const form = modalBody.querySelector('#goalForm');
  form.addEventListener('submit', event => saveGoal(event,goal));
  const mode = form.elements.contributionMode;
  const updateLabel = () => form.querySelector('label[for="goalValue"]').textContent = mode.value === 'percent' ? 'Porcentaje del ingreso (%)' : 'Monto fijo del aporte';
  mode.addEventListener('change',updateLabel);
  updateLabel();
  modal.showModal();
}

async function saveGoal(event, previous={}) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    const values = Object.fromEntries(new FormData(form));
    const name = values.name.trim();
    const targetAmount = Number(values.targetAmount);
    const contributionValue = Number(values.contributionValue);
    if (!name) throw new Error('Escribe el nombre de la meta.');
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error('El monto objetivo debe ser mayor que cero.');
    if (!Number.isFinite(contributionValue) || contributionValue < 0) throw new Error('El valor del aporte no es válido.');
    if (values.contributionMode === 'percent' && contributionValue > 100) throw new Error('El porcentaje no puede superar 100%.');
    const id = previous.id || createId('goal');
    let fundId = previous.fundId;
    if (!fundId || !await db.get('funds',fundId)) {
      fundId = createId('fund');
      await db.put('funds',{id:fundId,name:`Meta: ${name}`,type:'Meta de ahorro',initial:0,icon:values.icon||'🎯',spendable:false,protected:false,reserveKind:'goal',goalId:id,created:Date.now()});
    } else {
      const fund = await db.get('funds',fundId);
      await db.put('funds',{...fund,name:`Meta: ${name}`,type:'Meta de ahorro',icon:values.icon||fund.icon||'🎯',spendable:false,protected:false,reserveKind:'goal',goalId:id});
    }
    await db.put('budgets',{...previous,id,kind:GOAL_KIND,name,targetAmount,targetDate:values.targetDate||'',contributionMode:values.contributionMode==='percent'?'percent':'fixed',contributionValue,icon:values.icon||'🎯',fundId,status:previous.status||'active',created:previous.created||Date.now(),updatedAt:Date.now()});
    modal.close();
    showToast(previous.id?'Meta actualizada':'Meta creada');
    await openGoalsPage();
  } catch (error) {
    alert(`No se pudo guardar la meta: ${error instanceof Error?error.message:String(error)}`);
  } finally {
    if (button.isConnected) { button.disabled=false; button.textContent=label; }
  }
}

function openContribution(goal,data) {
  if (!goal || !modalBody || !modal) return;
  const sources = data.funds.filter(fund => !isGoalFund(fund) && !fund.protected && fund.spendable !== false);
  if (!sources.length) return alert('Necesitas al menos un fondo disponible para aportar a una meta.');
  const suggested = goal.contributionMode === 'fixed' ? Number(goal.contributionValue)||0 : 0;
  modalBody.innerHTML = `<h2 id="modalTitle">Aportar a ${escapeHtml(goal.name)}</h2>
    <form id="goalContributionForm" class="goal-modal-form">
      <div class="goal-contribution-summary"><span>${escapeHtml(goal.icon||'🎯')}</span><div><small>Ahorrado actualmente</small><strong>${money(goalBalance(goal,data.totals.bal))}</strong></div></div>
      ${goal.contributionMode==='percent'?`<div class="field"><label for="incomeReference">Ingreso de referencia</label><input id="incomeReference" name="incomeReference" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ej. 3000"><small>Se calculará automáticamente el ${Number(goal.contributionValue)||0}%.</small></div>`:''}
      <div class="field"><label for="goalSource">Fondo de origen</label><select id="goalSource" name="from" required>${sources.map(fund=>`<option value="${escapeHtml(fund.id)}">${escapeHtml(fund.name)} (${money(data.totals.bal[fund.id]||0)})</option>`).join('')}</select></div>
      <div class="goal-form-grid"><div class="field"><label for="goalContributionAmount">Monto del aporte</label><input id="goalContributionAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${suggested||''}" required></div><div class="field"><label for="goalContributionDate">Fecha</label><input id="goalContributionDate" name="date" type="date" value="${today()}" required></div></div>
      <div class="goal-modal-note"><span>↔</span><p>Este aporte moverá dinero entre tus fondos. El total se mantendrá igual y tu disponible real disminuirá.</p></div>
      <button type="submit" class="btn">Confirmar aporte</button>
    </form>`;
  const form = modalBody.querySelector('#goalContributionForm');
  const reference = form.elements.incomeReference;
  if (reference) reference.addEventListener('input',()=>{form.elements.amount.value=(Math.max(0,Number(reference.value)||0)*(Number(goal.contributionValue)||0)/100).toFixed(2)});
  form.addEventListener('submit',event=>saveContribution(event,goal));
  modal.showModal();
}

async function saveContribution(event,goal) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const amount = Number(values.amount);
  const source = await db.get('funds',values.from);
  const goalFund = await db.get('funds',goal.fundId);
  if (!source || !goalFund) return alert('Uno de los fondos ya no existe.');
  const data = await loadData();
  const sourceBalance = Number(data.totals.bal[source.id]||0);
  if (!Number.isFinite(amount) || amount<=0) return alert('El aporte debe ser mayor que cero.');
  if (amount>sourceBalance) return alert(`Solo tienes ${money(sourceBalance)} disponibles en “${source.name}”.`);
  await db.put('transactions',{type:'transfer',amount,description:`Aporte a ${goal.name}`,from:source.id,to:goalFund.id,date:values.date||today(),goalId:goal.id,goalAction:'contribution',created:Date.now()});
  modal.close();
  showToast(`Aportaste ${money(amount)} a ${goal.name}`);
  await openGoalsPage();
}

function openWithdrawal(goal,data) {
  if (!goal || !modalBody || !modal) return;
  const saved = goalBalance(goal,data.totals.bal);
  const destinations = data.funds.filter(fund => !isGoalFund(fund) && !fund.protected && fund.spendable !== false);
  if (!destinations.length) return alert('Necesitas un fondo disponible para recibir el retiro.');
  modalBody.innerHTML = `<h2 id="modalTitle">Retirar de ${escapeHtml(goal.name)}</h2>
    <form id="goalWithdrawalForm" class="goal-modal-form">
      <div class="goal-contribution-summary withdrawal"><span>!</span><div><small>Máximo disponible en la meta</small><strong>${money(saved)}</strong></div></div>
      <div class="field"><label for="goalDestination">Fondo de destino</label><select id="goalDestination" name="to" required>${destinations.map(fund=>`<option value="${escapeHtml(fund.id)}">${escapeHtml(fund.name)}</option>`).join('')}</select></div>
      <div class="goal-form-grid"><div class="field"><label for="goalWithdrawalAmount">Monto a retirar</label><input id="goalWithdrawalAmount" name="amount" type="number" min="0.01" max="${Math.max(0,saved)}" step="0.01" inputmode="decimal" required></div><div class="field"><label for="goalWithdrawalDate">Fecha</label><input id="goalWithdrawalDate" name="date" type="date" value="${today()}" required></div></div>
      <div class="field"><label for="goalWithdrawalReason">Motivo</label><input id="goalWithdrawalReason" name="reason" maxlength="100" placeholder="Explica por qué usarás este ahorro" required></div>
      <div class="goal-modal-note danger"><span>!</span><p>El retiro aumentará tu disponible real y reducirá el progreso de la meta. Se pedirá una confirmación adicional.</p></div>
      <button type="submit" class="btn danger">Retirar dinero</button>
    </form>`;
  modalBody.querySelector('#goalWithdrawalForm').addEventListener('submit',event=>saveWithdrawal(event,goal));
  modal.showModal();
}

async function saveWithdrawal(event,goal) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const amount = Number(values.amount);
  const data = await loadData();
  const saved = goalBalance(goal,data.totals.bal);
  if (!Number.isFinite(amount)||amount<=0||amount>saved) return alert(`Puedes retirar como máximo ${money(saved)}.`);
  if (!confirm(`Vas a retirar ${money(amount)} de “${goal.name}”. ¿Confirmas que deseas usar este ahorro?`)) return;
  await db.put('transactions',{type:'transfer',amount,description:`Retiro de ${goal.name}: ${values.reason}`,from:goal.fundId,to:values.to,date:values.date||today(),goalId:goal.id,goalAction:'withdrawal',created:Date.now()});
  modal.close();
  showToast(`Retiraste ${money(amount)} de ${goal.name}`);
  await openGoalsPage();
}

async function changeGoalStatus(id,status) {
  const goal = await db.get('budgets',id);
  if (!goal || goal.kind!==GOAL_KIND) return;
  if (status==='completed'&&!confirm(`¿Marcar “${goal.name}” como completada?`)) return;
  await db.put('budgets',{...goal,status,completedAt:status==='completed'?Date.now():null,updatedAt:Date.now()});
  showToast(status==='completed'?'Meta completada':'Meta reabierta');
  await openGoalsPage();
}

function goalBalance(goal,balances) { return Number(balances?.[goal.fundId]||0); }
function statusOrder(goal) { return goal.status==='completed'?1:0; }

function monthlyRecommendation(goal,saved) {
  const remaining = Math.max(0,Number(goal.targetAmount||0)-Number(saved||0));
  if (!remaining) return 0;
  if (goal.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(goal.targetDate)) {
    const days = Math.max(1,dayNumber(goal.targetDate)-dayNumber(today())+1);
    return remaining/Math.max(1,Math.ceil(days/30.4375));
  }
  return goal.contributionMode==='fixed' ? Math.min(remaining,Math.max(0,Number(goal.contributionValue)||0)) : 0;
}

function dayNumber(value) {
  const [year,month,day] = String(value).split('-').map(Number);
  return Math.floor(Date.UTC(year,month-1,day)/86400000);
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)).replace('.','');
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent=message;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),2400);
}

function clamp(value) { return Math.max(0,Math.min(100,Number(value)||0)); }
function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

function schedulePatches() {
  if (patchScheduled) return;
  patchScheduled=true;
  queueMicrotask(async()=>{
    patchScheduled=false;
    const page = app?.querySelector('.page');
    if (!page || page.classList.contains('goals-v1')) return;
    const needsPatch = (page.matches('.dashboard-v2,.funds-v2,.register-v2,.analysis-v2') && page.dataset.goalsEnhanced!=='ready');
    if (!needsPatch) return;
    try {
      const data = await loadData();
      if (!page.isConnected) return;
      if (page.classList.contains('dashboard-v2')) patchDashboard(page,data);
      if (page.classList.contains('funds-v2')) patchFunds(page,data);
      if (page.classList.contains('register-v2')) patchRegister(page,data);
      if (page.classList.contains('analysis-v2')) patchAnalysis(page,data);
      page.dataset.goalsEnhanced='ready';
    } catch(error) {
      console.error('No se pudo integrar la distribución de metas.',error);
    }
  });
}

function patchDashboard(page,data) {
  const totalCard = page.querySelector('.summary-kpi.tone-total');
  if (totalCard&&!page.querySelector('.summary-kpi.tone-goals')) totalCard.insertAdjacentHTML('beforebegin',`<article class="summary-kpi tone-goals"><div class="kpi-icon">◇</div><div class="kpi-copy"><span>Ahorro destinado</span><strong>${money(data.totals.goalMoney)}</strong><small>Separado para tus metas</small></div><div class="kpi-spark"><span class="goal-mini-spark">${data.goals.filter(goal=>goal.status!=='completed').length} metas</span></div></article>`);
  const panels = page.querySelector('.summary-panels');
  if (panels&&!page.querySelector('.dashboard-goals-panel')) panels.insertAdjacentHTML('beforeend',dashboardGoalsPanel(data));
}

function dashboardGoalsPanel(data) {
  const active = data.goals.filter(goal=>goal.status!=='completed').slice(0,3);
  const rows = active.map(goal=>{const saved=goalBalance(goal,data.totals.bal),target=Number(goal.targetAmount)||0,pct=target?saved/target*100:0;return `<div class="dashboard-goal-row"><span>${escapeHtml(goal.icon||'🎯')}</span><div><strong>${escapeHtml(goal.name)}</strong><div><i style="width:${clamp(pct)}%"></i></div><small>${money(saved)} de ${money(target)}</small></div><b>${Math.round(pct)}%</b></div>`}).join('');
  return `<article class="dashboard-panel dashboard-goals-panel"><header class="panel-heading"><div><h3>Metas de ahorro</h3><p>${money(data.totals.goalMoney)} separados de tu disponible</p></div><button type="button" class="dashboard-link" data-go="goals">Ver metas</button></header>${rows||'<div class="dashboard-empty">Crea una meta para empezar a separar dinero.</div>'}</article>`;
}

function patchFunds(page,data) {
  const totalStat = [...page.querySelectorAll('.fund-stat')].find(card=>card.querySelector('small')?.textContent.trim()==='Dinero total');
  if (totalStat&&!page.querySelector('.fund-stat.tone-goals')) totalStat.insertAdjacentHTML('beforebegin',`<article class="fund-stat tone-goals"><span class="fund-stat-icon">◇</span><div><small>Metas</small><strong>${money(data.totals.goalMoney)}</strong><p>Ahorro con objetivo</p></div></article>`);
  const header = page.querySelector('.funds-header');
  if (header&&!header.querySelector('[data-open-goals]')) {
    const currentButton=header.querySelector('.funds-new');
    const group=document.createElement('div');group.className='funds-header-actions';
    group.innerHTML='<button type="button" class="btn secondary" data-open-goals>◇ Ver metas</button>';
    if(currentButton){currentButton.replaceWith(group);group.append(currentButton)}else header.append(group);
  }
  const goalFunds=data.funds.filter(isGoalFund),protectedFunds=data.funds.filter(fund=>!isGoalFund(fund)&&(fund.protected||fund.spendable===false));
  const protectedButton=page.querySelector('[data-fund-filter="protected"] span');if(protectedButton)protectedButton.textContent=String(protectedFunds.length);
  const tabs=page.querySelector('.fund-filter-tabs');
  if(tabs&&!tabs.querySelector('[data-fund-filter="goal"]')){const button=document.createElement('button');button.type='button';button.dataset.fundFilter='goal';button.innerHTML=`Metas <span>${goalFunds.length}</span>`;button.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));filterFundCards(page,'goal')});tabs.append(button)}
  for(const fund of goalFunds){const card=[...page.querySelectorAll('.fund-v2-card')].find(item=>item.querySelector('.fund-card-head h3')?.textContent.trim()===fund.name);if(!card)continue;card.dataset.fundStatus='goal';card.classList.add('is-goal-fund');const status=card.querySelector('.fund-status');if(status){status.className='fund-status goal';status.textContent='◇ Meta de ahorro'}const actions=card.querySelector('.fund-card-actions');if(actions)actions.innerHTML=`<button type="button" class="btn secondary" data-go="goals">Administrar meta</button><button type="button" class="btn" data-go="goals">＋ Aportar</button>`}
  const overview=page.querySelector('.funds-overview');if(overview)overview.outerHTML=fundsAllocationOverview(data.totals);
}

function filterFundCards(page,status){const cards=[...page.querySelectorAll('.fund-v2-card')];let visible=0;for(const card of cards){card.hidden=card.dataset.fundStatus!==status;if(!card.hidden)visible++}const grid=page.querySelector('#fundCards'),empty=page.querySelector('#fundEmpty');if(grid)grid.hidden=visible===0;if(empty)empty.hidden=visible>0}

function fundsAllocationOverview(totals){const total=Math.max(0,Number(totals.total)||0),availablePct=total?Math.max(0,totals.available)/total*100:0,goalPct=total?Math.max(0,totals.goalMoney)/total*100:0,protectedPct=total?Math.max(0,totals.protectedMoney)/total*100:0;return `<article class="funds-overview funds-overview-three"><div class="funds-allocation-donut" style="--available:${clamp(availablePct)}%;--goals:${clamp(availablePct+goalPct)}%"><div><strong>${money(totals.total)}</strong><span>Total</span></div></div><div class="funds-overview-copy"><span class="eyebrow">Distribución real</span><h3>Disponible, metas y protegido</h3><p>Todo suma tu dinero total, pero solo la parte disponible está libre para gastar.</p><div class="funds-split-row available"><i></i><span>Disponible</span><strong>${money(totals.available)}</strong><b>${Math.round(availablePct)}%</b></div><div class="funds-split-row goals"><i></i><span>Metas de ahorro</span><strong>${money(totals.goalMoney)}</strong><b>${Math.round(goalPct)}%</b></div><div class="funds-split-row protected"><i></i><span>Protegido</span><strong>${money(totals.protectedMoney)}</strong><b>${Math.round(protectedPct)}%</b></div></div></article>`}

function patchRegister(page,data){for(const fund of data.funds.filter(isGoalFund)){page.querySelectorAll(`option[value="${cssEscape(fund.id)}"]`).forEach(option=>{option.textContent=option.textContent.replace('· Protegido','· Meta de ahorro')})}const aside=page.querySelector('.register-aside');if(aside&&!aside.querySelector('.register-allocation-card'))aside.insertAdjacentHTML('beforeend',`<article class="register-summary-card register-allocation-card"><h3>Disponible real actual</h3><div class="register-summary-list"><div class="register-summary-row"><span>Disponible</span><b>${money(data.totals.available)}</b></div><div class="register-summary-row"><span>Metas</span><b>${money(data.totals.goalMoney)}</b></div><div class="register-summary-row"><span>Protegido</span><b>${money(data.totals.protectedMoney)}</b></div><div class="register-summary-row total"><span>Dinero total</span><b>${money(data.totals.total)}</b></div></div><button type="button" class="btn secondary" data-go="goals">Administrar metas</button></article>`)}

function patchAnalysis(page,data){const panel=page.querySelector('.funds-analysis-panel');if(!panel)return;const heading=panel.querySelector('.analysis-panel-heading')?.outerHTML||'';const total=Math.max(0,Number(data.totals.total)||0),availablePct=total?Math.max(0,data.totals.available)/total*100:0,goalPct=total?Math.max(0,data.totals.goalMoney)/total*100:0,protectedPct=total?Math.max(0,data.totals.protectedMoney)/total*100:0;panel.innerHTML=`${heading}<div class="fund-analysis-total"><span>Dinero total</span><strong>${money(data.totals.total)}</strong></div><div class="fund-analysis-track three"><i style="width:${clamp(availablePct)}%"></i><em style="width:${clamp(goalPct)}%"></em><b style="width:${clamp(protectedPct)}%"></b></div><div class="fund-analysis-rows"><div><span><i class="fund-available-dot"></i>Disponible</span><b>${Math.round(availablePct)}%</b><strong>${money(data.totals.available)}</strong></div><div><span><i class="fund-goal-dot"></i>Metas</span><b>${Math.round(goalPct)}%</b><strong>${money(data.totals.goalMoney)}</strong></div><div><span><i class="fund-protected-dot"></i>Protegido</span><b>${Math.round(protectedPct)}%</b><strong>${money(data.totals.protectedMoney)}</strong></div></div>`}

function cssEscape(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/["\\]/g,'\\$&')}

navigation?.addEventListener('click',event=>{const button=event.target.closest('[data-page="goals"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openGoalsPage()},true);
document.addEventListener('click',event=>{const button=event.target.closest('[data-go="goals"],[data-open-goals]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openGoalsPage()},true);
if(app){new MutationObserver(schedulePatches).observe(app,{childList:true,subtree:true});schedulePatches()}
