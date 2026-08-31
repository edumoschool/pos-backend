/**
 * English message catalogue — the source of truth for keys.
 * `uz.ts` and `ru.ts` are typed against this shape, so a missing key
 * anywhere is a compile error.
 *
 * Placeholders use `{name}` syntax and are filled by I18nService.translate().
 */
export const en = {
  errors: {
    common: {
      internal: 'Something went wrong. Please try again.',
      notFound: 'Not found.',
      forbidden: 'You do not have permission to do this.',
      unauthorized: 'Please sign in to continue.',
      badRequest: 'The request could not be processed.',
      validation: 'Some fields are invalid.',
      tooManyRequests: 'Too many requests. Slow down and try again.',
    },
    auth: {
      invalidCredentials: 'Invalid phone number or password.',
      phoneTaken: 'That phone number is already registered.',
      currentPasswordWrong: 'Your current password is incorrect.',
      sessionRevoked: 'This session has been signed out.',
      userInactive: 'This account is inactive.',
    },
    user: {
      notFound: 'User not found.',
      phoneTaken: 'That phone number is already in use.',
    },
    sale: {
      notFound: 'Sale not found.',
      productsNotFound: 'Products not found or inactive: {ids}',
      noInventory: 'No inventory record for "{name}".',
      insufficientStock:
        'Not enough stock for "{name}": {available} available, {requested} requested.',
      insufficientStockConcurrent:
        'Not enough stock for "{name}": another sale used it up.',
      paidExceedsTotal: 'Paid amount ({paid}) cannot exceed the total ({total}).',
      clientRequiredForDebt:
        'Select a client when the paid amount is less than the total.',
      alreadyCancelled: 'This sale is already cancelled.',
    },
    product: { notFound: 'Product not found.' },
    inventory: {
      notFound: 'Inventory record not found.',
      insufficient: 'Not enough stock.',
    },
    client: {
      notFound: 'Client not found.',
      hasDebt: 'This client has an outstanding balance and cannot be deleted.',
    },
    supplier: {
      notFound: 'Supplier not found.',
      hasDebt: 'This supplier has an outstanding balance and cannot be deleted.',
    },
    branch: { notFound: 'Branch not found.' },
    tenant: { notFound: 'Business not found.' },
    category: { notFound: 'Category not found.' },
    report: {
      notFound: 'Report not found.',
      invalidType: 'Unknown report type.',
      invalidFormat: 'Unsupported export format.',
    },
    subscription: {
      expired: 'Your subscription has expired. Renew it to continue.',
    },
  },

  report: {
    noData: 'No data available',
    titles: {
      'financial-summary': 'Financial summary',
      'transactions-by-day': 'Transactions by day',
      'expenses-by-category': 'Expenses by category',
      'income-by-category': 'Income by category',
      inventory: 'Inventory report',
      'client-balances': 'Client balances',
      'supplier-balances': 'Supplier balances',
    },
    columns: {
      date: 'Date',
      count: 'Count',
      income: 'Income',
      expenses: 'Expenses',
      net: 'Net',
      name: 'Name',
      phone: 'Phone',
      totalAmount: 'Total',
      totalAmountUzs: 'Total UZS',
      totalAmountUsd: 'Total USD',
      transactionCount: 'Transactions',
      quantity: 'Quantity',
      minQuantity: 'Min quantity',
      costPrice: 'Cost price',
      sellingPrice: 'Selling price',
      stockValue: 'Stock value',
      totalIncome: 'Total income',
      totalExpenses: 'Total expenses',
      netProfit: 'Net profit',
      totalItems: 'Total items',
      totalStockValue: 'Total stock value',
      lowStockCount: 'Low-stock items',
      createdAt: 'Created',
    },
  },

  notifications: {
    lowStock: {
      title: '⚠️ Low stock alert',
      single: '{name} is running low — only {quantity} left',
      multi: '{count} products are running low:\n{items}',
      item: '{name}: {quantity} left',
    },
    debt: {
      title: '💰 Debt reminder',
      single: '{client} owes {amount} — due {dueDate}',
      multi: '{count} upcoming debts:\n{items}',
      item: '{client}: {amount} (due {dueDate})',
    },
  },
};

export type TranslationCatalog = typeof en;
