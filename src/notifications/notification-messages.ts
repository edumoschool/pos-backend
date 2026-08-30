type Language = 'uz' | 'en' | 'ru';

const lowStockMessages: Record<Language, {
  title: string;
  single: (productName: string, quantity: number) => string;
  multi: (count: number, itemsList: string) => string;
  itemFormat: (productName: string, quantity: number) => string;
}> = {
  en: {
    title: '⚠️ Low Stock Alert',
    single: (name, qty) => `${name} is running low — only ${qty} left`,
    multi: (count, items) => `${count} products are running low:\n${items}`,
    itemFormat: (name, qty) => `${name}: ${qty} left`,
  },
  uz: {
    title: '⚠️ Kam qoldiq',
    single: (name, qty) => `${name} kam qoldi — faqat ${qty} ta qoldi`,
    multi: (count, items) => `${count} ta mahsulot kam qoldi:\n${items}`,
    itemFormat: (name, qty) => `${name}: ${qty} ta qoldi`,
  },
  ru: {
    title: '⚠️ Мало на складе',
    single: (name, qty) => `${name} заканчивается — осталось только ${qty}`,
    multi: (count, items) => `${count} товаров заканчиваются:\n${items}`,
    itemFormat: (name, qty) => `${name}: осталось ${qty}`,
  },
};

const debtReminderMessages: Record<Language, {
  title: string;
  single: (clientName: string, amount: string, dueDate: string) => string;
  multi: (count: number, itemsList: string) => string;
  itemFormat: (clientName: string, amount: string, dueDate: string) => string;
}> = {
  en: {
    title: '💰 Debt Reminder',
    single: (client, amount, date) => `${client} owes ${amount} — due ${date}`,
    multi: (count, items) => `${count} upcoming debts:\n${items}`,
    itemFormat: (client, amount, date) => `${client}: ${amount} (due ${date})`,
  },
  uz: {
    title: '💰 Qarz eslatmasi',
    single: (client, amount, date) => `${client} — ${amount} qarz, muddat: ${date}`,
    multi: (count, items) => `${count} ta yaqinlashayotgan qarz:\n${items}`,
    itemFormat: (client, amount, date) => `${client}: ${amount} (muddat: ${date})`,
  },
  ru: {
    title: '💰 Напоминание о долге',
    single: (client, amount, date) => `${client} должен ${amount} — срок: ${date}`,
    multi: (count, items) => `${count} предстоящих долгов:\n${items}`,
    itemFormat: (client, amount, date) => `${client}: ${amount} (срок: ${date})`,
  },
};

export function getLowStockMessage(lang: string | null | undefined) {
  return lowStockMessages[(lang as Language) ?? 'en'] ?? lowStockMessages.en;
}

export function getDebtReminderMessage(lang: string | null | undefined) {
  return debtReminderMessages[(lang as Language) ?? 'en'] ?? debtReminderMessages.en;
}
