import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatDateTime, formatDuration } from './format';

// Intl usa espaço não separável (U+00A0) entre "R$" e o valor
const normalize = (text: string) => text.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('formata em reais com vírgula decimal', () => {
    expect(normalize(formatCurrency(1234.5))).toBe('R$ 1.234,50');
  });

  it('aceita strings decimais vindas da API', () => {
    expect(normalize(formatCurrency('89.90'))).toBe('R$ 89,90');
  });
});

describe('formatDate / formatDateTime', () => {
  it('usa o formato brasileiro no fuso de São Paulo', () => {
    expect(formatDate('2026-03-15T12:00:00Z')).toBe('15/03/2026');
    expect(formatDateTime('2026-03-15T12:00:00Z')).toBe('15/03/2026, 09:00:00');
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45s'],
    [600, '10min'],
    [7200, '2h'],
    [12_000, '3h 20min'],
    [90_000, '1d 1h'],
  ])('%i segundos → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatação de estoque', () => {
  it('formata gramas e quilos', async () => {
    const { formatGrams } = await import('./format');
    expect(formatGrams('850.00')).toBe('850 g');
    expect(formatGrams('85.5')).toBe('85,5 g');
    expect(formatGrams('1250')).toBe('1,25 kg');
  });

  it('formata minutos de impressão', async () => {
    const { formatMinutes } = await import('./format');
    expect(formatMinutes(200)).toBe('3h 20min');
    expect(formatMinutes(45)).toBe('45min');
  });

  it('não desloca datas sem horário para o dia anterior', async () => {
    const { formatDateOnly } = await import('./format');
    expect(formatDateOnly('2026-11-01')).toBe('01/11/2026');
  });
});
