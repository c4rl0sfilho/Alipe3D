import { describe, expect, it } from 'vitest';
import {
  addDays,
  dueState,
  maintenanceDue,
  netPrintSeconds,
  pendingInspection,
  remainingToPrint,
  resolveIdleStatus,
} from './production-rules.js';

const order = (overrides: Partial<Parameters<typeof resolveIdleStatus>[0]> = {}) => ({
  quantity: 5,
  producedQuantity: 0,
  approvedQuantity: 0,
  rejectedQuantity: 0,
  waivedQuantity: 0,
  status: 'PLANNED' as const,
  printerId: 'p1',
  ...overrides,
});

describe('regras da ordem de produção', () => {
  it('reprovadas voltam a faltar; dispensadas não', () => {
    expect(remainingToPrint(order({ producedQuantity: 5, rejectedQuantity: 2 }))).toBe(2);
    expect(
      remainingToPrint(order({ producedQuantity: 5, rejectedQuantity: 2, waivedQuantity: 2 })),
    ).toBe(0);
    expect(pendingInspection(order({ producedQuantity: 5, approvedQuantity: 3 }))).toBe(2);
  });

  it('decide a próxima situação sem impressão em andamento', () => {
    expect(resolveIdleStatus(order())).toBe('PLANNED');
    expect(resolveIdleStatus(order({ printerId: null }))).toBe('PENDING');
    expect(resolveIdleStatus(order({ producedQuantity: 5 }))).toBe('COMPLETED');
    expect(resolveIdleStatus(order({ producedQuantity: 5, status: 'INSPECTION' }))).toBe(
      'INSPECTION',
    );
    expect(resolveIdleStatus(order({ producedQuantity: 5, approvedQuantity: 5 }))).toBe('APPROVED');
    expect(resolveIdleStatus(order({ waivedQuantity: 5 }))).toBe('FAILED');
  });

  it('prazo e manutenção', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dueState('2026-11-04', '2026-11-05')).toBe('overdue');
    expect(dueState('2026-11-05', '2026-11-05')).toBe('today');
    expect(dueState('2026-11-07', '2026-11-05')).toBe('soon');
    expect(dueState('2026-11-20', '2026-11-05')).toBe('ok');
    expect(dueState(null, '2026-11-05')).toBeNull();
    expect(maintenanceDue('2026-11-01', '2026-11-05')).toBe('overdue');
    expect(maintenanceDue('2026-11-10', '2026-11-05')).toBe('soon');
    expect(maintenanceDue('2026-12-10', '2026-11-05')).toBeNull();
  });

  it('desconta as pausas do tempo de impressão', () => {
    const startedAt = new Date('2026-11-05T10:00:00Z');
    const finishedAt = new Date('2026-11-05T12:00:00Z');
    expect(netPrintSeconds({ startedAt, finishedAt, pausedSeconds: 600 })).toBe(6600);
  });
});
