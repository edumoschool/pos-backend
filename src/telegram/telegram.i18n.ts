export type Lang = 'en' | 'uz' | 'ru';

const t = {
  // ─── General ──────────────────────────────────────────────────────
  cancelled:    { en: '❌ Cancelled.',                uz: '❌ Bekor qilindi.',                      ru: '❌ Отменено.' },
  cancel:       { en: '❌ Cancel',                    uz: '❌ Bekor',                               ru: '❌ Отмена' },
  back:         { en: '🔙 Back',                      uz: '🔙 Orqaga',                             ru: '🔙 Назад' },
  error:        { en: '❌ An error occurred. Please try again.', uz: '❌ Xatolik yuz berdi.',       ru: '❌ Произошла ошибка.' },
  not_found:    { en: '❌ Not found.',                uz: '❌ Topilmadi.',                          ru: '❌ Не найдено.' },
  refresh:      { en: '🔄 Refresh',                   uz: '🔄 Yangilash',                          ru: '🔄 Обновить' },
  no_data:      { en: 'No data yet.',                 uz: 'Hali ma\'lumot yo\'q.',                  ru: 'Данных пока нет.' },

  // ─── Language ─────────────────────────────────────────────────────
  choose_language: { en: '🌐 Choose your language:', uz: '🌐 Tilni tanlang:',                      ru: '🌐 Выберите язык:' },
  language_set:    { en: '✅ Language set to English.', uz: '✅ Til o\'zbekchaga o\'zgartirildi.', ru: '✅ Язык изменён на русский.' },

  // ─── Auth ─────────────────────────────────────────────────────────
  not_linked: {
    en: '🔒 Your account is not linked yet.\n\nUse /start and share your phone number to connect.',
    uz: '🔒 Hisobingiz ulanmagan.\n\n/start buyrug\'ini bosing va telefon raqamingizni yuboring.',
    ru: '🔒 Аккаунт не привязан.\n\nИспользуйте /start и отправьте номер телефона.',
  },
  already_linked: {
    en: '✅ You are already linked. Use /menu to open the menu.',
    uz: '✅ Siz allaqachon ulangansiz. /menu buyrug\'ini ishlating.',
    ru: '✅ Вы уже подключены. Используйте /menu.',
  },
  link_prompt: {
    en: '👋 Hello! To get started, please share your phone number so we can link your account.',
    uz: '👋 Salom! Boshlash uchun telefon raqamingizni yuboring.',
    ru: '👋 Привет! Для начала отправьте ваш номер телефона.',
  },
  share_phone:  { en: '📱 Share Phone Number', uz: '📱 Telefon raqamni yuborish', ru: '📱 Отправить номер' },
  link_failed: {
    en: '❌ No client account found for this phone number.\nPlease contact the store to register.',
    uz: '❌ Bu telefon raqam bilan mijoz topilmadi.\nRo\'yxatdan o\'tish uchun do\'konga murojaat qiling.',
    ru: '❌ Клиент с этим номером не найден.\nОбратитесь в магазин для регистрации.',
  },
  link_success: {
    en: '✅ Linked! Welcome, *{name}*!\n\nYou will now receive notifications about your orders, debts and payments.\n\nUse the menu to check your account.',
    uz: '✅ Ulandi! Xush kelibsiz, *{name}*!\n\nEndi buyurtmalar, qarzlar va to\'lovlar haqida bildirishnomalar olasiz.\n\nHisobingizni ko\'rish uchun menyudan foydalaning.',
    ru: '✅ Привязан! Добро пожаловать, *{name}*!\n\nТеперь вы будете получать уведомления о заказах, долгах и платежах.\n\nИспользуйте меню для просмотра аккаунта.',
  },
  unlinked: {
    en: '👋 Your account has been unlinked. Use /start to reconnect.',
    uz: '👋 Hisobingiz uzildi. Qayta ulash uchun /start ni bosing.',
    ru: '👋 Аккаунт отвязан. Используйте /start для повторной привязки.',
  },

  // ─── Welcome (already linked) ─────────────────────────────────────
  welcome_back: {
    en: '👋 Welcome back, *{name}*!\n\nCheck your balance, transactions and sales below.',
    uz: '👋 Xush kelibsiz, *{name}*!\n\nQuyida balans, tranzaksiyalar va sotuvlarni ko\'ring.',
    ru: '👋 С возвращением, *{name}*!\n\nНиже вы можете просмотреть баланс, транзакции и продажи.',
  },

  // ─── Main Menu Buttons ────────────────────────────────────────────
  btn_balance:       { en: '💳 My Balance',      uz: '💳 Balansim',            ru: '💳 Мой баланс' },
  btn_transactions:  { en: '📋 My Transactions', uz: '📋 Tranzaksiyalarim',    ru: '📋 Мои транзакции' },
  btn_sales:         { en: '🛒 My Orders',        uz: '🛒 Buyurtmalarim',       ru: '🛒 Мои заказы' },
  btn_settings:      { en: '⚙️ Settings',         uz: '⚙️ Sozlamalar',          ru: '⚙️ Настройки' },
  btn_help:          { en: '❓ Help',              uz: '❓ Yordam',              ru: '❓ Помощь' },

  // ─── Balance ──────────────────────────────────────────────────────
  balance_title: {
    en: '💳 *Your Balance*\n\n👤 {name}',
    uz: '💳 *Sizning balansingiz*\n\n👤 {name}',
    ru: '💳 *Ваш баланс*\n\n👤 {name}',
  },
  balance_uzs:   { en: 'Balance (UZS)', uz: 'Balans (UZS)', ru: 'Баланс (UZS)' },
  balance_usd:   { en: 'Balance (USD)', uz: 'Balans (USD)', ru: 'Баланс (USD)' },
  debt_uzs:      { en: '💸 Debt (UZS)', uz: '💸 Qarz (UZS)', ru: '💸 Долг (UZS)' },
  debt_usd:      { en: '💸 Debt (USD)', uz: '💸 Qarz (USD)', ru: '💸 Долг (USD)' },
  no_debt:       { en: '✅ No outstanding debt',  uz: '✅ Qarz yo\'q',           ru: '✅ Долгов нет' },
  balance_note:  {
    en: '_Negative balance = you owe money. Positive = store owes you._',
    uz: '_Manfiy balans = siz qarzdorsiz. Musbat = do\'kon sizga qarzdor._',
    ru: '_Отрицательный баланс = вы должны. Положительный = магазин должен вам._',
  },

  // ─── Transactions ─────────────────────────────────────────────────
  txn_title: {
    en: '📋 *Your Recent Transactions*',
    uz: '📋 *So\'nggi tranzaksiyalaringiz*',
    ru: '📋 *Ваши последние транзакции*',
  },
  txn_empty:  { en: 'No transactions found.',     uz: 'Tranzaksiyalar topilmadi.',    ru: 'Транзакций не найдено.' },
  txn_debt:   { en: '📤 Debt',                    uz: '📤 Qarz',                      ru: '📤 Долг' },
  txn_payment:{ en: '📥 Payment',                 uz: '📥 To\'lov',                   ru: '📥 Оплата' },
  txn_more:   { en: '📋 Load more',               uz: '📋 Ko\'proq ko\'rish',          ru: '📋 Загрузить ещё' },

  // ─── Sales / Orders ───────────────────────────────────────────────
  sales_title: {
    en: '🛒 *Your Recent Orders*',
    uz: '🛒 *So\'nggi buyurtmalaringiz*',
    ru: '🛒 *Ваши последние заказы*',
  },
  sales_empty:      { en: 'No orders found.',          uz: 'Buyurtmalar topilmadi.',      ru: 'Заказов не найдено.' },
  sale_completed:   { en: '✅ Paid',                   uz: '✅ To\'langan',               ru: '✅ Оплачен' },
  sale_debt:        { en: '⚠️ Debt',                   uz: '⚠️ Qarzli',                   ru: '⚠️ Долг' },
  sale_cancelled:   { en: '❌ Cancelled',              uz: '❌ Bekor qilingan',            ru: '❌ Отменён' },
  sale_total:       { en: 'Total',                     uz: 'Jami',                        ru: 'Итого' },
  sale_paid:        { en: 'Paid',                      uz: 'To\'langan',                  ru: 'Оплачено' },
  sale_debt_amount: { en: 'Remaining debt',            uz: 'Qolgan qarz',                 ru: 'Остаток долга' },
  sale_items_count: { en: 'Items',                     uz: 'Mahsulotlar',                 ru: 'Позиции' },

  // ─── Settings ─────────────────────────────────────────────────────
  settings_title:  { en: '⚙️ *Settings*',              uz: '⚙️ *Sozlamalar*',             ru: '⚙️ *Настройки*' },
  change_language: { en: '🌐 Change Language',          uz: '🌐 Tilni o\'zgartirish',      ru: '🌐 Сменить язык' },
  unlink_btn:      { en: '🔗 Unlink Account',           uz: '🔗 Hisobni uzish',            ru: '🔗 Отвязать аккаунт' },
  confirm_unlink:  {
    en: '⚠️ Are you sure you want to unlink your account? You will no longer receive notifications.',
    uz: '⚠️ Hisobingizni uzmoqchimisiz? Endi bildirishnomalar olmaysiz.',
    ru: '⚠️ Отвязать аккаунт? Вы перестанете получать уведомления.',
  },
  yes:             { en: '✅ Yes, unlink',              uz: '✅ Ha, uzish',                ru: '✅ Да, отвязать' },
  no:              { en: '❌ No, keep it',              uz: '❌ Yo\'q',                    ru: '❌ Нет' },

  // ─── Help ─────────────────────────────────────────────────────────
  help_text: {
    en: '📖 *Help*\n\n*What this bot does:*\nThis bot keeps you informed about your account at the store.\n\n*Commands:*\n/start — Link your account\n/menu — Main menu\n/balance — View your balance & debts\n/transactions — Your payment history\n/orders — Your order history\n/settings — Language & account\n/help — This message\n\n*Notifications you receive:*\n• New order / invoice created\n• Debt created (you owe money)\n• Payment recorded (your debt decreases)\n• Debt reminders',
    uz: '📖 *Yordam*\n\n*Bu bot nima qiladi:*\nBu bot sizni do\'kondagi hisobingiz haqida xabardor qiladi.\n\n*Buyruqlar:*\n/start — Hisobni ulash\n/menu — Asosiy menyu\n/balance — Balans va qarzlarni ko\'rish\n/transactions — To\'lov tarixi\n/orders — Buyurtmalar tarixi\n/settings — Til va hisob\n/help — Ushbu xabar\n\n*Siz oladigan bildirishnomalar:*\n• Yangi buyurtma / hisob-faktura\n• Qarz yaratildi\n• To\'lov qayd etildi\n• Qarz eslatmalari',
    ru: '📖 *Помощь*\n\n*Что делает этот бот:*\nБот уведомляет вас о состоянии вашего аккаунта в магазине.\n\n*Команды:*\n/start — Привязать аккаунт\n/menu — Главное меню\n/balance — Баланс и долги\n/transactions — История платежей\n/orders — История заказов\n/settings — Язык и аккаунт\n/help — Это сообщение\n\n*Уведомления:*\n• Новый заказ / счёт\n• Создан долг\n• Записан платёж\n• Напоминание о долге',
  },

  // ─── Push Notifications (sent proactively by the system) ──────────
  notify_new_sale: {
    en: '🛒 *New Order Created*\n\n📅 {date}\n💰 Total: *{total} {currency}*\n✅ Paid: *{paid}*\n{debtLine}\n📦 Items: {items}',
    uz: '🛒 *Yangi buyurtma yaratildi*\n\n📅 {date}\n💰 Jami: *{total} {currency}*\n✅ To\'langan: *{paid}*\n{debtLine}\n📦 Mahsulotlar: {items}',
    ru: '🛒 *Создан новый заказ*\n\n📅 {date}\n💰 Итого: *{total} {currency}*\n✅ Оплачено: *{paid}*\n{debtLine}\n📦 Позиции: {items}',
  },
  notify_new_debt: {
    en: '⚠️ *New Debt*\n\n📅 {date}\n💸 Amount: *{amount} {currency}*\n📝 {description}\n\nYour current balance:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
    uz: '⚠️ *Yangi qarz*\n\n📅 {date}\n💸 Summa: *{amount} {currency}*\n📝 {description}\n\nJoriy balansingiz:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
    ru: '⚠️ *Новый долг*\n\n📅 {date}\n💸 Сумма: *{amount} {currency}*\n📝 {description}\n\nВаш текущий баланс:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
  },
  notify_payment_received: {
    en: '💵 *Payment Recorded*\n\n📅 {date}\n✅ Amount: *{amount} {currency}*\n\nUpdated balance:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
    uz: '💵 *To\'lov qayd etildi*\n\n📅 {date}\n✅ Summa: *{amount} {currency}*\n\nYangilangan balans:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
    ru: '💵 *Платёж записан*\n\n📅 {date}\n✅ Сумма: *{amount} {currency}*\n\nОбновлённый баланс:\n  UZS: *{balanceUzs}*\n  USD: *{balanceUsd}*',
  },
  notify_debt_reminder: {
    en: '🔔 *Debt Reminder*\n\nDear *{name}*, you have an outstanding balance:\n\n  💸 UZS: *{balanceUzs}*\n  💸 USD: *{balanceUsd}*\n\nPlease contact us to arrange payment.',
    uz: '🔔 *Qarz eslatmasi*\n\nHurmatli *{name}*, sizda to\'lanmagan qarz mavjud:\n\n  💸 UZS: *{balanceUzs}*\n  💸 USD: *{balanceUsd}*\n\nTo\'lov uchun biz bilan bog\'laning.',
    ru: '🔔 *Напоминание о долге*\n\nУважаемый(ая) *{name}*, у вас есть непогашенный долг:\n\n  💸 UZS: *{balanceUzs}*\n  💸 USD: *{balanceUsd}*\n\nСвяжитесь с нами для оплаты.',
  },
  debt_line_uzs: { en: '⚠️ Debt: *{amount} UZS*', uz: '⚠️ Qarz: *{amount} UZS*', ru: '⚠️ Долг: *{amount} UZS*' },
  debt_line_usd: { en: '⚠️ Debt: *{amount} USD*', uz: '⚠️ Qarz: *{amount} USD*', ru: '⚠️ Долг: *{amount} USD*' },
} as const;

export type TranslationKey = keyof typeof t;

export function i18n(
  key: TranslationKey,
  lang: Lang = 'en',
  params?: Record<string, string | number>,
): string {
  const entry = t[key];
  if (!entry) return key;
  let text = (entry as any)[lang] ?? (entry as any).en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export default t;
