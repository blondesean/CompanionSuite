import { describe, expect, it } from 'vitest';
import { buildChoreWeek, isChoreDue, nextDueWeek } from '../../shared/chores';
import { formatCountdown, nextOccurrence, sortDates, yearsLabel } from '../../shared/dates';
import { buildGroceryList, formatAmount, formatQuantity, groceryKey, parseQuantity } from '../../shared/grocery';
import { plannedReminders, reminderBody, reminderRecipients } from '../../shared/reminders';
import type { Chore, Recipe } from '../../shared/types';
import { addWeeks, formatWeekRange, isWeekStart, weekStart, weeksBetween } from '../../shared/weeks';

describe('weeks', () => {
  it('finds the Monday of any date', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart('2026-11-04')).toBe('2026-11-02');
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across the year boundary
  });

  it('is unaffected by daylight saving changes', () => {
    // US DST ended 2026-11-01.
    expect(addWeeks('2026-10-26', 1)).toBe('2026-11-02');
    expect(weeksBetween('2026-10-26', '2026-11-02')).toBe(1);
    expect(weeksBetween('2026-03-02', '2026-03-16')).toBe(2);
  });

  it('validates week starts', () => {
    expect(isWeekStart('2026-11-02')).toBe(true);
    expect(isWeekStart('2026-11-03')).toBe(false);
    expect(isWeekStart('2026-02-30')).toBe(false);
    expect(isWeekStart('nope')).toBe(false);
  });

  it('formats week ranges', () => {
    expect(formatWeekRange('2026-11-02')).toBe('Nov 2 – 8');
    expect(formatWeekRange('2026-10-26')).toBe('Oct 26 – Nov 1');
  });
});

describe('chore schedule', () => {
  const biweekly = { cadenceWeeks: 2, startWeek: '2026-11-02' };

  it('is due every N weeks from the start week, never before it', () => {
    expect(isChoreDue(biweekly, '2026-10-26')).toBe(false);
    expect(isChoreDue(biweekly, '2026-11-02')).toBe(true);
    expect(isChoreDue(biweekly, '2026-11-09')).toBe(false);
    expect(isChoreDue(biweekly, '2026-11-16')).toBe(true);
  });

  it('computes the next due week', () => {
    expect(nextDueWeek(biweekly, '2026-10-19')).toBe('2026-11-02');
    expect(nextDueWeek(biweekly, '2026-11-09')).toBe('2026-11-16');
    expect(nextDueWeek(biweekly, '2026-11-16')).toBe('2026-11-16');
  });

  it('builds a week view with this week and last-time completions', () => {
    const chores: Chore[] = [
      { id: 'a', name: 'Vacuum', cadenceWeeks: 1, startWeek: '2026-10-05', createdAt: '' },
      { id: 'b', name: 'Bathroom', cadenceWeeks: 1, startWeek: '2026-10-05', createdAt: '' },
      { id: 'c', name: 'Fridge', cadenceWeeks: 4, startWeek: '2026-10-05', createdAt: '' },
    ];
    const completion = (choreId: string, week: string, completedBy: string) => ({
      choreId,
      choreName: choreId,
      week,
      completedBy,
      completedAt: `${week}T12:00:00Z`,
    });
    const view = buildChoreWeek(chores, '2026-11-09', [
      completion('a', '2026-10-26', 'sean'),
      completion('a', '2026-11-02', 'partner'),
      completion('a', '2026-11-09', 'sean'),
      completion('c', '2026-11-02', 'partner'),
    ]);

    expect(view.due.map((d) => d.chore.name)).toEqual(['Bathroom', 'Vacuum']);
    const vacuum = view.due.find((d) => d.chore.id === 'a')!;
    expect(vacuum.completion?.completedBy).toBe('sean');
    expect(vacuum.last?.completedBy).toBe('partner');
    expect(view.due.find((d) => d.chore.id === 'b')!.last).toBeNull();
    expect(view.upcoming).toEqual([{ chore: chores[2], nextWeek: '2026-11-30' }]);
  });
});

describe('grocery list', () => {
  const recipe = (id: string, name: string, ingredients: Recipe['ingredients']): Recipe => ({
    id,
    name,
    ingredients,
    notes: '',
    createdAt: '',
    updatedAt: '',
  });
  const recipes = [
    recipe('chili', 'Chili', [
      { name: 'Ground beef', quantity: 2, unit: 'lb' },
      { name: 'Onion', quantity: 1, unit: 'each' },
      { name: 'Kidney beans', quantity: 2, unit: 'can' },
    ]),
    recipe('oats', 'Overnight oats', [
      { name: 'oats', quantity: 0.5, unit: 'cup' },
      { name: 'onion ', quantity: 1, unit: 'each' }, // odd, but tests merging
      { name: 'Milk', quantity: 1, unit: 'cup' },
    ]),
  ];

  it('totals matching ingredients and sorts alphabetically', () => {
    const list = buildGroceryList({ breakfast: 'oats', lunch: 'chili', dinner: 'chili', filler: null }, recipes);
    expect(list.map((i) => `${i.name}:${i.quantity}${i.unit}`)).toEqual([
      'Ground beef:4lb',
      'Kidney beans:4can',
      'Milk:1cup',
      'oats:0.5cup',
      'onion:3each',
    ]);
    expect(list.find((i) => i.name === 'onion')!.recipes).toEqual(['Overnight oats', 'Chili']);
  });

  it('keeps different units separate and ignores deleted recipes', () => {
    const list = buildGroceryList(
      { breakfast: 'missing', lunch: null, dinner: null, filler: null },
      recipes,
    );
    expect(list).toEqual([]);
  });

  it('scales portions per slot and rounds whole-item units up', () => {
    const shop = [
      recipe('chili', 'Chili', [
        { name: 'Ground beef', quantity: 1, unit: 'lb' },
        { name: 'Beans', quantity: 1, unit: 'can' },
        { name: 'Onion', quantity: 1, unit: 'each' },
      ]),
      recipe('bowls', 'Bowls', [{ name: 'Onion', quantity: 0.5, unit: 'each' }]),
    ];
    const list = buildGroceryList(
      { breakfast: null, lunch: 'bowls', dinner: 'chili', filler: null },
      shop,
      { breakfast: 1, lunch: 1, dinner: 1.5, filler: 1 },
    );
    expect(list.map((i) => `${i.name}:${i.quantity}${i.unit}`)).toEqual([
      'Beans:2can', // 1.5 cans → buy 2
      'Ground beef:1.5lb', // weight keeps fractions
      'Onion:2each', // 1.5 + 0.5
    ]);
    expect(list.find((i) => i.name === 'Onion')!.recipes).toEqual(['Bowls', 'Chili 1½×']);
  });

  it('pluralizes units for amounts over one', () => {
    expect(formatAmount(1.5, 'lb')).toBe('1½ lbs');
    expect(formatAmount(1, 'lb')).toBe('1 lb');
    expect(formatAmount(3, 'package')).toBe('3 packages');
    expect(formatAmount(2, 'can')).toBe('2 cans');
    expect(formatAmount(0.5, 'cup')).toBe('½ cup');
    expect(formatAmount(1, 'clove')).toBe('1 clove');
    expect(formatAmount(2, 'lb')).toBe('2 lbs');
    expect(formatAmount(3, 'each')).toBe('3');
  });

  it('formats and parses quantities', () => {
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(1 / 3)).toBe('⅓');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.4)).toBe('2.4');
    expect(parseQuantity('1 1/2')).toBe(1.5);
    expect(parseQuantity('3/4')).toBe(0.75);
    expect(parseQuantity('2.25')).toBe(2.25);
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
  });
});

describe('reminders', () => {
  it('sends to assignees, or everyone when unassigned', () => {
    expect(reminderRecipients({ assignees: ['a'] }, ['a', 'b'])).toEqual(['a']);
    expect(reminderRecipients({ assignees: [] }, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('only schedules reminders that are still in the future', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const planned = plannedReminders({ dueAt: '2026-11-08T14:00:00Z', reminders: [0, 60, 1440] }, now);
    expect(planned).toEqual([
      { sendAt: '2026-11-08T13:00:00.000Z', offsetMinutes: 60 },
      { sendAt: '2026-11-08T14:00:00.000Z', offsetMinutes: 0 },
    ]);
    expect(plannedReminders({ dueAt: null, reminders: [0] }, now)).toEqual([]);
  });

  it('words reminders without needing a time zone', () => {
    expect(reminderBody(0)).toBe('Due now');
    expect(reminderBody(15)).toBe('Due in 15 minutes');
    expect(reminderBody(60)).toBe('Due in 1 hour');
    expect(reminderBody(1440)).toBe('Due tomorrow');
    expect(reminderBody(2880)).toBe('Due in 2 days');
    expect(reminderBody(10080)).toBe('Due in 1 week');
  });
});

describe('grocery extras', () => {
  it('rolls à la carte items into the list and merges matching lines', () => {
    const recipe: Recipe = {
      id: 'r1',
      name: 'Omelette',
      notes: '',
      createdAt: '',
      updatedAt: '',
      ingredients: [{ name: 'Eggs', quantity: 6, unit: 'each' }],
    };
    const items = buildGroceryList({ breakfast: 'r1', lunch: null, dinner: null, filler: null }, [recipe], undefined, [
      { name: 'Shampoo', quantity: 1, unit: 'each' },
      { name: ' eggs ', quantity: 6, unit: 'each' },
    ]);
    expect(items.map((i) => [i.name, i.quantity, i.recipes.join('+')])).toEqual([
      ['Eggs', 12, 'Omelette+À la carte'],
      ['Shampoo', 1, 'À la carte'],
    ]);
    expect(items[0].key).toBe(groceryKey('EGGS ', 'each'));
  });
});

describe('important dates', () => {
  const today = '2026-11-13';

  it('counts down to one-time and yearly dates', () => {
    expect(nextOccurrence({ date: '2026-12-25', yearly: false }, today)).toEqual({ date: '2026-12-25', daysUntil: 42, years: null });
    expect(nextOccurrence({ date: '2026-11-01', yearly: false }, today).daysUntil).toBe(-12);
    // Yearly: later this year, already passed (rolls to next year), and today.
    expect(nextOccurrence({ date: '1995-11-20', yearly: true }, today)).toEqual({ date: '2026-11-20', daysUntil: 7, years: 31 });
    expect(nextOccurrence({ date: '2023-02-14', yearly: true }, today)).toEqual({ date: '2027-02-14', daysUntil: 93, years: 4 });
    expect(nextOccurrence({ date: '2020-11-13', yearly: true }, today)).toMatchObject({ daysUntil: 0, years: 6 });
    // Starts in the future: no year count yet.
    expect(nextOccurrence({ date: '2027-03-01', yearly: true }, today)).toMatchObject({ date: '2027-03-01', years: null });
    // Feb 29 lands on Feb 28 in other years.
    expect(nextOccurrence({ date: '2024-02-29', yearly: true }, today).date).toBe('2027-02-28');
    expect(nextOccurrence({ date: '2024-02-29', yearly: true }, '2028-01-01').date).toBe('2028-02-29');
    // Across New Year.
    expect(nextOccurrence({ date: '2025-01-01', yearly: true }, '2026-12-31')).toMatchObject({ date: '2027-01-01', daysUntil: 1 });
  });

  it('sorts upcoming soonest first and past most recent first', () => {
    const base = { kind: 'event' as const, notes: '', createdBy: '', createdAt: '', updatedAt: '' };
    const { upcoming, past } = sortDates(
      [
        { ...base, id: 'a', title: 'Trip', date: '2027-01-10', yearly: false },
        { ...base, id: 'b', title: 'Birthday', date: '1995-11-20', yearly: true },
        { ...base, id: 'c', title: 'Concert', date: '2026-10-01', yearly: false },
        { ...base, id: 'd', title: 'Dinner', date: '2026-11-10', yearly: false },
      ],
      today,
    );
    expect(upcoming.map((d) => d.title)).toEqual(['Birthday', 'Trip']);
    expect(past.map((d) => d.title)).toEqual(['Dinner', 'Concert']);
  });

  it('labels years and countdowns', () => {
    expect(yearsLabel('birthday', 31)).toBe('Turns 31');
    expect(yearsLabel('anniversary', 3)).toBe('3rd anniversary');
    expect(yearsLabel('anniversary', 11)).toBe('11th anniversary');
    expect(yearsLabel('anniversary', 22)).toBe('22nd anniversary');
    expect(yearsLabel('holiday', null)).toBeNull();
    expect([0, 1, 12, -1, -40].map(formatCountdown)).toEqual(['Today', 'Tomorrow', '12 days', 'Yesterday', '40 days ago']);
  });
});
