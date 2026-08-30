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

  /**
   * Ensures the user is linked to a client account.
   * Returns { clientId, tenantId, language } or null + sends error.
   */
  private async requireLinked(ctx: TgContext): Promise<{ clientId: string; tenantId: string; lang: Lang } | null> {
    const chatId = this.chatId(ctx);
    const u = await this.svc.getUser(chatId);
    const l = (u?.language as Lang) ?? 'en';
    if (!u?.clientId || !u?.tenantId) {
      await this.send(ctx, i18n('not_linked', l));
      return null;
    }
    return { clientId: u.clientId, tenantId: u.tenantId, lang: l };
  }

  /** Delete previous bot msg + user msg, send new one, track id */
  private async send(ctx: TgContext, text: string, extra?: any) {
    const chatId = this.chatId(ctx);
    const prev = this.lastMsg.get(chatId);
    if (prev) { try { await ctx.telegram.deleteMessage(Number(chatId), prev); } catch {} }
    try { await ctx.deleteMessage(); } catch {}
    const sent = await ctx.reply(text, { parse_mode: 'Markdown' as const, ...extra });
    this.lastMsg.set(chatId, sent.message_id);
    return sent;
  }

  private esc(s: string): string {
    return (s ?? '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  private fmt(n: number) { return this.svc.fmt(n); }
  private fmtUsd(n: number) { return this.svc.fmtUsd(n); }
  private fmtDate(d: Date | string) { return this.svc.fmtDate(d); }

  private mainMenu(l: Lang) {
    return Markup.keyboard([
      [i18n('btn_balance', l), i18n('btn_transactions', l)],
      [i18n('btn_sales', l)],
      [i18n('btn_settings', l), i18n('btn_help', l)],
    ]).resize();
  }

  // ══════════════════════════════════════════════════════════════════
  // /start  — link or welcome back
  // ══════════════════════════════════════════════════════════════════

  @Start()
  async onStart(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    await this.svc.findOrCreate(chatId);
    const l = await this.lang(ctx);

    if (await this.svc.isLinked(chatId)) {
      const u = await this.svc.getUser(chatId);
      const name = this.esc(u?.client?.fullName ?? '');
      await this.send(ctx, i18n('welcome_back', l, { name }), this.mainMenu(l));
      return;
    }

    // Not linked — ask for phone
    await this.svc.setState(chatId, 'awaiting_phone');
    await this.send(
      ctx,
      i18n('link_prompt', l),
      Markup.keyboard([[Markup.button.contactRequest(i18n('share_phone', l))]])
        .resize()
        .oneTime(),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // /menu  — main menu shortcut
  // ══════════════════════════════════════════════════════════════════

  @Command('menu')
  async onMenu(@Ctx() ctx: TgContext) {
    const a = await this.requireLinked(ctx);
    if (!a) return;
    const u = await this.svc.getUser(this.chatId(ctx));
    const name = this.esc(u?.client?.fullName ?? '');
    await this.send(ctx, i18n('welcome_back', a.lang, { name }), this.mainMenu(a.lang));
  }

  // ══════════════════════════════════════════════════════════════════
  // /help
  // ══════════════════════════════════════════════════════════════════

  @Help()
  @Command('help')
  async onHelp(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(ctx, i18n('help_text', l));
  }

  // ══════════════════════════════════════════════════════════════════
  // /lang  — language picker
  // ══════════════════════════════════════════════════════════════════

  @Command('lang')
  async onLang(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(
      ctx,
      i18n('choose_language', l),
      Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇿 O\'zbek', 'set_lang:uz')],
        [Markup.button.callback('🇬🇧 English', 'set_lang:en')],
        [Markup.button.callback('🇷🇺 Русский', 'set_lang:ru')],
      ]),
    );
  }

  @Action(/^set_lang:(.+)$/)
  async onSetLang(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const lang = ctx.match![1] as Lang;
    await this.svc.setLanguage(this.chatId(ctx), lang);
    const linked = await this.svc.isLinked(this.chatId(ctx));
    await this.send(ctx, i18n('language_set', lang), linked ? this.mainMenu(lang) : undefined);
  }

  // ══════════════════════════════════════════════════════════════════
  // Contact share handler — phone linking
  // ══════════════════════════════════════════════════════════════════

  @On('contact')
  async onContact(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const u = await this.svc.getUser(chatId);
    if (u?.state !== 'awaiting_phone') return;
    const phone = (ctx.message as any)?.contact?.phone_number;
    if (!phone) return;
    await this.doLink(ctx, chatId, phone);
  }

  private async doLink(ctx: TgContext, chatId: string, phone: string) {
    const l = await this.lang(ctx);
    const client = await this.svc.linkClientByPhone(chatId, phone);
    if (!client) {
      await this.svc.setState(chatId, 'idle');
      await this.send(ctx, i18n('link_failed', l), Markup.removeKeyboard());
      return;
    }
    const name = this.esc(client.fullName);
    await this.send(ctx, i18n('link_success', l, { name }), this.mainMenu(l));
  }

  // ══════════════════════════════════════════════════════════════════
  // /balance  — show balance & debt
  // ══════════════════════════════════════════════════════════════════

  @Command('balance')
  @Action('go_balance')
  async onBalance(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.requireLinked(ctx);
    if (!a) return;

    const { client, balanceUzs, balanceUsd } = await this.svc.getClientBalance(a.tenantId, a.clientId);
    const l = a.lang;

    const uzsLine =
      balanceUzs < 0
        ? `${i18n('debt_uzs', l)}: *${this.fmt(Math.abs(balanceUzs))}*`
        : `${i18n('balance_uzs', l)}: *${this.fmt(balanceUzs)}*`;
    const usdLine =
      balanceUsd < 0
        ? `${i18n('debt_usd', l)}: *${this.fmtUsd(Math.abs(balanceUsd))}*`
        : `${i18n('balance_usd', l)}: *${this.fmtUsd(Math.abs(balanceUsd))}*`;

    const statusLine = balanceUzs >= 0 && balanceUsd >= 0 ? `\n${i18n('no_debt', l)}` : '';

    const msg =
      i18n('balance_title', l, { name: this.esc(client?.fullName ?? '') }) +
      '\n\n' +
      uzsLine +
      '\n' +
      usdLine +
      statusLine +
      '\n\n' +
      i18n('balance_note', l);

    await this.send(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('refresh', l), 'go_balance')],
        [
          Markup.button.callback(i18n('btn_transactions', l), 'go_transactions'),
          Markup.button.callback(i18n('btn_sales', l), 'go_sales'),
        ],
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // /transactions  — payment & debt history
  // ══════════════════════════════════════════════════════════════════

  @Command('transactions')
  @Action('go_transactions')
  async onTransactions(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.requireLinked(ctx);
    if (!a) return;
    const l = a.lang;

    const txns = await this.svc.getClientTransactions(a.tenantId, a.clientId, 15);

    if (!txns.length) {
      await this.send(
        ctx,
        `${i18n('txn_title', l)}\n\n${i18n('txn_empty', l)}`,
        Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'go_balance')]]),
      );
      return;
    }

    const lines = txns.map((tx, i) => {
      const icon = (tx.type as string) === 'income' ? '📥' : '📤';
      const label = (tx.type as string) === 'income' ? i18n('txn_payment', l) : i18n('txn_debt', l);
      const d = this.fmtDate(tx.createdAt);
      const amt = `*${this.fmt(Number(tx.amount))} ${tx.currency}*`;
      const desc = tx.description ? `\n   _${this.esc(tx.description)}_` : '';
      return `${i + 1}. ${icon} ${label} — ${d}\n   ${amt}${desc}`;
    });

    await this.send(
      ctx,
      `${i18n('txn_title', l)}\n\n${lines.join('\n\n')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('back', l), 'go_balance')],
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // /orders  — sale history
  // ══════════════════════════════════════════════════════════════════

  @Command('orders')
  @Action('go_sales')
  async onSales(@Ctx() ctx: TgContext) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery();
    const a = await this.requireLinked(ctx);
    if (!a) return;
    const l = a.lang;

    const sales = await this.svc.getClientSales(a.tenantId, a.clientId, 10);

    if (!sales.length) {
      await this.send(
        ctx,
        `${i18n('sales_title', l)}\n\n${i18n('sales_empty', l)}`,
        Markup.inlineKeyboard([[Markup.button.callback(i18n('back', l), 'go_balance')]]),
      );
      return;
    }

    const lines = sales.map((s, i) => {
      const statusIcon =
        (s.status as string) === 'completed' ? '✅' :
        (s.status as string) === 'debt' ? '⚠️' : '❌';
      const statusLabel =
        (s.status as string) === 'completed' ? i18n('sale_completed', l) :
        (s.status as string) === 'debt' ? i18n('sale_debt', l) : i18n('sale_cancelled', l);
      const d = this.fmtDate(s.createdAt);
      const total = `*${this.fmt(Number(s.totalAmount))} ${s.currency}*`;
      const debtLine =
        Number(s.debtAmount) > 0
          ? `\n   ${i18n('sale_debt_amount', l)}: *${this.fmt(Number(s.debtAmount))}*`
          : '';
      const itemCount = s.items.length;
      return `${i + 1}. ${statusIcon} ${statusLabel} — ${d}\n   ${i18n('sale_total', l)}: ${total}  ${i18n('sale_items_count', l)}: ${itemCount}${debtLine}`;
    });

    await this.send(
      ctx,
      `${i18n('sales_title', l)}\n\n${lines.join('\n\n')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('back', l), 'go_balance')],
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // /settings  — language + unlink
  // ══════════════════════════════════════════════════════════════════

  @Command('settings')
  async onSettings(@Ctx() ctx: TgContext) {
    const l = await this.lang(ctx);
    await this.send(
      ctx,
      i18n('settings_title', l),
      Markup.inlineKeyboard([
        [Markup.button.callback(i18n('change_language', l), 'settings_lang')],
        [Markup.button.callback(i18n('unlink_btn', l), 'settings_unlink')],
      ]),
    );
  }

  @Action('settings_lang')
  async onSettingsLang(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    await this.onLang(ctx);
  }

  @Action('settings_unlink')
  async onSettingsUnlink(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    await this.send(
      ctx,
      i18n('confirm_unlink', l),
      Markup.inlineKeyboard([
        [
          Markup.button.callback(i18n('yes', l), 'confirm_unlink_yes'),
          Markup.button.callback(i18n('no', l), 'confirm_unlink_no'),
        ],
      ]),
    );
  }

  @Action('confirm_unlink_yes')
  async onUnlinkConfirm(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const chatId = this.chatId(ctx);
    const l = await this.lang(ctx);
    await this.svc.unlink(chatId);
    await this.send(ctx, i18n('unlinked', l), Markup.removeKeyboard());
  }

  @Action('confirm_unlink_no')
  async onUnlinkCancel(@Ctx() ctx: TgContext) {
    await ctx.answerCbQuery();
    const l = await this.lang(ctx);
    const linked = await this.svc.isLinked(this.chatId(ctx));
    await this.send(ctx, i18n('cancelled', l), linked ? this.mainMenu(l) : undefined);
  }

  // ══════════════════════════════════════════════════════════════════
  // TEXT  — state machine
  // ══════════════════════════════════════════════════════════════════

  @On('text')
  async onText(@Ctx() ctx: TgContext) {
    const chatId = this.chatId(ctx);
    const u = await this.svc.getUser(chatId);
    if (!u) return;

    const text = (ctx.message as any)?.text?.trim() ?? '';
    const l = (u.language as Lang) ?? 'en';
    const state = u.state ?? 'idle';

    // ── Cancel from anywhere ────────────────────────────────────────
    if (text === '/cancel' || text === i18n('cancel', l)) {
      await this.svc.setState(chatId, 'idle');
      const linked = await this.svc.isLinked(chatId);
      await this.send(ctx, i18n('cancelled', l), linked ? this.mainMenu(l) : undefined);
      return;
    }

    // ── Keyboard menu buttons ────────────────────────────────────────
    const menuMap: Record<string, () => Promise<void>> = {
      [i18n('btn_balance', l)]:      () => this.onBalance(ctx),
      [i18n('btn_transactions', l)]: () => this.onTransactions(ctx),
      [i18n('btn_sales', l)]:        () => this.onSales(ctx),
      [i18n('btn_settings', l)]:     () => this.onSettings(ctx),
      [i18n('btn_help', l)]:         () => this.onHelp(ctx),
    };
    const menuHandler = menuMap[text];
    if (menuHandler) { await menuHandler(); return; }

    // ── State-based input ────────────────────────────────────────────
    if (state === 'awaiting_phone') {
      // User typed phone manually instead of sharing contact
      await this.doLink(ctx, chatId, text);
    }
  }
}
