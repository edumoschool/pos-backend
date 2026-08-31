import type { TranslationCatalog } from './en';

export const uz: TranslationCatalog = {
  errors: {
    common: {
      internal: 'Nimadir xato ketdi. Qayta urinib ko‘ring.',
      notFound: 'Topilmadi.',
      forbidden: 'Buni bajarishga ruxsatingiz yo‘q.',
      unauthorized: 'Davom etish uchun tizimga kiring.',
      badRequest: 'So‘rovni bajarib bo‘lmadi.',
      validation: 'Ba’zi maydonlar noto‘g‘ri.',
      tooManyRequests: 'So‘rovlar juda ko‘p. Biroz kuting va qayta urinib ko‘ring.',
    },
    auth: {
      invalidCredentials: 'Telefon raqami yoki parol noto‘g‘ri.',
      phoneTaken: 'Bu telefon raqami allaqachon ro‘yxatdan o‘tgan.',
      currentPasswordWrong: 'Joriy parol noto‘g‘ri.',
      sessionRevoked: 'Bu seans tizimdan chiqarilgan.',
      userInactive: 'Bu hisob faol emas.',
    },
    user: {
      notFound: 'Foydalanuvchi topilmadi.',
      phoneTaken: 'Bu telefon raqami allaqachon ishlatilyapti.',
    },
    sale: {
      notFound: 'Sotuv topilmadi.',
      productsNotFound: 'Mahsulotlar topilmadi yoki faol emas: {ids}',
      noInventory: '“{name}” uchun ombor yozuvi yo‘q.',
      insufficientStock:
        '“{name}” yetarli emas: {available} mavjud, {requested} so‘ralди.',
      insufficientStockConcurrent:
        '“{name}” yetarli emas: boshqa sotuv uni tugatdi.',
      paidExceedsTotal: 'To‘lov ({paid}) jami summadan ({total}) oshmasligi kerak.',
      clientRequiredForDebt:
        'To‘langan summa jami summadan kam bo‘lsa, mijoz tanlang.',
      alreadyCancelled: 'Bu sotuv allaqachon bekor qilingan.',
    },
    product: { notFound: 'Mahsulot topilmadi.' },
    inventory: {
      notFound: 'Ombor yozuvi topilmadi.',
      insufficient: 'Omborda yetarli mahsulot yo‘q.',
    },
    client: {
      notFound: 'Mijoz topilmadi.',
      hasDebt: 'Mijozda qarz bor, uni o‘chirib bo‘lmaydi.',
    },
    supplier: {
      notFound: 'Yetkazib beruvchi topilmadi.',
      hasDebt: 'Yetkazib beruvchida qarz bor, uni o‘chirib bo‘lmaydi.',
    },
    branch: { notFound: 'Filial topilmadi.' },
    tenant: { notFound: 'Tashkilot topilmadi.' },
    category: { notFound: 'Kategoriya topilmadi.' },
    report: {
      notFound: 'Hisobot topilmadi.',
      invalidType: 'Noma’lum hisobot turi.',
      invalidFormat: 'Qo‘llab-quvvatlanmaydigan eksport formati.',
    },
    subscription: {
      expired: 'Obuna muddati tugagan. Davom etish uchun yangilang.',
    },
  },

  report: {
    noData: 'Ma’lumot yo‘q',
    titles: {
      'financial-summary': 'Moliyaviy hisobot',
      'transactions-by-day': 'Kunlar bo‘yicha operatsiyalar',
      'expenses-by-category': 'Kategoriyalar bo‘yicha xarajatlar',
      'income-by-category': 'Kategoriyalar bo‘yicha daromadlar',
      inventory: 'Ombor hisoboti',
      'client-balances': 'Mijozlar balansi',
      'supplier-balances': 'Yetkazib beruvchilar balansi',
    },
    columns: {
      date: 'Sana',
      count: 'Soni',
      income: 'Daromad',
      expenses: 'Xarajat',
      net: 'Jami',
      name: 'Nomi',
      phone: 'Telefon',
      totalAmount: 'Jami',
      totalAmountUzs: 'Jami UZS',
      totalAmountUsd: 'Jami USD',
      transactionCount: 'Operatsiyalar',
      quantity: 'Miqdori',
      minQuantity: 'Min. qoldiq',
      costPrice: 'Tannarx',
      sellingPrice: 'Sotuv narxi',
      stockValue: 'Zaxira qiymati',
      totalIncome: 'Jami daromad',
      totalExpenses: 'Jami xarajat',
      netProfit: 'Sof foyda',
      totalItems: 'Jami pozitsiyalar',
      totalStockValue: 'Umumiy zaxira qiymati',
      lowStockCount: 'Kam qoldiqli pozitsiyalar',
      createdAt: 'Yaratilgan',
    },
  },

  notifications: {
    lowStock: {
      title: '⚠️ Kam qoldiq',
      single: '{name} kam qoldi — faqat {quantity} ta qoldi',
      multi: '{count} ta mahsulot kam qoldi:\n{items}',
      item: '{name}: {quantity} ta qoldi',
    },
    debt: {
      title: '💰 Qarz eslatmasi',
      single: '{client} — {amount} qarz, muddat: {dueDate}',
      multi: '{count} ta yaqinlashayotgan qarz:\n{items}',
      item: '{client}: {amount} (muddat: {dueDate})',
    },
  },
};
