'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Bot,
  Check,
  ChevronRight,
  Code2,
  FileCheck2,
  Fingerprint,
  Languages,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Language = 'zh' | 'en';
type Page =
  | 'transactions'
  | 'detail'
  | 'authorizations'
  | 'mandates'
  | 'wallets'
  | 'agents'
  | 'ledger'
  | 'developers';
type Stage = 'review' | 'reserved' | 'settled';
type Status =
  | 'authorization_required'
  | 'authorized'
  | 'funds_reserved'
  | 'delivery_submitted'
  | 'provider_unknown'
  | 'settled'
  | 'refunded'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'disputed';

type TransactionCard = {
  id: string;
  zh: string;
  en: string;
  payer: string;
  payee: string;
  buyer: string;
  seller: string;
  amount: number;
  currency: string;
  status: Status;
  time: string;
  source?: 'api' | 'demo';
  channel?: string;
  chainHash?: string;
  providerReference?: string;
  receiptId?: string;
  receiptValid?: boolean;
  signatureValid?: boolean;
  issuerTrusted?: boolean;
  settlementConfirmed?: boolean;
  receiptSchemaVersion?: string;
  deliveryHash?: string;
  mandateId?: string;
  quoteTime?: string;
  requestTime?: string;
  reserveTime?: string;
  deliveryTime?: string;
  settlementTime?: string;
  reserveReference?: string;
  quotePresent?: boolean;
  requestPresent?: boolean;
};

type TransactionApiItem = {
  transaction: {
    id: string;
    status: string;
    settled_amount: { value: number; currency: string };
    authorized_amount: { value: number; currency: string };
    settlement_provider_reference?: string;
    reserve_provider_reference?: string;
    created_at: string;
    settled_at?: string;
  };
  payment_intent: {
    payer_account_id: string;
    payee_account_id: string;
    buyer_agent_id: string;
    seller_agent_id: string;
    payment_mandate_id: string;
    created_at?: string;
  } | null;
  quote: { item: { name: string }; created_at?: string } | null;
  delivery: { evidence_hash: string; submitted_at?: string } | null;
  receipt: {
    id: string;
    valid?: boolean;
    signature_valid?: boolean;
    issuer_trusted?: boolean;
    settlement_confirmed?: boolean;
    schema_version?: string;
    signed_at?: string;
  } | null;
  payment_channel: string;
  settlement_control?: { status?: string } | null;
};

const API_BASE = 'http://127.0.0.1:3101';

const copy = {
  zh: {
    product: 'Agent 收付网络',
    network: '网络运行中',
    transactionFirst: '交易优先 P0',
    authorizationEyebrow: '支付授权',
    mandateEyebrow: '支付委托',
    receiptEyebrow: '交易凭证',
    workspace: '工作空间 / 不二实验室',
    transactions: '交易',
    authorizations: '待授权',
    mandates: '支付授权',
    wallets: '钱包与额度',
    agents: 'Agent 身份',
    ledger: '结算账本',
    developers: '开发者',
    settings: '工作空间设置',
    search: '搜索交易',
    heading: 'Agent 交易活动',
    subheading:
      'Agent 在原有工作流中自主收款与付款；BU2 负责授权、结算与凭证。',
    pending: '需要授权',
    settled: '已结算',
    refunded: '已退款',
    reserved: '资金已预留',
    deliveredStatus: '等待结算',
    providerUnknown: '结算结果未知',
    declinedStatus: '已拒绝',
    inactiveStatus: '已结束',
    volume: '今日交易额',
    completed: '今日已结算',
    activeAgents: '活跃 Agent',
    autoRate: '自动授权率',
    recent: '最近交易',
    all: '全部交易',
    amount: '金额',
    parties: '付款方 → 收款方',
    purpose: '购买内容',
    back: '返回交易',
    detail: '交易详情',
    authorizationRequired: '需要你的授权',
    authorizationCopy:
      '这是该 Agent 首次向 Atlas Data Lab 付款。交易符合研究类别，但首次商户需要确认。',
    authorize: '授权付款 ¥39',
    decline: '拒绝',
    confirmDelivery: '确认交付并结算',
    reservedCopy: '¥39 已预留。卖方 Agent 已获得交付许可，资金尚未结算。',
    settledTitle: '交易已完成',
    settledCopy:
      '交付已经确认，¥39 已结算至 Atlas Data Lab，机器可读凭证已生成。',
    timeline: '交易时间线',
    context: '外部上下文',
    contextValue: 'ChatGPT 会话 · Research Copilot',
    mandate: '生效的 Payment Mandate',
    mandateValue: '研究数据 ≤ ¥50 / 笔；首次商户需确认',
    quote: '报价已创建',
    requested: '支付授权已请求',
    fundsReserved: '资金已预留',
    delivered: '服务已交付',
    settlement: '资金已结算',
    receipt: '机器可读凭证',
    receiptId: '凭证 ID',
    verify: '可验证',
    queueTitle: 'Agent 正在等待支付授权',
    queueCopy:
      '这里只出现 Mandate 无法自动决定的交易，不需要用户创建或管理任务。',
    mandateTitle: '允许 Agent 在边界内自主支付',
    walletTitle: '资金与支付方式',
    agentTitle: '可验证的 Agent 身份',
    ledgerTitle: '不可覆盖的交易与结算记录',
    developerTitle: '嵌入现有 Agent，而不是迁移工作流',
    secondary:
      '该页面已按 Transaction-first P0 定位重构，下一轮将接入真实 API 契约。',
    liveData: '实时 API 数据',
    apiOffline: '真实 API 暂不可用，正在展示演示数据',
    chainTransaction: '链上交易',
    providerReference: 'Provider 引用',
    dataSource: '数据来源',
    demoData: '演示数据',
    receiptValid: '可信凭证',
    receiptInvalid: '验证失败',
    receiptUnknown: '未签发 / 未知',
    signatureValid: '签名有效',
    issuerTrusted: '签发方可信',
    settlementConfirmed: '结算已确认',
    receiptVersion: '凭证版本',
    mandateAutoApproved: 'Mandate 自动通过',
  },
  en: {
    product: 'Agent Payment Network',
    network: 'Network live',
    transactionFirst: 'Transaction-first P0',
    authorizationEyebrow: 'Payment authorization',
    mandateEyebrow: 'Payment Mandate',
    receiptEyebrow: 'Receipt',
    workspace: 'Workspace / BU2 Lab',
    transactions: 'Transactions',
    authorizations: 'Authorizations',
    mandates: 'Payment Mandates',
    wallets: 'Wallets & Limits',
    agents: 'Agent Identities',
    ledger: 'Settlement Ledger',
    developers: 'Developers',
    settings: 'Workspace settings',
    search: 'Search transactions',
    heading: 'Agent transaction activity',
    subheading:
      'Agents pay and get paid inside existing workflows; BU2 handles authorization, settlement, and receipts.',
    pending: 'Authorization required',
    settled: 'Settled',
    refunded: 'Refunded',
    reserved: 'Funds reserved',
    deliveredStatus: 'Awaiting settlement',
    providerUnknown: 'Settlement unknown',
    declinedStatus: 'Declined',
    inactiveStatus: 'Ended',
    volume: 'Volume today',
    completed: 'Settled today',
    activeAgents: 'Active agents',
    autoRate: 'Auto-authorization rate',
    recent: 'Recent transactions',
    all: 'All transactions',
    amount: 'Amount',
    parties: 'Payer → payee',
    purpose: 'Purchase',
    back: 'Back to transactions',
    detail: 'Transaction detail',
    authorizationRequired: 'Your authorization is required',
    authorizationCopy:
      'This is the agent’s first payment to Atlas Data Lab. Research is allowed, but a new merchant requires confirmation.',
    authorize: 'Authorize ¥39 payment',
    decline: 'Decline',
    confirmDelivery: 'Confirm delivery & settle',
    reservedCopy:
      '¥39 is reserved. The seller agent may deliver, but funds have not settled.',
    settledTitle: 'Transaction completed',
    settledCopy:
      'Delivery was confirmed, ¥39 settled to Atlas Data Lab, and a machine-readable receipt was issued.',
    timeline: 'Transaction timeline',
    context: 'External context',
    contextValue: 'ChatGPT conversation · Research Copilot',
    mandate: 'Effective Payment Mandate',
    mandateValue: 'Research data ≤ ¥50 / payment; confirm new merchants',
    quote: 'Quote created',
    requested: 'Authorization requested',
    fundsReserved: 'Funds reserved',
    delivered: 'Service delivered',
    settlement: 'Funds settled',
    receipt: 'Machine-readable receipt',
    receiptId: 'Receipt ID',
    verify: 'Verifiable',
    queueTitle: 'Agents waiting for payment authorization',
    queueCopy:
      'Only transactions a Mandate cannot decide appear here. Users never create or manage tasks in BU2.',
    mandateTitle: 'Let agents pay autonomously within boundaries',
    walletTitle: 'Funds and payment methods',
    agentTitle: 'Verifiable agent identities',
    ledgerTitle: 'Immutable transaction and settlement records',
    developerTitle: 'Embed into existing agents—do not migrate workflows',
    secondary:
      'This surface now reflects the Transaction-first P0. The next iteration will connect the real API contract.',
    liveData: 'Live API data',
    apiOffline: 'Live API unavailable; showing demo data',
    chainTransaction: 'Onchain transaction',
    providerReference: 'Provider reference',
    dataSource: 'Data source',
    demoData: 'Demo data',
    receiptValid: 'Trusted receipt',
    receiptInvalid: 'Verification failed',
    receiptUnknown: 'Not issued / unknown',
    signatureValid: 'Signature valid',
    issuerTrusted: 'Issuer trusted',
    settlementConfirmed: 'Settlement confirmed',
    receiptVersion: 'Receipt version',
    mandateAutoApproved: 'Mandate auto-approved',
  },
};

const demoTxs: TransactionCard[] = [
  {
    id: 'PAY-8421',
    zh: '东南亚电商市场数据集',
    en: 'Southeast Asia commerce dataset',
    payer: 'BU2 Ventures',
    payee: 'Atlas Data Lab',
    buyer: 'Research Copilot',
    seller: 'Market Data Agent',
    amount: 39,
    currency: 'CNY',
    status: 'authorization_required' as Status,
    time: '14:32',
    source: 'demo',
  },
  {
    id: 'PAY-8419',
    zh: '支付协议竞品研究',
    en: 'Payment protocol landscape report',
    payer: 'Nova Capital',
    payee: 'BU2 Research Agent',
    buyer: 'Investment Analyst',
    seller: 'BU2 Research Agent',
    amount: 80,
    currency: 'CNY',
    status: 'settled' as Status,
    time: '13:58',
    source: 'demo',
  },
  {
    id: 'PAY-8416',
    zh: '实时航班价格查询',
    en: 'Live flight pricing lookup',
    payer: 'Trip Planner AI',
    payee: 'Route API',
    buyer: 'Travel Concierge',
    seller: 'Route Pricing Agent',
    amount: 6.5,
    currency: 'CNY',
    status: 'settled' as Status,
    time: '12:46',
    source: 'demo',
  },
  {
    id: 'PAY-8408',
    zh: '企业名单验证服务',
    en: 'Company list verification',
    payer: 'Growth Studio',
    payee: 'Lead Verify AI',
    buyer: 'Outbound Agent',
    seller: 'Verification Agent',
    amount: 18,
    currency: 'CNY',
    status: 'refunded' as Status,
    time: '10:21',
    source: 'demo',
  },
];

export default function Home() {
  const [language, setLanguage] = useState<Language>('zh');
  const [page, setPage] = useState<Page>('transactions');
  const [selectedId, setSelectedId] = useState('PAY-8421');
  const [stage, setStage] = useState<Stage>('review');
  const [liveTxs, setLiveTxs] = useState<TransactionCard[]>([]);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const t = copy[language];
  const transactions = useMemo(() => [...liveTxs, ...demoTxs], [liveTxs]);
  const selected =
    transactions.find((tx) => tx.id === selectedId) ?? transactions[0];

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/v1/transactions`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { data: TransactionApiItem[] };
      })
      .then(({ data }) => {
        const mapped: TransactionCard[] = data.map(
          ({
            transaction,
            payment_intent,
            quote,
            delivery,
            receipt,
            payment_channel,
            settlement_control,
          }) => {
            const amount = ['settled', 'refunded', 'disputed'].includes(
              transaction.status,
            )
              ? transaction.settled_amount
              : transaction.authorized_amount;
            const hasReceiptTrustEvidence =
              typeof receipt?.signature_valid === 'boolean' &&
              typeof receipt?.issuer_trusted === 'boolean' &&
              typeof receipt?.settlement_confirmed === 'boolean';
            return {
              id: transaction.id,
              zh: quote?.item.name ?? 'Agent 支付',
              en: quote?.item.name ?? 'Agent payment',
              payer: payment_intent?.payer_account_id ?? 'Unknown payer',
              payee: payment_intent?.payee_account_id ?? 'Unknown payee',
              buyer: payment_intent?.buyer_agent_id ?? 'Unknown buyer agent',
              seller: payment_intent?.seller_agent_id ?? 'Unknown seller agent',
              amount: amount.value / 100,
              currency: amount.currency,
              status: normalizeStatus(
                transaction.status,
                settlement_control?.status,
              ),
              time: new Date(transaction.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              source: 'api',
              channel: payment_channel,
              chainHash:
                payment_channel === 'x402_exact_base_sepolia'
                  ? transaction.settlement_provider_reference
                  : undefined,
              providerReference: transaction.settlement_provider_reference,
              receiptId: receipt?.id,
              receiptValid: hasReceiptTrustEvidence
                ? receipt?.valid
                : undefined,
              signatureValid: receipt?.signature_valid,
              issuerTrusted: receipt?.issuer_trusted,
              settlementConfirmed: receipt?.settlement_confirmed,
              receiptSchemaVersion: receipt?.schema_version,
              deliveryHash: delivery?.evidence_hash,
              mandateId: payment_intent?.payment_mandate_id,
              quoteTime: formatApiTime(quote?.created_at),
              requestTime: formatApiTime(payment_intent?.created_at),
              reserveTime: formatApiTime(transaction.created_at),
              deliveryTime: formatApiTime(delivery?.submitted_at),
              settlementTime: formatApiTime(
                transaction.settled_at ?? receipt?.signed_at,
              ),
              reserveReference: transaction.reserve_provider_reference,
              quotePresent: Boolean(quote),
              requestPresent: Boolean(payment_intent),
            };
          },
        );
        setLiveTxs(mapped);
        setApiOnline(true);
        if (mapped[0]) {
          setSelectedId((current) =>
            current === 'PAY-8421' ? mapped[0].id : current,
          );
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') {
          setApiOnline(false);
        }
      });
    return () => controller.abort();
  }, []);
  const nav = [
    ['transactions', t.transactions, Activity],
    ['authorizations', t.authorizations, ShieldCheck],
    ['mandates', t.mandates, FileCheck2],
    ['wallets', t.wallets, WalletCards],
    ['agents', t.agents, Bot],
    ['ledger', t.ledger, ReceiptText],
    ['developers', t.developers, Code2],
  ] as const;
  const title =
    page === 'detail'
      ? t.detail
      : (nav.find(([key]) => key === page)?.[1] ?? t.transactions);
  const open = (id: string) => {
    setSelectedId(id);
    setPage('detail');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            BU2
          </div>
          <div>
            <p className="font-semibold text-white">BU2.com</p>
            <p className="text-xs text-sidebar-foreground/60">{t.product}</p>
          </div>
        </div>
        <nav
          className="flex-1 space-y-1 px-3 py-5"
          aria-label={language === 'zh' ? '主导航' : 'Main navigation'}
        >
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setPage(key)}
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm ${page === key || (page === 'detail' && key === 'transactions') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
            >
              <Icon className="size-4" />
              {label}
              {key === 'authorizations' && stage === 'review' ? (
                <span className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                  1
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <button className="m-3 flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70">
          <Settings2 className="size-4" />
          {t.settings}
        </button>
      </aside>
      <section className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b bg-background/90 px-5 backdrop-blur-xl sm:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t.workspace}
            </p>
            <h1 className="mt-1 text-xl font-semibold">{title}</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            >
              <Languages className="size-4" />
              {language === 'zh' ? 'EN' : '中文'}
            </Button>
            <Button variant="outline" size="icon" aria-label={t.search}>
              <Search className="size-4" />
            </Button>
            <Badge
              variant="outline"
              className="hidden border-success/30 bg-success/10 text-success sm:flex"
            >
              {t.network}
            </Badge>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          {page === 'transactions' ? (
            <Transactions
              language={language}
              t={t}
              stage={stage}
              transactions={transactions}
              apiOnline={apiOnline}
              open={open}
            />
          ) : null}
          {page === 'detail' ? (
            <Detail
              language={language}
              t={t}
              tx={selected}
              stage={selected.id === 'PAY-8421' ? stage : undefined}
              setStage={setStage}
              back={() => setPage('transactions')}
            />
          ) : null}
          {page === 'authorizations' ? (
            <Authorizations t={t} stage={stage} open={() => open('PAY-8421')} />
          ) : null}
          {page === 'developers' ? <Developers language={language} /> : null}
          {!['transactions', 'detail', 'authorizations', 'developers'].includes(
            page,
          ) ? (
            <Supporting page={page} t={t} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Transactions({
  language,
  t,
  stage,
  transactions,
  apiOnline,
  open,
}: {
  language: Language;
  t: typeof copy.zh;
  stage: Stage;
  transactions: TransactionCard[];
  apiOnline: boolean | null;
  open: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="surface overflow-hidden bg-[radial-gradient(circle_at_top_right,oklch(0.91_0.08_185),transparent_42%)] p-6 sm:p-8">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="eyebrow">{t.transactionFirst}</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">{t.heading}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {t.subheading}
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t.volume, '¥12,480', '+18.2%'],
          [t.completed, '186', '98.4%'],
          [t.activeAgents, '42', '+6'],
          [t.autoRate, '92.7%', '+3.1%'],
        ].map(([label, value, delta]) => (
          <div key={label} className="surface p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-2 flex items-end justify-between">
              <strong className="text-2xl">{value}</strong>
              <span className="text-xs text-success">{delta}</span>
            </div>
          </div>
        ))}
      </section>
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="eyebrow">{t.recent}</p>
            <h3 className="mt-1 text-lg font-semibold">{t.all}</h3>
          </div>
          <div className="flex items-center gap-2">
            {apiOnline === true ? (
              <Badge className="bg-success/12 text-success hover:bg-success/12">
                {t.liveData}
              </Badge>
            ) : null}
            <Badge variant="outline">{transactions.length}</Badge>
          </div>
        </div>
        {apiOnline === false ? (
          <div className="border-b bg-warning/10 px-5 py-3 text-sm text-warning-foreground">
            {t.apiOffline}
          </div>
        ) : null}
        <div className="divide-y">
          {transactions.map((tx) => (
            <button
              key={tx.id}
              onClick={() => open(tx.id)}
              className="grid w-full gap-3 p-5 text-left hover:bg-muted/50 md:grid-cols-[1.5fr_1.2fr_.6fr_.8fr_auto] md:items-center"
            >
              <div>
                <strong className="text-sm">
                  {language === 'zh' ? tx.zh : tx.en}
                </strong>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {tx.id} · {tx.time}
                </p>
              </div>
              <div className="text-sm">
                <p>{tx.payer}</p>
                <p className="text-xs text-muted-foreground">→ {tx.payee}</p>
              </div>
              <strong className="text-sm">{formatAmount(tx)}</strong>
              <StatusBadge
                status={
                  tx.id === 'PAY-8421' && stage === 'settled'
                    ? 'settled'
                    : tx.status
                }
                stage={tx.id === 'PAY-8421' ? stage : undefined}
                t={t}
              />
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Detail({
  language,
  t,
  tx,
  stage,
  setStage,
  back,
}: {
  language: Language;
  t: typeof copy.zh;
  tx: TransactionCard;
  stage?: Stage;
  setStage: (s: Stage) => void;
  back: () => void;
}) {
  const demo = tx.id === 'PAY-8421';
  const live = tx.source === 'api';
  const currentStatus = demo && stage ? stageStatus(stage) : tx.status;
  const reserved = hasReached(currentStatus, 'funds_reserved');
  const delivered = hasReached(currentStatus, 'delivery_submitted');
  const settled = currentStatus === 'settled' || currentStatus === 'refunded';
  const receiptState =
    tx.receiptValid === true
      ? 'valid'
      : tx.receiptValid === false
        ? 'invalid'
        : 'unknown';
  return (
    <div className="space-y-6">
      <button
        onClick={back}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.back}
      </button>
      <section className="surface p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div>
            <div className="flex gap-2">
              <StatusBadge status={currentStatus} t={t} />
              <Badge variant="outline" className="font-mono">
                {tx.id}
              </Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold">
              {language === 'zh' ? tx.zh : tx.en}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {tx.buyer} → {tx.seller}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t.amount}</p>
            <p className="mt-1 text-3xl font-semibold">{formatAmount(tx)}</p>
          </div>
        </div>
        <div className="mt-7 grid gap-5 border-t pt-6 md:grid-cols-3">
          <Info label={t.parties} value={`${tx.payer} → ${tx.payee}`} />
          <Info
            label={t.context}
            value={
              live
                ? `${t.liveData} · ${tx.channel}`
                : demo
                  ? t.contextValue
                  : 'Agent API · external_run_id'
            }
          />
          <Info label={t.purpose} value={language === 'zh' ? tx.zh : tx.en} />
          <Info label={t.dataSource} value={live ? t.liveData : t.demoData} />
        </div>
      </section>
      {demo ? (
        <Decision t={t} stage={stage ?? 'review'} setStage={setStage} />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <section className="surface p-6">
          <p className="eyebrow">{t.timeline}</p>
          <h3 className="mt-1 text-lg font-semibold">{t.timeline}</h3>
          <div className="mt-6">
            <Timeline
              done={!live || tx.quotePresent === true}
              title={t.quote}
              detail={`${tx.seller} · ${formatAmount(tx)}`}
              time={live ? (tx.quoteTime ?? '—') : '14:31:54'}
            />
            <Timeline
              done={!live || tx.requestPresent === true}
              title={t.requested}
              detail={demo ? t.mandateValue : t.mandateAutoApproved}
              time={live ? (tx.requestTime ?? '—') : '14:32:01'}
            />
            <Timeline
              done={reserved}
              title={t.fundsReserved}
              detail={`BU2 Wallet · ${live ? (tx.reserveReference ?? '—') : 'rsrv_91B2'}`}
              time={
                reserved ? (live ? (tx.reserveTime ?? '—') : '14:33:18') : '—'
              }
            />
            <Timeline
              done={delivered}
              title={t.delivered}
              detail={`delivery_hash: ${tx.deliveryHash ?? (live ? '—' : 'sha256:9fc2…a17e')}`}
              time={
                delivered ? (live ? (tx.deliveryTime ?? '—') : '14:41:06') : '—'
              }
            />
            <Timeline
              done={settled}
              title={t.settlement}
              detail={`${tx.payee} · ${formatAmount(tx)}`}
              time={
                settled ? (live ? (tx.settlementTime ?? '—') : '14:41:09') : '—'
              }
              last
            />
          </div>
        </section>
        <div className="space-y-6">
          <section className="surface p-6">
            <p className="eyebrow">{t.mandateEyebrow}</p>
            <h3 className="mt-1 text-lg font-semibold">{t.mandate}</h3>
            <div className="mt-5 rounded-xl bg-muted p-4">
              <div className="flex gap-3">
                <ShieldCheck className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {tx.mandateId ?? 'MDT-RESEARCH-04'}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t.mandateValue}
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section className="surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">{t.receiptEyebrow}</p>
                <h3 className="mt-1 text-lg font-semibold">{t.receipt}</h3>
              </div>
              <BadgeCheck
                className={`size-6 ${receiptState === 'valid' ? 'text-success' : receiptState === 'invalid' ? 'text-destructive' : 'text-muted-foreground/40'}`}
              />
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.receiptId}</dt>
                <dd className="font-mono">
                  {tx.receiptId ?? (demo && settled ? 'rcpt_8A21F' : '—')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.verify}</dt>
                <dd>
                  {demo && settled
                    ? `✓ ${t.receiptValid}`
                    : receiptState === 'valid'
                      ? `✓ ${t.receiptValid}`
                      : receiptState === 'invalid'
                        ? `✕ ${t.receiptInvalid}`
                        : t.receiptUnknown}
                </dd>
              </div>
              {live && tx.receiptId ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t.receiptVersion}
                    </dt>
                    <dd className="font-mono">
                      {tx.receiptSchemaVersion ?? '—'}
                    </dd>
                  </div>
                  <VerificationRow
                    label={t.signatureValid}
                    value={tx.signatureValid}
                  />
                  <VerificationRow
                    label={t.issuerTrusted}
                    value={tx.issuerTrusted}
                  />
                  <VerificationRow
                    label={t.settlementConfirmed}
                    value={tx.settlementConfirmed}
                  />
                </>
              ) : null}
              {tx.chainHash ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {t.chainTransaction}
                  </dt>
                  <dd className="max-w-[190px] break-all text-right font-mono text-xs">
                    <a
                      className="text-primary hover:underline"
                      href={`https://sepolia.basescan.org/tx/${tx.chainHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tx.chainHash}
                    </a>
                  </dd>
                </div>
              ) : null}
              {!tx.chainHash && tx.providerReference ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {t.providerReference}
                  </dt>
                  <dd className="max-w-[190px] break-all text-right font-mono text-xs">
                    {tx.providerReference}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Decision({
  t,
  stage,
  setStage,
}: {
  t: typeof copy.zh;
  stage: Stage;
  setStage: (s: Stage) => void;
}) {
  const title =
    stage === 'review'
      ? t.authorizationRequired
      : stage === 'reserved'
        ? t.reserved
        : t.settledTitle;
  const body =
    stage === 'review'
      ? t.authorizationCopy
      : stage === 'reserved'
        ? t.reservedCopy
        : t.settledCopy;
  return (
    <section
      className={`surface border-l-4 p-6 ${stage === 'review' ? 'border-l-warning' : 'border-l-success'}`}
    >
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="flex max-w-3xl gap-4">
          <div
            className={`grid size-10 shrink-0 place-items-center rounded-full ${stage === 'review' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}
          >
            {stage === 'settled' ? (
              <Check className="size-5" />
            ) : (
              <Fingerprint className="size-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {body}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {stage === 'review' ? (
            <>
              <Button variant="outline">{t.decline}</Button>
              <Button onClick={() => setStage('reserved')}>
                {t.authorize}
              </Button>
            </>
          ) : stage === 'reserved' ? (
            <Button onClick={() => setStage('settled')}>
              {t.confirmDelivery}
            </Button>
          ) : (
            <Badge className="bg-success text-white">{t.settled}</Badge>
          )}
        </div>
      </div>
    </section>
  );
}

function Authorizations({
  t,
  stage,
  open,
}: {
  t: typeof copy.zh;
  stage: Stage;
  open: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="surface p-7">
        <p className="eyebrow">{t.authorizationEyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold">{t.queueTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t.queueCopy}
        </p>
      </section>
      {stage === 'review' ? (
        <button
          onClick={open}
          className="surface flex w-full items-center justify-between p-6 text-left hover:border-primary/40"
        >
          <div>
            <Badge className="bg-warning text-warning-foreground">
              {t.pending}
            </Badge>
            <h3 className="mt-3 font-semibold">Atlas Data Lab · ¥39.00</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Research Copilot → Market Data Agent
            </p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
      ) : (
        <section className="surface grid place-items-center p-12">
          <Check className="size-8 text-success" />
          <h3 className="mt-4 font-semibold">0 {t.authorizations}</h3>
        </section>
      )}
    </div>
  );
}

function Supporting({ page, t }: { page: Page; t: typeof copy.zh }) {
  const map: Record<string, [string, typeof WalletCards]> = {
    mandates: [t.mandateTitle, FileCheck2],
    wallets: [t.walletTitle, WalletCards],
    agents: [t.agentTitle, Bot],
    ledger: [t.ledgerTitle, ReceiptText],
    developers: [t.developerTitle, Code2],
  };
  const [title, Icon] = map[page] ?? [t.transactions, Activity];
  return (
    <section className="surface p-8">
      <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {t.secondary}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {['API', 'MCP', 'x402 / AP2'].map((item) => (
          <div key={item} className="rounded-xl border bg-muted/30 p-5">
            <p className="font-mono text-sm font-semibold">{item}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              BU2 Agent Payment Protocol
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Developers({ language }: { language: Language }) {
  const zh = language === 'zh';
  const endpoints = [
    [
      'GET',
      '/v1/transactions?limit=20&cursor=…',
      zh ? '分页读取交易' : 'List transactions with cursor pagination',
    ],
    ['POST', '/v1/quotes', zh ? '创建卖方报价' : 'Create seller quote'],
    [
      'POST',
      '/v1/payment_intents',
      zh ? '创建支付意图并评估 Mandate' : 'Create intent and evaluate mandate',
    ],
    [
      'POST',
      '/v1/transactions/{id}/deliveries',
      zh ? '提交交付证据' : 'Submit delivery evidence',
    ],
    [
      'POST',
      '/v1/transactions/{id}/settlements',
      zh ? '结算并签发 Receipt' : 'Settle and issue receipt',
    ],
  ];
  return (
    <div className="space-y-6">
      <section className="surface p-7 sm:p-8">
        <div className="flex items-center gap-2 text-primary">
          <Code2 className="size-4" />
          <span className="eyebrow">API contract v0.1</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold">
          {zh
            ? '把 BU2 嵌入 Agent，而不是迁移工作流'
            : 'Embed BU2 into agents—do not migrate workflows'}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {zh
            ? '统一资源、金额、状态、幂等、分页、请求关联与错误契约已经冻结为 Phase 0 基线。API 与 MCP 共享同一套交易语义。'
            : 'Resources, amounts, states, idempotency, pagination, request correlation, and errors are frozen for Phase 0. API and MCP share one transaction model.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {['OpenAPI 3.1', 'REST /v1', 'MCP 0.1', 'Minor-unit amounts'].map(
            (item) => (
              <Badge key={item} variant="outline" className="font-mono">
                {item}
              </Badge>
            ),
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <section className="surface overflow-hidden">
          <div className="border-b p-5">
            <p className="eyebrow">Core endpoints</p>
            <h3 className="mt-1 text-lg font-semibold">
              {zh ? '首个交易闭环' : 'First payment loop'}
            </h3>
          </div>
          <div className="divide-y">
            {endpoints.map(([method, path, description]) => (
              <div
                key={path}
                className="grid gap-2 p-5 sm:grid-cols-[56px_1fr]"
              >
                <Badge className="w-fit bg-primary/10 font-mono text-primary hover:bg-primary/10">
                  {method}
                </Badge>
                <div>
                  <code className="text-sm font-semibold">{path}</code>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface overflow-hidden bg-[#0e1d24] text-slate-100">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <span className="font-mono text-xs text-slate-400">
              create-payment-intent.json
            </span>
            <Badge className="bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/15">
              Idempotent
            </Badge>
          </div>
          <pre className="overflow-x-auto p-5 text-xs leading-6 text-slate-300">
            <code>{`{
  "quote_id": "quo_01KBU2A",
  "payer_account_id": "acct_bu2_ventures",
  "buyer_agent_id": "agt_research_copilot",
  "payment_mandate_id": "mdt_research_04",
  "amount": { "value": 3900, "currency": "CNY" },
  "purpose": "Southeast Asia commerce dataset",
  "external_context": {
    "type": "chatgpt_conversation",
    "id": "conv_external_8421"
  }
}`}</code>
          </pre>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          [
            'MCP',
            zh ? '6 个 Agent 原生工具' : '6 agent-native tools',
            'bu2_create_payment_intent',
          ],
          [
            'State machine',
            zh
              ? '授权、预留、交付、结算分离'
              : 'Separate authorize, reserve, deliver, settle',
            '409 invalid_state_transition',
          ],
          [
            'Receipt',
            zh
              ? '交易和交付证据可验证'
              : 'Verifiable transaction and delivery evidence',
            'Ed25519 · rcpt_',
          ],
        ].map(([label, title, detail]) => (
          <div key={label} className="surface p-5">
            <p className="eyebrow">{label}</p>
            <h3 className="mt-2 text-sm font-semibold">{title}</h3>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {detail}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function StatusBadge({
  status,
  stage,
  t,
}: {
  status: Status;
  stage?: Stage;
  t: typeof copy.zh;
}) {
  if (stage === 'settled' || status === 'settled')
    return (
      <Badge className="w-fit bg-success/12 text-success hover:bg-success/12">
        {t.settled}
      </Badge>
    );
  if (status === 'refunded')
    return <Badge variant="outline">{t.refunded}</Badge>;
  if (status === 'provider_unknown')
    return (
      <Badge className="w-fit bg-warning text-warning-foreground hover:bg-warning">
        {t.providerUnknown}
      </Badge>
    );
  if (status === 'delivery_submitted')
    return <Badge variant="outline">{t.deliveredStatus}</Badge>;
  if (
    stage === 'reserved' ||
    status === 'funds_reserved' ||
    status === 'authorized'
  )
    return (
      <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
        {t.reserved}
      </Badge>
    );
  if (status === 'declined')
    return <Badge variant="destructive">{t.declinedStatus}</Badge>;
  if (['expired', 'canceled', 'disputed'].includes(status))
    return <Badge variant="outline">{t.inactiveStatus}</Badge>;
  return (
    <Badge className="w-fit bg-warning text-warning-foreground hover:bg-warning">
      {t.pending}
    </Badge>
  );
}

function VerificationRow({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value === true ? '✓' : value === false ? '✕' : '—'}</dd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function formatAmount(tx: TransactionCard) {
  const symbol =
    tx.currency === 'CNY'
      ? '¥'
      : tx.currency === 'USD'
        ? '$'
        : `${tx.currency} `;
  return `${symbol}${tx.amount.toFixed(2)}`;
}

function formatApiTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function normalizeStatus(
  transactionStatus: string,
  settlementStatus?: string,
): Status {
  if (settlementStatus === 'provider_unknown') return 'provider_unknown';
  const supported: Status[] = [
    'authorization_required',
    'authorized',
    'funds_reserved',
    'delivery_submitted',
    'settled',
    'refunded',
    'declined',
    'expired',
    'canceled',
    'disputed',
  ];
  return supported.includes(transactionStatus as Status)
    ? (transactionStatus as Status)
    : 'provider_unknown';
}

function stageStatus(stage: Stage): Status {
  if (stage === 'settled') return 'settled';
  if (stage === 'reserved') return 'funds_reserved';
  return 'authorization_required';
}

function hasReached(
  status: Status,
  target: 'funds_reserved' | 'delivery_submitted',
) {
  const rank: Partial<Record<Status, number>> = {
    funds_reserved: 1,
    delivery_submitted: 2,
    provider_unknown: 2,
    settled: 3,
    refunded: 3,
  };
  return (rank[status] ?? 0) >= (target === 'funds_reserved' ? 1 : 2);
}

function Timeline({
  done,
  title,
  detail,
  time,
  last = false,
}: {
  done: boolean;
  title: string;
  detail: string;
  time: string;
  last?: boolean;
}) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-0.5 grid size-5 place-items-center rounded-full border ${done ? 'border-success bg-success text-white' : 'bg-background'}`}
        >
          {done ? <Check className="size-3" /> : null}
        </span>
        {!last ? (
          <span
            className={`h-full w-px ${done ? 'bg-success/40' : 'bg-border'}`}
          />
        ) : null}
      </div>
      <div className="pb-7">
        <p
          className={`text-sm font-medium ${done ? '' : 'text-muted-foreground'}`}
        >
          {title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <time className="font-mono text-xs text-muted-foreground">{time}</time>
    </div>
  );
}
