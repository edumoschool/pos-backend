import { Logger } from '@nestjs/common';
import { Update, Ctx, Start, Help, Command, On, Action } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { TelegramService } from './telegram.service';
import { i18n, Lang } from './telegram.i18n';

interface TgContext extends Context {
  match?: RegExpExecArray;
}

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);
  /** Track last bot-sent message per chat so we can delete before sending a new one */
  private lastMsg = new Map<string, number>();

  constructor(private readonly svc: TelegramService) {}

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════

  private chatId(ctx: TgContext): string {
    return String(ctx.chat?.id ?? ctx.from?.id);
  }

  private async lang(ctx: TgContext): Promise<Lang> {
    return this.svc.getLanguage(this.chatId(ctx));
  }

  private async auth(ctx: TgContext): Promise<{ userId: string; tenantId: string; role: string } | null> {
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    if (!tg?.userId || !tg?.tenantId) {
      const l = await this.lang(ctx);
      await this.send(ctx, i18n('not_logged_in', l));
      return null;
    }
    const role = await this.svc.getUserRole(chatId) ?? 'seller';
    return { userId: tg.userId, tenantId: tg.tenantId, role };
  }

  private isAdmin(role: string): boolean {
    return role === 'owner' || role === 'super_admin';
  }

  /** Block sellers from admin-only commands */
  private async adminOnly(ctx: TgContext): Promise<{ userId: string; tenantId: string; role: string } | null> {
    const a = await this.auth(ctx);
    if (!a) return null;
    if (!this.isAdmin(a.role)) {
      const l = await this.lang(ctx);
      await this.send(ctx, i18n('not_found', l));
      return null;
    }
    return a;
  }

  /** Delete previous bot message + triggering message, send new one, track its id */
  private async send(ctx: TgContext, text: string, extra?: any) {
    const chatId = this.chatId(ctx);
    // Delete old bot message
    const prevId = this.lastMsg.get(chatId);
    if (prevId) {
      try { await ctx.telegram.deleteMessage(Number(chatId), prevId); } catch {}
    }
    // Delete triggering message (user text / contact / callback message)
    try { await ctx.deleteMessage(); } catch {}
    const sent = await ctx.reply(text, { parse_mode: 'Markdown' as const, ...extra });
    this.lastMsg.set(chatId, sent.message_id);
    return sent;
  }

  private fmt(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  private esc(text: string): string {
    if (!text) return '';
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  private mainMenu(l: Lang, role = 'seller') {
    const rows: string[][] = [];
    if (this.isAdmin(role)) {
      rows.push([i18n('btn_dashboard', l), i18n('btn_pos', l)]);
      rows.push([i18n('btn_products', l), i18n('btn_inventory', l)]);
      rows.push([i18n('btn_clients', l), i18n('btn_sales', l)]);
      rows.push([i18n('btn_branches', l), i18n('btn_categories', l)]);
      rows.push([i18n('btn_transactions', l), i18n('btn_debts', l)]);
    } else {
      // Seller: POS, products, inventory, clients, sales
      rows.push([i18n('btn_pos', l), i18n('btn_products', l)]);
      rows.push([i18n('btn_inventory', l), i18n('btn_clients', l)]);
      rows.push([i18n('btn_sales', l), i18n('btn_categories', l)]);
    }
    rows.push([i18n('btn_settings', l), i18n('btn_help', l)]);
    return Markup.keyboard(rows).resize();
  }

  // ══════════════════════════════════════════════════════════════════
  // /start
  // ══════════════════════════════════════════════════════════════════

  @Start()
  async onStart(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    await this.svc.findOrCreateTelegramUser(chatId);
    const l = await this.lang(ctx);

    if (await this.svc.isAuthenticated(chatId)) {
      const role = await this.svc.getUserRole(chatId) ?? 'seller';
      await this.send(ctx, i18n('welcome_auth', l), this.mainMenu(l, role));
    } else {
      await this.send(ctx, i18n('welcome_new', l));
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // /help
  // ══════════════════════════════════════════════════════════════════

  @Help()
  async onHelp(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('help_text', l));
  }

  // ══════════════════════════════════════════════════════════════════
  // /lang — language selection
  // ══════════════════════════════════════════════════════════════════

  @Command('lang')
  async onLang(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('choose_language', l), Markup.inlineKeyboard([
      [Markup.button.callback('🇺🇿 O\'zbek', 'set_lang:uz')],
      [Markup.button.callback('🇬🇧 English', 'set_lang:en')],
      [Markup.button.callback('🇷🇺 Русский', 'set_lang:ru')],
    ]));
  }

  @Action(/^set_lang:(.+)$/)
  async onSetLang(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const lang = ctx.match![1] as Lang;
    const chatId = this.chatId(ctx);
    await this.svc.setLanguage(chatId, lang);
    const isAuth = await this.svc.isAuthenticated(chatId);
    const role = isAuth ? (await this.svc.getUserRole(chatId) ?? 'seller') : 'seller';
    await this.send(ctx, i18n('language_set', lang), isAuth ? this.mainMenu(lang, role) : undefined);
  }

  // ══════════════════════════════════════════════════════════════════
  // /login
  // ══════════════════════════════════════════════════════════════════

  @Command('login')
  async onLogin(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const l = await this.lang(ctx);
    if (await this.svc.isAuthenticated(chatId)) {
      await this.send(ctx, i18n('already_logged_in', l));
      return;
    }
    await this.svc.findOrCreateTelegramUser(chatId);
    await this.svc.setState(chatId, 'awaiting_phone');
    await this.send(ctx, i18n('login_prompt', l), Markup.keyboard([
      [Markup.button.contactRequest(i18n('share_phone', l))],
      [i18n('cancel', l)],
    ]).resize().oneTime());
  }

  @Command('logout')
  async onLogout(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const l = await this.lang(ctx);
    await this.svc.logout(chatId);
    await this.send(ctx, i18n('logged_out', l), Markup.removeKeyboard());
  }

  @On('contact')
  async onContact(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    if (tg?.state !== 'awaiting_phone') return;
    const contact = (ctx.message as any)?.contact;
    if (!contact?.phone_number) return;
    await this.handlePhoneLogin(ctx, chatId, contact.phone_number);
  }

  private async handlePhoneLogin(ctx: TgContext, chatId: string, phone: string) {
    const l = await this.lang(ctx);
    const user = await this.svc.linkUserByPhone(chatId, phone);
    if (!user) {
      await this.svc.setState(chatId, 'idle');
      await this.send(ctx, i18n('login_failed', l), Markup.removeKeyboard());
      return;
    }
    const role = (user as any).role ?? 'seller';
    await this.send(ctx, i18n('login_success', l, {
      name: this.esc(user.fullName),
      tenant: this.esc((user as any).tenant?.name ?? '—'),
      phone: user.phone ?? '',
    }), this.mainMenu(l, role));
  }

  // ══════════════════════════════════════════════════════════════════
  // /settings
  // ══════════════════════════════════════════════════════════════════

  @Command('settings')
  async onSettings(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('settings_title', l), Markup.inlineKeyboard([
      [Markup.button.callback(i18n('change_language', l), 'settings_lang')],
      [Markup.button.callback(i18n('logout_btn', l), 'settings_logout')],
    ]));
  }

  @Action('settings_lang')
  async onSettingsLang(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.onLang(ctx);
  }

  @Action('settings_logout')
  async onSettingsLogout(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.onLogout(ctx);
  }

  // ══════════════════════════════════════════════════════════════════
  // /dashboard
  // ══════════════════════════════════════════════════════════════════

  @Command('dashboard')
  @Action('go_dashboard')
  async onDashboard(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx);
    if (!a) return;
    const l = await this.lang(ctx);
    const { financialSummary, inventoryReport } = await this.svc.getDashboard(a.tenantId);

    const msg =
      `${i18n('dashboard_title', l)}\n\n` +
      `${i18n('finance_label', l)}\n` +
      `  ${i18n('total_income', l)}: ${this.fmt(financialSummary.totalIncome)}\n` +
      `  ${i18n('expenses', l)}: ${this.fmt(financialSummary.totalExpenses)}\n` +
      `  ${i18n('net_profit', l)}: ${this.fmt(financialSummary.netProfit)}\n\n` +
      `📦 Inventory\n` +
      `  Items: ${inventoryReport.totalItems} | Low stock: ${inventoryReport.lowStockCount}`;

    await this.send(ctx, msg, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('refresh', l), 'go_dashboard')],
      [
        Markup.button.callback(i18n('btn_sales', l), 'cmd_sales_report'),
        Markup.button.callback(i18n('btn_finance', l), 'cmd_financial'),
      ],
      [
        Markup.button.callback(i18n('btn_debts', l), 'cmd_debts'),
        Markup.button.callback('🏆 Top', 'cmd_top_products'),
      ],
    ]));
  }

  // ══════════════════════════════════════════════════════════════════
  // SALES REPORT
  // ══════════════════════════════════════════════════════════════════

  @Command('sales_report')
  @Action('cmd_sales_report')
  async onSalesReport(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx);
    if (!a) return;
    const l = await this.lang(ctx);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = await this.svc.getSalesSummary(a.tenantId, today.toISOString());

    await this.send(ctx,
      `${i18n('sales_report_today', l)}\n\n` +
      `${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n` +
      `${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n` +
      `${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(i18n('this_week', l), 'sales_week'),
          Markup.button.callback(i18n('this_month', l), 'sales_month'),
        ],
        [Markup.button.callback('🏆 Top', 'cmd_top_products')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]),
    );
  }

  @Action('sales_week')
  async onSalesWeek(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    const s = await this.svc.getSalesSummary(a.tenantId, from.toISOString());
    await this.send(ctx,
      `${i18n('sales_report_week', l)}\n\n${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_sales_report')]]),
    );
  }

  @Action('sales_month')
  async onSalesMonth(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const s = await this.svc.getSalesSummary(a.tenantId, from.toISOString());
    await this.send(ctx,
      `${i18n('sales_report_month', l)}\n\n${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_sales_report')]]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // FINANCIAL REPORT
  // ══════════════════════════════════════════════════════════════════

  @Command('financial')
  @Action('cmd_financial')
  async onFinancial(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = await this.svc.getFinancialSummary(a.tenantId, today.toISOString());
    await this.send(ctx,
      `${i18n('financial_today', l)}\n\n` +
      `${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n` +
      `${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n━━━━━━━━━━━━━━━━\n` +
      `${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(i18n('this_week', l), 'fin_week'),
          Markup.button.callback(i18n('this_month', l), 'fin_month'),
        ],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]),
    );
  }

  @Action('fin_week')
  async onFinWeek(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    const s = await this.svc.getFinancialSummary(a.tenantId, from.toISOString());
    await this.send(ctx,
      `${i18n('financial_week', l)}\n\n${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_financial')]]),
    );
  }

  @Action('fin_month')
  async onFinMonth(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const s = await this.svc.getFinancialSummary(a.tenantId, from.toISOString());
    await this.send(ctx,
      `${i18n('financial_month', l)}\n\n${i18n('total_income', l)}: *${this.fmt(s.totalIncome)}*\n${i18n('expenses', l)}: *${this.fmt(s.totalExpenses)}*\n${i18n('net_profit', l)}: *${this.fmt(s.netProfit)}*`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_financial')]]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // TOP PRODUCTS / SELLERS
  // ══════════════════════════════════════════════════════════════════

  @Command('top_products')
  @Action('cmd_top_products')
  async onTopProducts(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const products = await this.svc.getTopProducts(a.tenantId);
    if (!products.length) { await this.send(ctx, i18n('no_data', l)); return; }
    const lines = products.map((p, i) => {
      const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const qty = (p as any).inventory?.[0]?.quantity ?? 0;
      return `${m} *${this.esc(p.name)}*\n   Stock: ${this.fmt(Number(qty))}`;
    });
    await this.send(ctx, `${i18n('top_products_title', l)}\n\n${lines.join('\n\n')}`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'go_dashboard')]]),
    );
  }

  @Command('top_sellers')
  @Action('cmd_top_sellers')
  async onTopSellers(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const sellers = await this.svc.getTopProducts(a.tenantId);
    if (!sellers.length) { await this.send(ctx, i18n('no_data', l)); return; }
    const lines = (sellers as any[]).map((s, i) => {
      const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${m} *${this.esc(s.fullName ?? s.name)}*`;
    });
    await this.send(ctx, `${i18n('top_sellers_title', l)}\n\n${lines.join('\n\n')}`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'go_dashboard')]]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // PRODUCTS — List / View / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('products')
  @Action('cmd_products')
  async onProducts(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const products = await this.svc.getProducts(a.tenantId);
    const admin = this.isAdmin(a.role);
    if (!products.length) {
      const emptyBtns: any[][] = [];
      if (admin) emptyBtns.push([Markup.button.callback(i18n('add', l), 'product_add')]);
      emptyBtns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
      await this.send(ctx, i18n('products_empty', l), Markup.inlineKeyboard(emptyBtns));
      return;
    }
    const list = products.slice(0, 20).map((p, i) =>
      `${i + 1}. *${this.esc(p.name)}* — ${this.fmt(Number(p.sellingPrice))}`,
    );
    const btns: any[][] = admin
      ? products.slice(0, 20).map(p => [Markup.button.callback(`📦 ${p.name.substring(0, 30)}`, `pv:${p.id}`)])
      : [];
    if (admin) {
      btns.push([
        Markup.button.callback(i18n('add', l), 'product_add'),
        Markup.button.callback(i18n('search', l), 'product_search'),
      ]);
    } else {
      btns.push([Markup.button.callback(i18n('search', l), 'product_search')]);
    }
    btns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
    await this.send(ctx, `${i18n('products_title', l)}\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
  }

  @Action(/^pv:(.+)$/)
  async onProductView(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      const p = await this.svc.getProduct(a.tenantId, ctx.match![1]);
      await this.send(ctx,
        `${i18n('product_detail', l)}\n\n` +
        `${i18n('product_name', l)}: *${this.esc(p.name)}*\n` +
        `${i18n('selling_price', l)}: *${this.fmt(Number(p.sellingPrice))}*\n` +
        `${i18n('cost_price', l)}: ${p.costPrice ? this.fmt(Number(p.costPrice)) : '—'}\n` +
        `💱 ${(p as any).currency || 'UZS'}\n` +
        `${i18n('stock', l)}: ${(p as any).inventory?.quantity ?? '—'}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(i18n('edit', l), `pe:${p.id}`),
            Markup.button.callback(i18n('delete_btn', l), `pd:${p.id}`),
          ],
          [Markup.button.callback(i18n('back', l), 'cmd_products')],
        ]),
      );
    } catch { await this.send(ctx, i18n('not_found', l)); }
  }

  // ─── Product Create ───────────────────────────────────────────────
  @Action('product_add')
  async onProductAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'product_name', {});
    await this.send(ctx, i18n('enter_name', l));
  }

  // ─── Product Edit ─────────────────────────────────────────────────
  @Action(/^pe:(.+)$/)
  async onProductEdit(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const id = ctx.match![1];
    await this.send(ctx, `${i18n('edit', l)} — ${i18n('select_action', l)}`, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('product_name', l), `pef:${id}:name`)],
      [Markup.button.callback(i18n('selling_price', l), `pef:${id}:sellingPrice`)],
      [Markup.button.callback(i18n('cost_price', l), `pef:${id}:costPrice`)],
      [Markup.button.callback(i18n('back', l), `pv:${id}`)],
    ]));
  }

  @Action(/^pef:(.+):(.+)$/)
  async onProductEditField(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const [id, field] = [ctx.match![1], ctx.match![2]];
    await this.svc.setState(this.chatId(ctx), 'product_edit', { entityId: id, field });
    const prompt = field === 'name' ? i18n('enter_name', l) : field === 'sellingPrice' ? i18n('enter_selling_price', l) : i18n('enter_cost_price', l);
    await this.send(ctx, prompt);
  }

  // ─── Product Delete ───────────────────────────────────────────────
  @Action(/^pd:(.+)$/)
  async onProductDelete(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('confirm_delete', l), Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('yes', l), `pdc:${ctx.match![1]}`),
        Markup.button.callback(i18n('no', l), `pv:${ctx.match![1]}`),
      ],
    ]));
  }

  @Action(/^pdc:(.+)$/)
  async onProductDeleteConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      await this.svc.deleteProduct(a.tenantId, ctx.match![1]);
      await this.send(ctx, i18n('deleted', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('back', l), 'cmd_products')],
      ]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }

  // ─── Product Search ───────────────────────────────────────────────
  @Action('product_search')
  async onProductSearch(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'product_search', {});
    await this.send(ctx, i18n('search_products', l));
  }

  // ══════════════════════════════════════════════════════════════════
  // CLIENTS — List / View / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('clients')
  @Action('cmd_clients')
  async onClients(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const clients = await this.svc.getClients(a.tenantId);
    if (!clients.length) {
      await this.send(ctx, i18n('clients_empty', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('add', l), 'client_add')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]));
      return;
    }
    const list = clients.slice(0, 20).map((c: any, i) =>
      `${i + 1}. *${this.esc(c.fullName)}* — 📞 ${c.phone || '—'}`,
    );
    const btns = clients.slice(0, 20).map((c: any) =>
      [Markup.button.callback(`👤 ${c.fullName.substring(0, 30)}`, `cv:${c.id}`)],
    );
    btns.push([Markup.button.callback(i18n('add', l), 'client_add')]);
    btns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
    await this.send(ctx, `${i18n('clients_title', l)}\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
  }

  @Action(/^cv:(.+)$/)
  async onClientView(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      const c = await this.svc.getClient(a.tenantId, ctx.match![1]) as any;
      await this.send(ctx,
        `${i18n('client_detail', l)}\n\n` +
        `${i18n('product_name', l)}: *${this.esc(c.fullName)}*\n` +
        `📞: ${c.phone || '—'}\n📍: ${c.address || '—'}\n📝: ${c.notes || '—'}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(i18n('edit', l), `ce:${c.id}`),
            Markup.button.callback(i18n('delete_btn', l), `cd:${c.id}`),
          ],
          [Markup.button.callback(i18n('back', l), 'cmd_clients')],
        ]),
      );
    } catch { await this.send(ctx, i18n('not_found', l)); }
  }

  @Action('client_add')
  async onClientAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.auth(ctx);
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'client_name', {});
    await this.send(ctx, i18n('enter_fullname', l));
  }

  @Action(/^ce:(.+)$/)
  async onClientEdit(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const id = ctx.match![1];
    await this.send(ctx, `${i18n('edit', l)} — ${i18n('select_action', l)}`, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('product_name', l), `cef:${id}:fullName`)],
      [Markup.button.callback('📞', `cef:${id}:phone`)],
      [Markup.button.callback('📍', `cef:${id}:address`)],
      [Markup.button.callback(i18n('back', l), `cv:${id}`)],
    ]));
  }

  @Action(/^cef:(.+):(.+)$/)
  async onClientEditField(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const [id, field] = [ctx.match![1], ctx.match![2]];
    await this.svc.setState(this.chatId(ctx), 'client_edit', { entityId: id, field });
    const prompt = field === 'fullName' ? i18n('enter_fullname', l) : field === 'phone' ? i18n('enter_phone', l) : i18n('enter_address', l);
    await this.send(ctx, prompt);
  }

  @Action(/^cd:(.+)$/)
  async onClientDelete(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('confirm_delete', l), Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('yes', l), `cdc:${ctx.match![1]}`),
        Markup.button.callback(i18n('no', l), `cv:${ctx.match![1]}`),
      ],
    ]));
  }

  @Action(/^cdc:(.+)$/)
  async onClientDeleteConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      await this.svc.deleteClient(a.tenantId, ctx.match![1]);
      await this.send(ctx, i18n('deleted', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_clients')]]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }

  // ══════════════════════════════════════════════════════════════════
  // BRANCHES — List / View / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('branches')
  @Action('cmd_branches')
  async onBranches(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const branches = await this.svc.getBranches(a.tenantId);
    if (!branches.length) {
      await this.send(ctx, i18n('branches_empty', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('add', l), 'branch_add')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]));
      return;
    }
    const list = branches.map((b: any, i) =>
      `${i + 1}. *${this.esc(b.name)}*${b.address ? `\n   📍 ${this.esc(b.address)}` : ''}`,
    );
    const btns = branches.map((b: any) =>
      [Markup.button.callback(`🏢 ${b.name.substring(0, 30)}`, `bv:${b.id}`)],
    );
    btns.push([Markup.button.callback(i18n('add', l), 'branch_add')]);
    btns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
    await this.send(ctx, `${i18n('branches_title', l)}\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
  }

  @Action(/^bv:(.+)$/)
  async onBranchView(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      const b = await this.svc.getBranch(a.tenantId, ctx.match![1]) as any;
      await this.send(ctx,
        `${i18n('branch_detail', l)}\n\n` +
        `${i18n('product_name', l)}: *${this.esc(b.name)}*\n📍: ${b.address || '—'}\n📞: ${b.phone || '—'}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(i18n('edit', l), `be:${b.id}`),
            Markup.button.callback(i18n('delete_btn', l), `bd:${b.id}`),
          ],
          [Markup.button.callback(i18n('back', l), 'cmd_branches')],
        ]),
      );
    } catch { await this.send(ctx, i18n('not_found', l)); }
  }

  @Action('branch_add')
  async onBranchAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.auth(ctx);
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'branch_name', {});
    await this.send(ctx, i18n('enter_name', l));
  }

  @Action(/^be:(.+)$/)
  async onBranchEdit(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const id = ctx.match![1];
    await this.send(ctx, `${i18n('edit', l)} — ${i18n('select_action', l)}`, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('product_name', l), `bef:${id}:name`)],
      [Markup.button.callback('📍', `bef:${id}:address`)],
      [Markup.button.callback('📞', `bef:${id}:phone`)],
      [Markup.button.callback(i18n('back', l), `bv:${id}`)],
    ]));
  }

  @Action(/^bef:(.+):(.+)$/)
  async onBranchEditField(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const [id, field] = [ctx.match![1], ctx.match![2]];
    await this.svc.setState(this.chatId(ctx), 'branch_edit', { entityId: id, field });
    const prompt = field === 'name' ? i18n('enter_name', l) : field === 'address' ? i18n('enter_address', l) : i18n('enter_phone', l);
    await this.send(ctx, prompt);
  }

  @Action(/^bd:(.+)$/)
  async onBranchDelete(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('confirm_delete', l), Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('yes', l), `bdc:${ctx.match![1]}`),
        Markup.button.callback(i18n('no', l), `bv:${ctx.match![1]}`),
      ],
    ]));
  }

  @Action(/^bdc:(.+)$/)
  async onBranchDeleteConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      await this.svc.deleteBranch(a.tenantId, ctx.match![1]);
      await this.send(ctx, i18n('deleted', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_branches')]]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }

  // ══════════════════════════════════════════════════════════════════
  // CATEGORIES — List / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('categories')
  @Action('cmd_categories')
  async onCategories(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const cats = await this.svc.getCategories(a.tenantId);
    if (!cats.length) {
      await this.send(ctx, i18n('categories_empty', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('add', l), 'cat_add')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]));
      return;
    }
    const list = cats.map((c: any, i) => `${i + 1}. *${this.esc(c.name)}*${c.description ? ` — ${this.esc(c.description)}` : ''}`);
    const btns = cats.map((c: any) =>
      [Markup.button.callback(`📂 ${c.name.substring(0, 30)}`, `catv:${c.id}`)],
    );
    btns.push([Markup.button.callback(i18n('add', l), 'cat_add')]);
    btns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
    await this.send(ctx, `${i18n('categories_title', l)}\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
  }

  @Action(/^catv:(.+)$/)
  async onCategoryView(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      const c = await this.svc.getCategory(a.tenantId, ctx.match![1]) as any;
      await this.send(ctx,
        `📂 *${this.esc(c.name)}*\n${c.description ? `📝 ${this.esc(c.description)}` : ''}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(i18n('edit', l), `cate:${c.id}`),
            Markup.button.callback(i18n('delete_btn', l), `catd:${c.id}`),
          ],
          [Markup.button.callback(i18n('back', l), 'cmd_categories')],
        ]),
      );
    } catch { await this.send(ctx, i18n('not_found', l)); }
  }

  @Action('cat_add')
  async onCategoryAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.auth(ctx);
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'cat_name', {});
    await this.send(ctx, i18n('enter_name', l));
  }

  @Action(/^cate:(.+)$/)
  async onCategoryEdit(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const id = ctx.match![1];
    await this.send(ctx, `${i18n('edit', l)} — ${i18n('select_action', l)}`, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('product_name', l), `catef:${id}:name`)],
      [Markup.button.callback('📝', `catef:${id}:description`)],
      [Markup.button.callback(i18n('back', l), `catv:${id}`)],
    ]));
  }

  @Action(/^catef:(.+):(.+)$/)
  async onCategoryEditField(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const [id, field] = [ctx.match![1], ctx.match![2]];
    await this.svc.setState(this.chatId(ctx), 'cat_edit', { entityId: id, field });
    await this.send(ctx, field === 'name' ? i18n('enter_name', l) : i18n('enter_description', l));
  }

  @Action(/^catd:(.+)$/)
  async onCategoryDelete(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('confirm_delete', l), Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('yes', l), `catdc:${ctx.match![1]}`),
        Markup.button.callback(i18n('no', l), `catv:${ctx.match![1]}`),
      ],
    ]));
  }

  @Action(/^catdc:(.+)$/)
  async onCategoryDeleteConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    try {
      await this.svc.deleteCategory(a.tenantId, ctx.match![1]);
      await this.send(ctx, i18n('deleted', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_categories')]]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }

  // ══════════════════════════════════════════════════════════════════
  // INVENTORY — List / Low Stock / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('inventory')
  @Action('cmd_inventory')
  async onInventory(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const items = await this.svc.getInventory(a.tenantId);
    if (!items.length) {
      await this.send(ctx, i18n('inventory_empty', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('add', l), 'inv_add')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]));
      return;
    }
    const list = (items as any[]).slice(0, 20).map((item, i) =>
      `${i + 1}. *${this.esc(item.product?.name ?? '—')}* — ${i18n('stock', l)}: ${Number(item.quantity)}/${Number(item.minQuantity)}`,
    );
    const btns = (items as any[]).slice(0, 20).map(item =>
      [Markup.button.callback(`📋 ${(item.product?.name ?? '—').substring(0, 30)}`, `invv:${item.id}`)],
    );
    btns.push([
      Markup.button.callback(i18n('add', l), 'inv_add'),
      Markup.button.callback('⚠️ Low', 'cmd_low_stock'),
    ]);
    btns.push([Markup.button.callback(i18n('back', l), 'go_dashboard')]);
    await this.send(ctx, `${i18n('inventory_title', l)}\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
  }

  @Command('low_stock')
  @Action('cmd_low_stock')
  async onLowStock(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const items = await this.svc.getLowStock(a.tenantId);
    if (!items.length) {
      await this.send(ctx, i18n('low_stock_ok', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_inventory')]]));
      return;
    }
    const list = items.slice(0, 20).map((item: any, i) =>
      `${i + 1}. ⚠️ *${this.esc(item.product?.name ?? '—')}*\n   ${i18n('stock', l)}: ${Number(item.quantity)} / ${i18n('min_stock', l)}: ${Number(item.minQuantity)}`,
    );
    await this.send(ctx, `${i18n('low_stock_title', l)} (${items.length})\n\n${list.join('\n\n')}`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_inventory')]]),
    );
  }

  @Action(/^invv:(.+)$/)
  async onInventoryView(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    try {
      const item = await this.svc.getInventoryItem(ctx.match![1]) as any;
      await this.send(ctx,
        `📋 *${this.esc(item.product?.name ?? '—')}*\n` +
        `${i18n('stock', l)}: *${Number(item.quantity)}*\n` +
        `${i18n('min_stock', l)}: *${Number(item.minQuantity)}*`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(i18n('edit', l), `inve:${item.id}`),
            Markup.button.callback(i18n('delete_btn', l), `invd:${item.id}`),
          ],
          [Markup.button.callback(i18n('back', l), 'cmd_inventory')],
        ]),
      );
    } catch { await this.send(ctx, i18n('not_found', l)); }
  }

  @Action('inv_add')
  async onInventoryAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const products = await this.svc.getProducts(a.tenantId);
    if (!products.length) { await this.send(ctx, i18n('products_empty', l)); return; }
    const btns = products.slice(0, 20).map(p =>
      [Markup.button.callback(p.name.substring(0, 40), `inv_prod:${p.id}`)],
    );
    btns.push([Markup.button.callback(i18n('cancel', l), 'cmd_inventory')]);
    await this.send(ctx, i18n('select_product', l), Markup.inlineKeyboard(btns));
  }

  @Action(/^inv_prod:(.+)$/)
  async onInventorySelectProduct(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'inv_qty', { productId: ctx.match![1] });
    await this.send(ctx, i18n('enter_quantity', l));
  }

  @Action(/^inve:(.+)$/)
  async onInventoryEdit(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const id = ctx.match![1];
    await this.send(ctx, `${i18n('edit', l)} — ${i18n('select_action', l)}`, Markup.inlineKeyboard([
      [Markup.button.callback(i18n('stock', l), `invef:${id}:quantity`)],
      [Markup.button.callback(i18n('min_stock', l), `invef:${id}:minQuantity`)],
      [Markup.button.callback(i18n('back', l), `invv:${id}`)],
    ]));
  }

  @Action(/^invef:(.+):(.+)$/)
  async onInventoryEditField(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const [id, field] = [ctx.match![1], ctx.match![2]];
    await this.svc.setState(this.chatId(ctx), 'inv_edit', { entityId: id, field });
    await this.send(ctx, field === 'quantity' ? i18n('enter_quantity', l) : i18n('enter_min_quantity', l));
  }

  @Action(/^invd:(.+)$/)
  async onInventoryDelete(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('confirm_delete', l), Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('yes', l), `invdc:${ctx.match![1]}`),
        Markup.button.callback(i18n('no', l), `invv:${ctx.match![1]}`),
      ],
    ]));
  }

  @Action(/^invdc:(.+)$/)
  async onInventoryDeleteConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    try {
      await this.svc.deleteInventory(ctx.match![1]);
      await this.send(ctx, i18n('deleted', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_inventory')]]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }

  // ══════════════════════════════════════════════════════════════════
  // TRANSACTIONS — List / Create / Edit / Delete
  // ══════════════════════════════════════════════════════════════════

  @Command('transactions')
  @Action('cmd_transactions')
  async onTransactions(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const txns = await this.svc.getTransactions(a.tenantId);
    if (!txns.length) {
      await this.send(ctx, i18n('transactions_empty', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('add', l), 'txn_add')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]));
      return;
    }
    const list = txns.slice(0, 15).map((t: any, i) => {
      const ic = t.type === 'income' ? '📥' : '📤';
      const d = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${i + 1}. ${ic} ${d} — *${this.fmt(Number(t.amount))}*${t.description ? `\n   ${this.esc(t.description)}` : ''}`;
    });
    await this.send(ctx, `${i18n('transactions_title', l)}\n\n${list.join('\n\n')}`, Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n('income_only', l), 'txn_filter:income'),
        Markup.button.callback(i18n('expense_only', l), 'txn_filter:expense'),
      ],
      [Markup.button.callback(i18n('add', l), 'txn_add')],
      [Markup.button.callback(i18n('back', l), 'go_dashboard')],
    ]));
  }

  @Action(/^txn_filter:(.+)$/)
  async onTxnFilter(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const type = ctx.match![1];
    const txns = await this.svc.getTransactions(a.tenantId, type);
    if (!txns.length) { await this.send(ctx, i18n('transactions_empty', l)); return; }
    const ic = type === 'income' ? '📥' : '📤';
    const list = txns.slice(0, 15).map((t: any, i) => {
      const d = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${i + 1}. ${ic} ${d} — *${this.fmt(Number(t.amount))}*${t.description ? ` — ${this.esc(t.description)}` : ''}`;
    });
    await this.send(ctx, `${ic} *${type === 'income' ? i18n('income_only', l) : i18n('expense_only', l)}*\n\n${list.join('\n')}`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_transactions')]]),
    );
  }

  @Action('txn_add')
  async onTxnAdd(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const branches = await this.svc.getBranches(a.tenantId);
    if (!branches.length) { await this.send(ctx, i18n('branches_empty', l)); return; }
    if (branches.length === 1) {
      // Auto-select single branch
      await this.svc.setState(this.chatId(ctx), 'txn_type', { branchId: (branches[0] as any).id });
      await this.send(ctx, i18n('select_type', l), Markup.inlineKeyboard([
        [Markup.button.callback(i18n('income_only', l), 'txnt:income')],
        [Markup.button.callback(i18n('expense_only', l), 'txnt:expense')],
        [Markup.button.callback(i18n('cancel', l), 'cmd_transactions')],
      ]));
      return;
    }
    const btns = branches.map((b: any) =>
      [Markup.button.callback(`🏢 ${b.name.substring(0, 30)}`, `txnb:${b.id}`)],
    );
    btns.push([Markup.button.callback(i18n('cancel', l), 'cmd_transactions')]);
    await this.send(ctx, i18n('select_branch', l), Markup.inlineKeyboard(btns));
  }

  @Action(/^txnb:(.+)$/)
  async onTxnSelectBranch(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.svc.setState(this.chatId(ctx), 'txn_type', { branchId: ctx.match![1] });
    await this.send(ctx, i18n('select_type', l), Markup.inlineKeyboard([
      [Markup.button.callback(i18n('income_only', l), 'txnt:income')],
      [Markup.button.callback(i18n('expense_only', l), 'txnt:expense')],
      [Markup.button.callback(i18n('cancel', l), 'cmd_transactions')],
    ]));
  }

  @Action(/^txnt:(.+)$/)
  async onTxnSelectType(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    await this.svc.setState(chatId, 'txn_amount', { ...data, type: ctx.match![1] });
    await this.send(ctx, i18n('enter_amount', l));
  }

  // ══════════════════════════════════════════════════════════════════
  // DEBTS (read-only)
  // ══════════════════════════════════════════════════════════════════

  @Command('debts')
  @Action('cmd_debts')
  async onDebts(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.adminOnly(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const s = await this.svc.getDebtSummary(a.tenantId);
    await this.send(ctx,
      `${i18n('debts_title', l)}\n\n` +
      `${i18n('total_debt', l)}: *${this.fmt(s.totalDebt)}*\n` +
      `Clients with balance: *${s.clientCount}*`,
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('client_balances_title', l), 'cmd_client_bal')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]),
    );
  }

  @Action('cmd_client_bal')
  async onClientBalances(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const balances = await this.svc.getClientBalances(a.tenantId);
    if (!balances.length) { await this.send(ctx, i18n('debts_empty', l)); return; }
    const list = balances.slice(0, 20).map((b: any, i) =>
      `${i + 1}. *${this.esc(b.client?.fullName ?? b.fullName ?? '—')}*\n   💸 ${this.fmt(Number(b.totalDebt ?? b.debtAmount ?? 0))}`,
    );
    await this.send(ctx, `${i18n('client_balances_title', l)}\n\n${list.join('\n\n')}`,
      Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_debts')]]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // RECENT SALES
  // ══════════════════════════════════════════════════════════════════

  @Command('recent_sales')
  @Action('cmd_recent_sales')
  async onRecentSales(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const sales = await this.svc.getRecentSales(a.tenantId, 10);
    if (!sales.length) { await this.send(ctx, i18n('recent_sales_empty', l)); return; }
    const list = sales.map((s: any, i: number) => {
      const d = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const ic = s.paymentStatus === 'paid' ? '✅' : s.paymentStatus === 'partial' ? '⚠️' : '⏳';
      return `${i + 1}. ${ic} ${d} — *${this.fmt(Number(s.finalAmount))}* (${s.paymentStatus})`;
    });
    await this.send(ctx, `${i18n('recent_sales_title', l)}\n\n${list.join('\n')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('btn_pos', l), 'pos_start')],
        [Markup.button.callback(i18n('back', l), 'go_dashboard')],
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // POS SALE — Full sale creation flow
  // ══════════════════════════════════════════════════════════════════

  @Command('pos')
  @Action('pos_start')
  async onPosStart(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const branches = await this.svc.getBranches(a.tenantId);
    if (!branches.length) { await this.send(ctx, i18n('branches_empty', l)); return; }

    if (branches.length === 1) {
      const b = branches[0] as any;
      await this.svc.setState(this.chatId(ctx), 'pos_menu', { branchId: b.id, branchName: b.name, items: [] });
      return this.showPosCart(ctx, l, b.name, []);
    }
    const btns = branches.map((b: any) =>
      [Markup.button.callback(`🏢 ${b.name.substring(0, 30)}`, `posb:${b.id}:${b.name.substring(0, 20)}`)],
    );
    btns.push([Markup.button.callback(i18n('cancel', l), 'go_dashboard')]);
    await this.send(ctx, i18n('select_branch', l), Markup.inlineKeyboard(btns));
  }

  @Action(/^posb:([^:]+):(.+)$/)
  async onPosSelectBranch(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const branchId = ctx.match![1];
    const branchName = ctx.match![2];
    await this.svc.setState(this.chatId(ctx), 'pos_menu', { branchId, branchName, items: [] });
    await this.showPosCart(ctx, l, branchName, []);
  }

  private async showPosCart(ctx: TgContext, l: Lang, branchName: string, items: any[]) {
    let text = `${i18n('pos_title', l)}\n🏢 ${this.esc(branchName)}\n\n`;
    if (!items.length) {
      text += i18n('pos_cart_empty', l);
    } else {
      let total = 0;
      items.forEach((item, i) => {
        const sub = item.quantity * item.unitPrice;
        total += sub;
        text += `${i + 1}. ${this.esc(item.name)} x${item.quantity} = *${this.fmt(sub)}*\n`;
      });
      text += `\n${i18n('pos_total', l)}: *${this.fmt(total)}*`;
    }
    const btns: any[] = [];
    btns.push([Markup.button.callback(i18n('pos_add_product', l), 'pos_browse')]);
    if (items.length > 0) {
      btns.push([
        Markup.button.callback(i18n('pos_checkout', l), 'pos_checkout'),
        Markup.button.callback(i18n('pos_clear_cart', l), 'pos_clear'),
      ]);
      // Allow removing individual items
      items.forEach((item, i) => {
        btns.push([Markup.button.callback(`❌ ${item.name.substring(0, 25)}`, `pos_rm:${i}`)]);
      });
    }
    btns.push([Markup.button.callback(i18n('cancel', l), 'pos_cancel')]);
    await this.send(ctx, text, Markup.inlineKeyboard(btns));
  }

  @Action('pos_browse')
  async onPosBrowse(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const products = await this.svc.getProducts(a.tenantId);
    if (!products.length) { await this.send(ctx, i18n('products_empty', l)); return; }
    const btns = products.slice(0, 20).map(p =>
      [Markup.button.callback(`${p.name.substring(0, 25)} — ${this.fmt(Number(p.sellingPrice))}`, `posadd:${p.id}`)],
    );
    btns.push([Markup.button.callback(i18n('back', l), 'pos_back_cart')]);
    await this.send(ctx, i18n('select_product', l), Markup.inlineKeyboard(btns));
  }

  @Action(/^posadd:(.+)$/)
  async onPosAddProduct(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const productId = ctx.match![1];
    const product = await this.svc.getProduct(a.tenantId, productId);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    await this.svc.setState(chatId, 'pos_qty', { ...data, selectedProductId: productId, selectedProductName: product.name, selectedProductPrice: Number(product.sellingPrice) });
    await this.send(ctx, i18n('pos_enter_qty', l, { product: this.esc(product.name) }));
  }

  @Action('pos_back_cart')
  async onPosBackCart(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const tg = await this.svc.getTelegramUser(this.chatId(ctx));
    const data = (tg?.stateData as any) || {};
    await this.svc.setState(this.chatId(ctx), 'pos_menu', data);
    await this.showPosCart(ctx, l, data.branchName || '—', data.items || []);
  }

  @Action(/^pos_rm:(\d+)$/)
  async onPosRemoveItem(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const idx = parseInt(ctx.match![1]);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    const items = [...(data.items || [])];
    items.splice(idx, 1);
    await this.svc.setState(chatId, 'pos_menu', { ...data, items });
    await this.showPosCart(ctx, l, data.branchName || '—', items);
  }

  @Action('pos_clear')
  async onPosClear(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    await this.svc.setState(chatId, 'pos_menu', { ...data, items: [] });
    await this.showPosCart(ctx, l, data.branchName || '—', []);
  }

  @Action('pos_cancel')
  async onPosCancel(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const chatId = this.chatId(ctx);
    await this.svc.setState(chatId, 'idle');
    const l = await this.lang(ctx);
    const role = await this.svc.getUserRole(chatId) ?? 'seller';
    await this.send(ctx, i18n('cancelled', l), this.mainMenu(l, role));
  }

  @Action('pos_checkout')
  async onPosCheckout(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};

    // Optional: select client
    const clients = await this.svc.getClients(a.tenantId);
    const btns: any[] = [];
    if (clients.length) {
      btns.push(...clients.slice(0, 10).map((c: any) =>
        [Markup.button.callback(`👤 ${c.fullName.substring(0, 30)}`, `posc:${c.id}`)],
      ));
    }
    btns.push([Markup.button.callback(i18n('skip', l), 'posc:skip')]);
    btns.push([Markup.button.callback(i18n('cancel', l), 'pos_back_cart')]);
    await this.svc.setState(chatId, 'pos_client', data);
    await this.send(ctx, i18n('pos_select_client', l), Markup.inlineKeyboard(btns));
  }

  @Action(/^posc:(.+)$/)
  async onPosSelectClient(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    const clientId = ctx.match![1] === 'skip' ? undefined : ctx.match![1];
    await this.svc.setState(chatId, 'pos_payment', { ...data, clientId });
    await this.send(ctx, i18n('pos_select_payment', l), Markup.inlineKeyboard([
      [Markup.button.callback(i18n('cash', l), 'pospm:cash')],
      [Markup.button.callback(i18n('card', l), 'pospm:card')],
      [Markup.button.callback(i18n('transfer', l), 'pospm:transfer')],
      [Markup.button.callback(i18n('cancel', l), 'pos_back_cart')],
    ]));
  }

  @Action(/^pospm:(.+)$/)
  async onPosSelectPayment(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    const items = data.items || [];
    const total = items.reduce((s: number, it: any) => s + it.quantity * it.unitPrice, 0);
    await this.svc.setState(chatId, 'pos_paid', { ...data, paymentMethod: ctx.match![1], total });
    await this.send(ctx, `${i18n('pos_enter_paid', l)}\n${i18n('pos_total', l)}: *${this.fmt(total)}*`);
  }

  // ══════════════════════════════════════════════════════════════════
  // TEXT HANDLER — state machine dispatch
  // ══════════════════════════════════════════════════════════════════

  @On('text')
  async onText(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    if (!tg) return;

    const text = (ctx.message as any)?.text?.trim();
    if (!text) return;
    const l = (tg.language as Lang) ?? 'en';
    const state = tg.state ?? 'idle';
    const data = (tg.stateData as any) ?? {};

    // ─── Cancel anywhere ────────────────────────────────────────────
    if (text === i18n('cancel', l) || text === '/cancel') {
      await this.svc.setState(chatId, 'idle');
      const role = await this.svc.getUserRole(chatId) ?? 'seller';
      await this.send(ctx, i18n('cancelled', l), this.mainMenu(l, role));
      return;
    }

    // ─── Main menu keyboard buttons ─────────────────────────────────
    const menuMap: Record<string, () => Promise<void>> = {
      [i18n('btn_dashboard', l)]: () => this.onDashboard(ctx),
      [i18n('btn_pos', l)]: () => this.onPosStart(ctx),
      [i18n('btn_products', l)]: () => this.onProducts(ctx),
      [i18n('btn_inventory', l)]: () => this.onInventory(ctx),
      [i18n('btn_clients', l)]: () => this.onClients(ctx),
      [i18n('btn_sales', l)]: () => this.onRecentSales(ctx),
      [i18n('btn_finance', l)]: () => this.onFinancial(ctx),
      [i18n('btn_debts', l)]: () => this.onDebts(ctx),
      [i18n('btn_branches', l)]: () => this.onBranches(ctx),
      [i18n('btn_categories', l)]: () => this.onCategories(ctx),
      [i18n('btn_transactions', l)]: () => this.onTransactions(ctx),
      [i18n('btn_settings', l)]: () => this.onSettings(ctx),
      [i18n('btn_help', l)]: () => this.onHelp(ctx),
    };
    const handler = menuMap[text];
    if (handler) { await handler(); return; }

    // ─── State-based input ──────────────────────────────────────────
    const isSkip = text === '/skip';

    switch (state) {
      // ── Auth ──────────────────────────────────────────────────────
      case 'awaiting_phone':
        await this.handlePhoneLogin(ctx, chatId, text);
        return;

      // ── Product Create flow ───────────────────────────────────────
      case 'product_name':
        await this.svc.setState(chatId, 'product_price', { ...data, name: text });
        await this.send(ctx, i18n('enter_selling_price', l));
        return;

      case 'product_price': {
        const price = parseFloat(text);
        if (isNaN(price) || price <= 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        await this.svc.setState(chatId, 'product_cost', { ...data, sellingPrice: price });
        await this.send(ctx, i18n('enter_cost_price', l));
        return;
      }

      case 'product_cost': {
        const costPrice = isSkip ? undefined : parseFloat(text);
        if (!isSkip && (isNaN(costPrice!) || costPrice! < 0)) { await this.send(ctx, i18n('invalid_input', l)); return; }
        // Check if there are categories to select
        const a = await this.auth(ctx);
        if (!a) return;
        const cats = await this.svc.getCategories(a.tenantId);
        if (cats.length) {
          await this.svc.setState(chatId, 'product_cat', { ...data, costPrice });
          const btns = cats.map((c: any) =>
            [Markup.button.callback(c.name.substring(0, 30), `prodcat:${c.id}`)],
          );
          btns.push([Markup.button.callback(i18n('skip', l), 'prodcat:skip')]);
          await this.send(ctx, i18n('select_category', l), Markup.inlineKeyboard(btns));
        } else {
          // Create directly without category
          try {
            await this.svc.createProduct(a.tenantId, { name: data.name, sellingPrice: data.sellingPrice, costPrice });
            await this.svc.setState(chatId, 'idle');
            await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_products')]]));
          } catch { await this.send(ctx, i18n('error', l)); }
        }
        return;
      }

      // ── Product Edit ──────────────────────────────────────────────
      case 'product_edit': {
        const a2 = await this.auth(ctx);
        if (!a2) return;
        const val: any = data.field === 'name' ? text : parseFloat(text);
        if (data.field !== 'name' && (isNaN(val) || val < 0)) { await this.send(ctx, i18n('invalid_input', l)); return; }
        try {
          await this.svc.updateProduct(a2.tenantId, data.entityId, { [data.field]: val });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('updated', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), `pv:${data.entityId}`)]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Product Search ────────────────────────────────────────────
      case 'product_search': {
        const a3 = await this.auth(ctx);
        if (!a3) return;
        await this.svc.setState(chatId, 'idle');
        const products = await this.svc.getProducts(a3.tenantId, text);
        if (!products.length) {
          await this.send(ctx, i18n('not_found', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_products')]]));
          return;
        }
        const list = products.slice(0, 20).map((p, i) =>
          `${i + 1}. *${this.esc(p.name)}* — ${this.fmt(Number(p.sellingPrice))}`,
        );
        const btns = products.slice(0, 20).map(p =>
          [Markup.button.callback(`📦 ${p.name.substring(0, 30)}`, `pv:${p.id}`)],
        );
        btns.push([Markup.button.callback(i18n('back', l), 'cmd_products')]);
        await this.send(ctx, `🔍 *${this.esc(text)}*\n\n${list.join('\n')}`, Markup.inlineKeyboard(btns));
        return;
      }

      // ── Client Create flow ────────────────────────────────────────
      case 'client_name':
        await this.svc.setState(chatId, 'client_phone', { ...data, fullName: text });
        await this.send(ctx, i18n('enter_phone', l));
        return;

      case 'client_phone':
        await this.svc.setState(chatId, 'client_address', { ...data, phone: isSkip ? undefined : text });
        await this.send(ctx, i18n('enter_address', l));
        return;

      case 'client_address': {
        const a4 = await this.auth(ctx);
        if (!a4) return;
        try {
          await this.svc.createClient(a4.tenantId, { fullName: data.fullName, phone: data.phone, address: isSkip ? undefined : text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_clients')]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Client Edit ───────────────────────────────────────────────
      case 'client_edit': {
        const a5 = await this.auth(ctx);
        if (!a5) return;
        try {
          await this.svc.updateClient(a5.tenantId, data.entityId, { [data.field]: text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('updated', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), `cv:${data.entityId}`)]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Branch Create flow ────────────────────────────────────────
      case 'branch_name':
        await this.svc.setState(chatId, 'branch_address', { ...data, name: text });
        await this.send(ctx, i18n('enter_address', l));
        return;

      case 'branch_address':
        await this.svc.setState(chatId, 'branch_phone', { ...data, address: isSkip ? undefined : text });
        await this.send(ctx, i18n('enter_phone', l));
        return;

      case 'branch_phone': {
        const a6 = await this.auth(ctx);
        if (!a6) return;
        try {
          await this.svc.createBranch(a6.tenantId, { name: data.name, address: data.address, phone: isSkip ? undefined : text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_branches')]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Branch Edit ───────────────────────────────────────────────
      case 'branch_edit': {
        const a7 = await this.auth(ctx);
        if (!a7) return;
        try {
          await this.svc.updateBranch(a7.tenantId, data.entityId, { [data.field]: text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('updated', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), `bv:${data.entityId}`)]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Category Create flow ──────────────────────────────────────
      case 'cat_name':
        await this.svc.setState(chatId, 'cat_desc', { ...data, name: text });
        await this.send(ctx, i18n('enter_description', l));
        return;

      case 'cat_desc': {
        const a8 = await this.auth(ctx);
        if (!a8) return;
        try {
          await this.svc.createCategory(a8.tenantId, { name: data.name, description: isSkip ? undefined : text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_categories')]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Category Edit ─────────────────────────────────────────────
      case 'cat_edit': {
        const a9 = await this.auth(ctx);
        if (!a9) return;
        try {
          await this.svc.updateCategory(a9.tenantId, data.entityId, { [data.field]: text });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('updated', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), `catv:${data.entityId}`)]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Inventory Create flow ─────────────────────────────────────
      case 'inv_qty': {
        const qty = parseFloat(text);
        if (isNaN(qty) || qty < 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        await this.svc.setState(chatId, 'inv_min', { ...data, quantity: qty });
        await this.send(ctx, i18n('enter_min_quantity', l));
        return;
      }

      case 'inv_min': {
        const a10 = await this.auth(ctx);
        if (!a10) return;
        const minQty = isSkip ? undefined : parseFloat(text);
        if (!isSkip && (isNaN(minQty!) || minQty! < 0)) { await this.send(ctx, i18n('invalid_input', l)); return; }
        try {
          await this.svc.createInventory(a10.tenantId, { productId: data.productId, quantity: data.quantity, minQuantity: minQty });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_inventory')]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Inventory Edit ────────────────────────────────────────────
      case 'inv_edit': {
        const val2 = parseFloat(text);
        if (isNaN(val2) || val2 < 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        try {
          const a14 = await this.auth(ctx);
          if (!a14) return;
          await this.svc.updateInventory(data.entityId, a14.tenantId, a14.userId, { [data.field]: val2 });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('updated', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), `invv:${data.entityId}`)]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── Transaction Create flow ───────────────────────────────────
      case 'txn_amount': {
        const amt = parseFloat(text);
        if (isNaN(amt) || amt <= 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        await this.svc.setState(chatId, 'txn_desc', { ...data, amount: amt });
        await this.send(ctx, i18n('enter_description', l));
        return;
      }

      case 'txn_desc': {
        const a11 = await this.auth(ctx);
        if (!a11) return;
        try {
          await this.svc.createTransaction(a11.tenantId, a11.userId, {
            branchId: data.branchId,
            type: data.type,
            amount: data.amount,
            description: isSkip ? undefined : text,
          });
          await this.svc.setState(chatId, 'idle');
          await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_transactions')]]));
        } catch { await this.send(ctx, i18n('error', l)); }
        return;
      }

      // ── POS Quantity ──────────────────────────────────────────────
      case 'pos_qty': {
        const qty2 = parseInt(text, 10);
        if (isNaN(qty2) || qty2 <= 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        const items = [...(data.items || [])];
        // Check if product already in cart, merge
        const existIdx = items.findIndex((it: any) => it.productId === data.selectedProductId);
        if (existIdx >= 0) {
          items[existIdx].quantity += qty2;
        } else {
          items.push({
            productId: data.selectedProductId,
            name: data.selectedProductName,
            unitPrice: data.selectedProductPrice,
            quantity: qty2,
          });
        }
        const newData = { branchId: data.branchId, branchName: data.branchName, items };
        await this.svc.setState(chatId, 'pos_menu', newData);
        await this.send(ctx, i18n('pos_item_added', l));
        await this.showPosCart(ctx, l, data.branchName || '—', items);
        return;
      }

      // ── POS Paid Amount ───────────────────────────────────────────
      case 'pos_paid': {
        const paidAmt = parseFloat(text);
        if (isNaN(paidAmt) || paidAmt < 0) { await this.send(ctx, i18n('invalid_input', l)); return; }
        const a12 = await this.auth(ctx);
        if (!a12) return;
        try {
          const saleItems = (data.items || []).map((it: any) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          }));
          const sale = await this.svc.createSale(a12.tenantId, data.branchId, a12.userId, {
            items: saleItems,
            clientId: data.clientId,
            paidAmount: paidAmt,
          }) as any;
          await this.svc.setState(chatId, 'idle');
          const total = data.total || saleItems.reduce((s: number, it: any) => s + it.quantity * it.unitPrice, 0);
          const role12 = a12.role;
          await this.send(ctx, i18n('pos_sale_created', l, { total: this.fmt(total) }), this.mainMenu(l, role12));
        } catch (e) {
          this.logger.error('POS sale error', e);
          await this.send(ctx, i18n('error', l));
        }
        return;
      }
    }
  }

  // ═══ Product category selection during creation (inline callback) ══
  @Action(/^prodcat:(.+)$/)
  async onProductSelectCategory(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const a = await this.auth(ctx); if (!a) return;
    const l = await this.lang(ctx);
    const chatId = this.chatId(ctx);
    const tg = await this.svc.getTelegramUser(chatId);
    const data = (tg?.stateData as any) || {};
    const categoryId = ctx.match![1] === 'skip' ? undefined : ctx.match![1];
    try {
      await this.svc.createProduct(a.tenantId, {
        name: data.name,
        sellingPrice: data.sellingPrice,
        costPrice: data.costPrice,
        categoryId,
      });
      await this.svc.setState(chatId, 'idle');
      await this.send(ctx, i18n('created', l), Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'cmd_products')]]));
    } catch { await this.send(ctx, i18n('error', l)); }
  }
}
