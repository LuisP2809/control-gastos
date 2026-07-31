export const money = value => new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
}).format(Number(value) || 0).replace('PEN', 'S/');

export function localDate(date = new Date(), timeZone = 'America/Lima') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export const today = () => localDate();
export const currentMonth = (date = today()) => String(date).slice(0, 7);
export const isAccount = fund => Boolean(fund && (fund.kind === 'account' || (!fund.kind && fund.spendable !== false)));

export function balances(funds, transactions) {
  const accounts = funds.filter(isAccount);
  const result = Object.fromEntries(accounts.map(account => [account.id, Number(account.initial) || 0]));
  for (const movement of transactions) {
    const amount = Number(movement.amount) || 0;
    if (movement.type === 'income') result[movement.fund] = (result[movement.fund] || 0) + amount;
    if (movement.type === 'expense') result[movement.fund] = (result[movement.fund] || 0) - amount;
    if (movement.type === 'adjustment') result[movement.fund] = (result[movement.fund] || 0) + amount;
    if (movement.type === 'transfer') {
      result[movement.from] = (result[movement.from] || 0) - amount;
      result[movement.to] = (result[movement.to] || 0) + amount;
    }
  }
  return result;
}

export function allocationBalances(allocations) {
  const byKind = { saving: 0, external: 0 };
  const byAccount = {};
  const byOwner = {};
  const byMonth = {};

  for (const allocation of allocations) {
    const amount = Number(allocation.amount) || 0;
    const sign = allocation.action === 'release' ? -1 : 1;
    const signed = sign * amount;
    const kind = allocation.kind === 'external' ? 'external' : 'saving';
    byKind[kind] = (byKind[kind] || 0) + signed;
    byAccount[allocation.accountId] ??= { saving: 0, external: 0, total: 0 };
    byAccount[allocation.accountId][kind] += signed;
    byAccount[allocation.accountId].total += signed;

    if (kind === 'external') {
      const owner = String(allocation.owner || 'Sin nombre').trim() || 'Sin nombre';
      byOwner[owner] = (byOwner[owner] || 0) + signed;
    }

    if (kind === 'saving') {
      const month = String(allocation.date || '').slice(0, 7);
      if (month) byMonth[month] = (byMonth[month] || 0) + signed;
    }
  }

  byKind.saving = cleanZero(byKind.saving);
  byKind.external = cleanZero(byKind.external);
  for (const value of Object.values(byAccount)) {
    value.saving = cleanZero(value.saving);
    value.external = cleanZero(value.external);
    value.total = cleanZero(value.total);
  }
  return { byKind, byAccount, byOwner, byMonth };
}

export function summary(funds, transactions, allocations = [], date = today()) {
  const accounts = funds.filter(isAccount).sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
  const bal = balances(accounts, transactions);
  const separated = allocationBalances(allocations);
  const total = cleanZero(Object.values(bal).reduce((sum, value) => sum + Number(value || 0), 0));
  const saving = Math.max(0, cleanZero(separated.byKind.saving));
  const external = Math.max(0, cleanZero(separated.byKind.external));
  const available = cleanZero(total - saving - external);
  const month = currentMonth(date);
  const monthTransactions = transactions.filter(item => item.date?.startsWith(month));
  const income = sumAmounts(monthTransactions.filter(item => item.type === 'income'));
  const expense = sumAmounts(monthTransactions.filter(item => item.type === 'expense'));
  const savingThisMonth = cleanZero(separated.byMonth[month] || 0);
  const accountRows = accounts.map(account => {
    const balance = cleanZero(bal[account.id] || 0);
    const reserved = separated.byAccount[account.id] || { saving: 0, external: 0, total: 0 };
    return {
      ...account,
      balance,
      saving: Math.max(0, cleanZero(reserved.saving)),
      external: Math.max(0, cleanZero(reserved.external)),
      reserved: Math.max(0, cleanZero(reserved.total)),
      available: cleanZero(balance - reserved.total),
    };
  });

  return {
    accounts,
    accountRows,
    bal,
    separated,
    total,
    saving,
    external,
    reserved: saving + external,
    available,
    income,
    expense,
    net: cleanZero(income - expense),
    savingThisMonth,
  };
}

export function availableInAccount(accountId, funds, transactions, allocations = []) {
  return summary(funds, transactions, allocations).accountRows.find(row => row.id === accountId)?.available || 0;
}

export function physicalBalanceInAccount(accountId, funds, transactions) {
  return balances(funds.filter(isAccount), transactions)[accountId] || 0;
}

export function monthlySavingsSeries(allocations, limit = 12) {
  const { byMonth } = allocationBalances(allocations.filter(item => item.kind === 'saving'));
  return Object.entries(byMonth)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-Math.max(1, Number(limit) || 12))
    .map(([month, value]) => ({ month, value: cleanZero(value) }));
}

export function externalOwners(allocations) {
  const { byOwner } = allocationBalances(allocations.filter(item => item.kind === 'external'));
  return Object.entries(byOwner)
    .map(([owner, amount]) => ({ owner, amount: cleanZero(amount) }))
    .filter(item => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount || a.owner.localeCompare(b.owner));
}

export function combinedMovements(transactions, allocations) {
  const cash = transactions.filter(item => !item.linkedExternalReturn).map(item => ({
    ...item,
    source: 'transaction',
    sortTime: Number(item.created || 0),
  }));
  const separated = allocations.map(item => ({
    ...item,
    type: item.kind === 'saving'
      ? (item.action === 'release' ? 'saving-release' : 'saving')
      : (item.action === 'release' ? 'external-release' : 'external'),
    source: 'allocation',
    sortTime: Number(item.created || 0),
  }));
  return [...cash, ...separated].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.sortTime - a.sortTime);
}

export function byCategory(transactions, type = 'expense') {
  return Object.entries(transactions.filter(item => item.type === type).reduce((result, item) => {
    const category = item.category || 'Otros';
    result[category] = (result[category] || 0) + Number(item.amount || 0);
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}

export function limitState(percent, settings) {
  if (percent >= 100) return ['Alcanzaste o superaste tu límite', 'negative'];
  if (percent >= Number(settings.critical || 90)) return ['Estás cerca de alcanzar tu límite', 'negative'];
  if (percent >= Number(settings.warning || 70)) return ['Ya utilizaste gran parte de tu presupuesto', 'warning'];
  return ['Estás dentro de tu presupuesto', 'positive'];
}

export function dateRange(preset, now = today(), custom = {}) {
  const end = custom.end || now;
  if (preset === 'custom') return { start: custom.start || end, end };
  const current = now.slice(0, 7);
  if (preset === 'previous') {
    const month = shiftMonth(current, -1);
    return { start: `${month}-01`, end: lastDay(month) };
  }
  const months = Math.max(1, Number(preset) || 1);
  const startMonth = shiftMonth(current, -(months - 1));
  return { start: `${startMonth}-01`, end };
}

export const inRange = (items, range) => items.filter(item => item.date >= range.start && item.date <= range.end);

export function previousRange(range) {
  const start = toDayNumber(range.start);
  const end = toDayNumber(range.end);
  const duration = end - start + 1;
  const previousEnd = start - 1;
  return { start: fromDayNumber(previousEnd - duration + 1), end: fromDayNumber(previousEnd) };
}

export function monthlySeries(transactions, range) {
  const result = [];
  const ranged = inRange(transactions, range);
  let cursor = range.start.slice(0, 7);
  const end = range.end.slice(0, 7);
  while (cursor <= end) {
    const items = ranged.filter(item => item.date?.startsWith(cursor));
    result.push({
      month: cursor,
      income: sumAmounts(items.filter(item => item.type === 'income')),
      expense: sumAmounts(items.filter(item => item.type === 'expense')),
    });
    cursor = nextMonth(cursor);
  }
  return result;
}

export function balanceEvolution(funds, transactions, range) {
  const before = transactions.filter(item => item.date < range.start);
  let running = Object.values(balances(funds, before)).reduce((sum, value) => sum + value, 0);
  return transactions
    .filter(item => item.date >= range.start && item.date <= range.end && item.type !== 'transfer')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => {
      if (item.type === 'income') running += Number(item.amount || 0);
      if (item.type === 'expense') running -= Number(item.amount || 0);
      if (item.type === 'adjustment') running += Number(item.amount || 0);
      return { date: item.date, balance: cleanZero(running) };
    });
}

export function fundsAt(funds, transactions, end, allocations = []) {
  return summary(
    funds,
    transactions.filter(item => item.date <= end),
    allocations.filter(item => item.date <= end),
    end,
  );
}

function sumAmounts(items) {
  return cleanZero(items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
}

function cleanZero(value) {
  const number = Number(value) || 0;
  return Math.abs(number) < 0.000001 ? 0 : number;
}

function nextMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function shiftMonth(value, offset) {
  const [year, month] = value.split('-').map(Number);
  const index = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(index / 12);
  const nextMonthValue = index - nextYear * 12 + 1;
  return `${nextYear}-${String(nextMonthValue).padStart(2, '0')}`;
}

function lastDay(value) {
  const [year, month] = value.split('-').map(Number);
  return `${value}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

function toDayNumber(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function fromDayNumber(value) {
  const date = new Date(value * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
