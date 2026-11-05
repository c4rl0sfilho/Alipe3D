const LOCALE = 'pt-BR';
const TIME_ZONE = 'America/Sao_Paulo';

const currencyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeZone: TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: TIME_ZONE,
});

/** Formata valores monetários em BRL. Aceita string para valores decimais vindos da API. */
export function formatCurrency(value: number | string): string {
  return currencyFormatter.format(typeof value === 'string' ? Number(value) : value);
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value));
}

/** Converte segundos em texto legível, ex.: 3h 20min. */
export function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return `${Math.floor(totalSeconds)}s`;
}

const numberFormatters = new Map<number, Intl.NumberFormat>();
function numberFormatter(maxFractionDigits: number) {
  let formatter = numberFormatters.get(maxFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFractionDigits });
    numberFormatters.set(maxFractionDigits, formatter);
  }
  return formatter;
}

/** Número no padrão brasileiro: 1234.5 → "1.234,5". */
export function formatNumber(value: number | string, maxFractionDigits = 2): string {
  return numberFormatter(maxFractionDigits).format(Number(value));
}

/** Peso de filamento: abaixo de 1 kg em gramas, acima em kg. */
export function formatGrams(value: number | string): string {
  const grams = Number(value);
  if (Math.abs(grams) >= 1000) return `${formatNumber(grams / 1000, 2)} kg`;
  return `${formatNumber(grams, 1)} g`;
}

/** Minutos em texto: 200 → "3h 20min". */
export function formatMinutes(totalMinutes: number): string {
  return totalMinutes === 0 ? '0min' : formatDuration(totalMinutes * 60);
}

/**
 * Data sem horário vinda da API ("2026-11-01"). Não passa por `new Date`,
 * que interpretaria como meia-noite UTC e mostraria o dia anterior no Brasil.
 */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Custo por grama/unidade com até 4 casas: "R$ 0,1200". */
export function formatUnitCost(value: number | string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

/** Data de hoje em São Paulo no formato do input de data (AAAA-MM-DD). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

const timeFormatter = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short', timeZone: TIME_ZONE });

/** Hora no fuso de São Paulo: "14:05". */
export function formatTime(value: Date | string): string {
  return timeFormatter.format(new Date(value));
}
