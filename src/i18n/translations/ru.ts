import type { TranslationCatalog } from './en';

export const ru: TranslationCatalog = {
  errors: {
    common: {
      internal: 'Что-то пошло не так. Попробуйте ещё раз.',
      notFound: 'Не найдено.',
      forbidden: 'У вас нет прав для этого действия.',
      unauthorized: 'Войдите, чтобы продолжить.',
      badRequest: 'Не удалось обработать запрос.',
      validation: 'Некоторые поля заполнены неверно.',
      tooManyRequests: 'Слишком много запросов. Подождите и попробуйте снова.',
    },
    auth: {
      invalidCredentials: 'Неверный номер телефона или пароль.',
      phoneTaken: 'Этот номер телефона уже зарегистрирован.',
      currentPasswordWrong: 'Текущий пароль указан неверно.',
      sessionRevoked: 'Этот сеанс завершён.',
      userInactive: 'Учётная запись неактивна.',
    },
    user: {
      notFound: 'Пользователь не найден.',
      phoneTaken: 'Этот номер телефона уже используется.',
    },
    sale: {
      notFound: 'Продажа не найдена.',
      productsNotFound: 'Товары не найдены или неактивны: {ids}',
      noInventory: 'Нет складской записи для «{name}».',
      insufficientStock:
        'Недостаточно товара «{name}»: доступно {available}, запрошено {requested}.',
      insufficientStockConcurrent:
        'Недостаточно товара «{name}»: его разобрала другая продажа.',
      paidExceedsTotal: 'Оплата ({paid}) не может превышать сумму ({total}).',
      clientRequiredForDebt:
        'Выберите клиента, если оплаченная сумма меньше итога.',
      alreadyCancelled: 'Эта продажа уже отменена.',
    },
    product: { notFound: 'Товар не найден.' },
    inventory: {
      notFound: 'Складская запись не найдена.',
      insufficient: 'Недостаточно товара на складе.',
    },
    client: {
      notFound: 'Клиент не найден.',
      hasDebt: 'У клиента есть задолженность, его нельзя удалить.',
    },
    supplier: {
      notFound: 'Поставщик не найден.',
      hasDebt: 'У поставщика есть задолженность, его нельзя удалить.',
    },
    branch: { notFound: 'Филиал не найден.' },
    tenant: { notFound: 'Организация не найдена.' },
    category: { notFound: 'Категория не найдена.' },
    report: {
      notFound: 'Отчёт не найден.',
      invalidType: 'Неизвестный тип отчёта.',
      invalidFormat: 'Неподдерживаемый формат экспорта.',
    },
    subscription: {
      expired: 'Срок подписки истёк. Продлите её, чтобы продолжить.',
    },
  },

  report: {
    noData: 'Нет данных',
    titles: {
      'financial-summary': 'Финансовая сводка',
      'transactions-by-day': 'Операции по дням',
      'expenses-by-category': 'Расходы по категориям',
      'income-by-category': 'Доходы по категориям',
      inventory: 'Отчёт по складу',
      'client-balances': 'Балансы клиентов',
      'supplier-balances': 'Балансы поставщиков',
    },
    columns: {
      date: 'Дата',
      count: 'Кол-во',
      income: 'Доход',
      expenses: 'Расход',
      net: 'Итого',
      name: 'Название',
      phone: 'Телефон',
      totalAmount: 'Итого',
      totalAmountUzs: 'Итого UZS',
      totalAmountUsd: 'Итого USD',
      transactionCount: 'Операций',
      quantity: 'Количество',
      minQuantity: 'Мин. остаток',
      costPrice: 'Себестоимость',
      sellingPrice: 'Цена продажи',
      stockValue: 'Стоимость запаса',
      totalIncome: 'Всего доходов',
      totalExpenses: 'Всего расходов',
      netProfit: 'Чистая прибыль',
      totalItems: 'Всего позиций',
      totalStockValue: 'Общая стоимость запаса',
      lowStockCount: 'Позиции с низким остатком',
      createdAt: 'Создан',
    },
  },

  notifications: {
    lowStock: {
      title: '⚠️ Мало на складе',
      single: '{name} заканчивается — осталось только {quantity}',
      multi: '{count} товаров заканчиваются:\n{items}',
      item: '{name}: осталось {quantity}',
    },
    debt: {
      title: '💰 Напоминание о долге',
      single: '{client} должен {amount} — срок {dueDate}',
      multi: '{count} предстоящих долгов:\n{items}',
      item: '{client}: {amount} (срок {dueDate})',
    },
  },
};
