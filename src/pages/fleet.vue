<script setup lang="ts">
// Wickfleet fleet view: totals per stake currency, dry and live never summed.
import type { TableColumn } from '@nuxt/ui';
import type {
  FleetBot,
  FleetReport,
  Signal,
  WaitingRule,
  Watch,
  Watchlist,
} from '@/composables/useWickfleet';
import { money, pct, ruleGap, ruleValue, tone } from '@/composables/wickfleetFormat';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi } = useWickfleet();
const report = ref<FleetReport>();
const signals = ref<Signal[]>([]);
const watchlist = ref<Watchlist>();
const waiting = ref<WaitingRule[]>([]);
const error = ref('');

async function load() {
  try {
    const [f, s, w, r] = await Promise.all([
      hubApi.fleet(),
      hubApi.signals().catch(() => undefined),
      hubApi.watchlist().catch(() => undefined),
      hubApi.waiting().catch(() => undefined),
    ]);
    report.value = f;
    waiting.value = r ?? [];
    signals.value = s?.signals ?? [];
    if (!editing.value) watchlist.value = w;
    error.value = '';
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

const notes = computed(
  () => new Map((watchlist.value?.symbols ?? []).map((w) => [w.symbol, w.note ?? ''])),
);

// Watchlist editor: admins replace the whole list in one commit.
const editing = ref(false);
const draft = ref<Watch[]>([]);
const saving = ref(false);
const symbolOk = (s: string) => /^[A-Za-z0-9^][A-Za-z0-9.=^-]{0,19}$/.test(s.trim());
const draftOk = computed(() => {
  const syms = draft.value.map((w) => w.symbol.trim().toUpperCase());
  return syms.every(symbolOk) && new Set(syms).size === syms.length && syms.length <= 50;
});

function startEdit() {
  draft.value = (watchlist.value?.symbols ?? []).map((w) => ({ ...w }));
  editing.value = true;
}

async function saveWatchlist() {
  saving.value = true;
  try {
    const symbols = draft.value.map((w) => ({
      symbol: w.symbol.trim().toUpperCase(),
      note: w.note?.trim() || undefined,
    }));
    const res = await hubApi.saveWatchlist(symbols);
    showAlert(`Watchlist: ${res.result}. ${res.note ?? ''}`, 'success');
    editing.value = false;
    watchlist.value = { symbols, editable: true };
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`Watchlist: ${msg}`, 'error');
  } finally {
    saving.value = false;
  }
}

const botColumns: TableColumn<FleetBot>[] = [
  { accessorKey: 'name', header: 'Bot' },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'investment', header: 'Invested' },
  { accessorKey: 'value', header: 'Value' },
  { accessorKey: 'profit_net', header: 'Profit net' },
  { accessorKey: 'fees', header: 'Fees' },
  { accessorKey: 'return_pct', header: 'Return' },
  { accessorKey: 'trades', header: 'Trades' },
  { accessorKey: 'fee_per_trade', header: 'Fee / trade' },
];

const waitingColumns: TableColumn<WaitingRule>[] = [
  { accessorKey: 'bot', header: 'Bot' },
  { accessorKey: 'pair', header: 'Pair' },
  { accessorKey: 'rule', header: 'Rule' },
  { accessorKey: 'left', header: 'Now' },
  { accessorKey: 'right', header: 'Needs' },
  { accessorKey: 'met', header: 'Status' },
  { accessorKey: 'gap', header: 'Still to move' },
];

const signalColumns: TableColumn<Signal>[] = [
  { accessorKey: 'symbol', header: 'Symbol' },
  { id: 'note', header: 'Note' },
  { accessorKey: 'hold', header: 'Signal' },
  { accessorKey: 'gap', header: 'vs 10-month average' },
  { accessorKey: 'month', header: 'Month' },
];

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 60_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-6xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Fleet</h2>
      <span v-if="report" class="text-sm text-neutral-500"
        >as of {{ new Date(report.at).toLocaleString() }}</span
      >
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />

    <div v-if="report" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="t in report.totals" :key="`${t.dry}-${t.stake}`">
        <template #header>
          <span class="font-semibold">{{ t.dry ? 'Dry run' : 'Live' }}, {{ t.stake }}</span>
          <span class="text-sm text-neutral-500"> · {{ t.bots }} bots, {{ t.trades }} trades</span>
        </template>
        <dl class="grid grid-cols-2 gap-1 text-sm">
          <dt>Invested</dt>
          <dd class="text-end">{{ money(t.investment) }}</dd>
          <dt>Value</dt>
          <dd class="text-end">{{ money(t.value) }}</dd>
          <dt>Profit after fees</dt>
          <dd class="text-end" :class="tone(t.profit_net)">{{ money(t.profit_net) }}</dd>
          <dt>Fees paid</dt>
          <dd class="text-end">{{ money(t.fees) }}</dd>
          <dt>Return</dt>
          <dd class="text-end" :class="tone(t.return_pct)">{{ pct(t.return_pct) }}</dd>
        </dl>
      </UCard>
    </div>

    <UCard v-if="report">
      <template #header><span class="font-semibold">Bots</span></template>
      <UTable :data="report.bots" :columns="botColumns">
        <template #name-cell="{ row }">
          {{ row.original.name }}
          <UBadge
            v-if="row.original.error"
            color="error"
            variant="subtle"
            class="ms-1"
            :title="row.original.error"
            >unreachable</UBadge
          >
          <UBadge v-else-if="!row.original.dry" color="warning" variant="subtle" class="ms-1"
            >live</UBadge
          >
        </template>
        <template #investment-cell="{ row }"
          >{{ money(row.original.investment) }} {{ row.original.stake }}</template
        >
        <template #value-cell="{ row }">{{ money(row.original.value) }}</template>
        <template #profit_net-cell="{ row }"
          ><span :class="tone(row.original.profit_net)">{{
            money(row.original.profit_net)
          }}</span></template
        >
        <template #fees-cell="{ row }">{{ money(row.original.fees) }}</template>
        <template #return_pct-cell="{ row }"
          ><span :class="tone(row.original.return_pct)">{{
            pct(row.original.return_pct)
          }}</span></template
        >
        <template #fee_per_trade-cell="{ row }">{{ money(row.original.fee_per_trade) }}</template>
      </UTable>
    </UCard>

    <UCard v-if="waiting.length">
      <template #header>
        <span class="font-semibold">Waiting for</span>
        <span class="text-sm text-neutral-500">
          · each bot's entry rules on the last closed candle; a bot buys when all hold</span
        >
      </template>
      <UTable :data="waiting" :columns="waitingColumns">
        <template #left-cell="{ row }">{{
          row.original.error ? '' : ruleValue(row.original.left)
        }}</template>
        <template #right-cell="{ row }">{{
          row.original.error ? '' : ruleValue(row.original.right)
        }}</template>
        <template #met-cell="{ row }">
          <UBadge
            v-if="row.original.error"
            color="neutral"
            variant="subtle"
            :title="row.original.error"
            >no data</UBadge
          >
          <UBadge v-else :color="row.original.met ? 'success' : 'warning'" variant="subtle">{{
            row.original.met ? 'met' : 'waiting'
          }}</UBadge>
        </template>
        <template #gap-cell="{ row }">{{
          row.original.error ? '' : ruleGap(row.original)
        }}</template>
      </UTable>
    </UCard>

    <UCard v-if="watchlist || signals.length">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-semibold">Watchlist</span>
          <span class="text-sm text-neutral-500 me-auto">
            · hold while the month-end close is above its 10-month average; orders by hand</span
          >
          <UButton
            v-if="watchlist?.editable && !editing"
            size="sm"
            color="neutral"
            icon="mdi:pencil"
            label="Edit"
            @click="startEdit"
          />
        </div>
      </template>

      <div v-if="editing" class="flex flex-col gap-2">
        <p class="text-sm text-neutral-500">
          Any Yahoo Finance symbol: XIC.TO, AAPL, BTC-USD, CADUSD=X, ^GSPC. Shared by everyone; the
          monthly summary goes to Telegram.
        </p>
        <div v-for="(w, i) in draft" :key="i" class="flex gap-2">
          <UInput
            v-model="w.symbol"
            class="w-40"
            placeholder="XIC.TO"
            :color="w.symbol && !symbolOk(w.symbol) ? 'error' : undefined"
          />
          <UInput v-model="w.note" class="flex-1" placeholder="note (optional)" maxlength="80" />
          <UButton
            color="neutral"
            icon="mdi:delete"
            :title="`Remove ${w.symbol}`"
            @click="draft.splice(i, 1)"
          />
        </div>
        <div class="flex gap-2 justify-end">
          <UButton
            color="neutral"
            variant="outline"
            icon="mdi:plus"
            label="Add symbol"
            class="me-auto"
            :disabled="draft.length >= 50"
            @click="draft.push({ symbol: '', note: '' })"
          />
          <UButton color="neutral" variant="outline" label="Cancel" @click="editing = false" />
          <UButton
            icon="mdi:content-save"
            label="Save"
            :loading="saving"
            :disabled="!draftOk"
            @click="saveWatchlist"
          />
        </div>
      </div>

      <UTable v-else :data="signals" :columns="signalColumns">
        <template #note-cell="{ row }">{{ notes.get(row.original.symbol) }}</template>
        <template #hold-cell="{ row }">
          <UBadge
            v-if="row.original.error"
            color="neutral"
            variant="subtle"
            :title="row.original.error"
            >no data</UBadge
          >
          <UBadge v-else :color="row.original.hold ? 'success' : 'error'" variant="subtle">{{
            row.original.hold ? 'HOLD' : 'OUT'
          }}</UBadge>
        </template>
        <template #gap-cell="{ row }"
          ><span :class="tone(row.original.gap)">{{ pct(row.original.gap * 100) }}</span></template
        >
      </UTable>
    </UCard>
  </div>
</template>
