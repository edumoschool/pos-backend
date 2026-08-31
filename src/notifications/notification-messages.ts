/**
 * Push-notification copy, localised to the *recipient's* language.
 *
 * The strings themselves live in the shared i18n catalogue
 * (`src/i18n/translations/*`). This module only adapts them to the
 * `(args) => string` shape the notification/cron code already expects, so
 * there is a single source of truth for every translation in the backend.
 */
import { DEFAULT_LOCALE, resolveLocale } from '../i18n/i18n.constants';
import { en } from '../i18n/translations/en';
import { ru } from '../i18n/translations/ru';
import { uz } from '../i18n/translations/uz';

const catalogs = { en, uz, ru };

function fill(template: string, args: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in args ? String(args[k]) : m));
}

function catalogFor(lang: string | null | undefined) {
  return catalogs[resolveLocale(lang)] ?? catalogs[DEFAULT_LOCALE];
}

export function getLowStockMessage(lang: string | null | undefined) {
  const c = catalogFor(lang).notifications.lowStock;
  return {
    title: c.title,
    single: (name: string, quantity: number) => fill(c.single, { name, quantity }),
    multi: (count: number, itemsList: string) => fill(c.multi, { count, items: itemsList }),
    itemFormat: (name: string, quantity: number) => fill(c.item, { name, quantity }),
  };
}

export function getDebtReminderMessage(lang: string | null | undefined) {
  const c = catalogFor(lang).notifications.debt;
  return {
    title: c.title,
    single: (clientName: string, amount: string, dueDate: string) =>
      fill(c.single, { client: clientName, amount, dueDate }),
    multi: (count: number, itemsList: string) => fill(c.multi, { count, items: itemsList }),
    itemFormat: (clientName: string, amount: string, dueDate: string) =>
      fill(c.item, { client: clientName, amount, dueDate }),
  };
}
