<script setup lang="ts">
// Wickfleet replay: backtest a bot over any range of the hub's candle store.
import type { TableColumn } from '@nuxt/ui';
import type { HubBot, ReplayJob, ReplayList, ReplayTrade } from '@/composables/useWickfleet';
import { money, pct, tone } from '@/composables/wickfleetFormat';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi } = useWickfleet();
const route = useRoute();
const list = ref<ReplayList>();
const bots = ref<HubBot[]>([]);
const error = ref('');
const busy = ref(false);

const day = (d: Date) => d.toISOString().slice(0, 10);
const today = day(new Date());
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return day(d);
};
const form = ref({ bot: '', from: yearAgo(), to: today });

const selectedId = ref('');
const selected = ref<ReplayJob>();
const trades = ref<ReplayTrade[]>([]);

// The store's first day for the selected bot's exchange.
const since = computed(() => {
  const ex = bots.value.find((b) => b.name === form.value.bot)?.exchange?.toLowerCase() ?? '';
  return list.value?.since_by_exchange?.[ex] ?? list.value?.since;
});

const active = (j: ReplayJob) => j.state !== 'done' && j.state !== 'failed';
const replays = computed(() => (list.value?.jobs ?? []).filter((j) => j.kind === 'replay'));
const fetches = computed(() => (list.value?.jobs ?? []).filter((j) => j.kind === 'fetch'));
const formOk = computed(
  () =>
    !!form.value.bot &&
    form.value.from < form.value.to &&
    form.value.to <= today &&
    (!since.value || form.value.from >= since.value),
);

async function load() {
  try {
    const [l, b] = await Promise.all([hubApi.replays(), hubApi.bots()]);
    list.value = l;
    bots.value = b.bots;
    error.value = '';
    if (!form.value.bot) {
      const want = String(route.query.bot ?? '');
      form.value.bot = b.bots.find((x) => x.name === want)?.name ?? b.bots[0]?.name ?? '';
    }
    if (selectedId.value) await loadSelected();
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

async function loadSelected() {
  const r = await hubApi.replay(selectedId.value);
  selected.value = r.job;
  trades.value = r.trades ?? [];
}

async function select(id: string) {
  selectedId.value = id;
  await loadSelected();
}

function preset(months: number | 'all') {
  const d = new Date();
  if (months === 'all') {
    form.value.from = since.value ?? form.value.from;
  } else {
    d.setMonth(d.getMonth() - months);
    form.value.from = day(d);
  }
  form.value.to = today;
}

async function start() {
  busy.value = true;
  try {
    const res = await hubApi.startReplay({ ...form.value });
    showAlert(
      `Replay queued: ${form.value.bot}, ${form.value.from} to ${form.value.to}`,
      'success',
    );
    selectedId.value = res.id;
    await load();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`Replay: ${msg}`, 'error');
  } finally {
    busy.value = false;
  }
}

const biasColor = (s: string) =>
  s === 'clean' ? 'success' : s === 'biased' ? 'error' : s === 'skipped' ? 'neutral' : 'warning';
const stateColor = (s: ReplayJob['state']) =>
  s === 'done' ? 'success' : s === 'failed' ? 'error' : 'warning';

const jobColumns: TableColumn<ReplayJob>[] = [
  { accessorKey: 'bot', header: 'Bot' },
  { id: 'range', header: 'Range' },
  { accessorKey: 'state', header: 'State' },
  { id: 'profit', header: 'Profit after fees' },
  { id: 'fees', header: 'Fees' },
  { id: 'trades', header: 'Trades' },
  { id: 'open', header: '' },
];

const tradeColumns: TableColumn<ReplayTrade>[] = [
  { accessorKey: 'pair', header: 'Pair' },
  { accessorKey: 'open', header: 'Bought' },
  { accessorKey: 'close', header: 'Sold' },
  { accessorKey: 'open_rate', header: 'In' },
  { accessorKey: 'close_rate', header: 'Out' },
  { accessorKey: 'profit_net', header: 'Profit' },
  { accessorKey: 'fee', header: 'Fee' },
  { accessorKey: 'exit_reason', header: 'Why' },
];

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  // Poll only while something runs.
  timer = setInterval(() => {
    if ((list.value?.jobs ?? []).some(active)) void load();
  }, 5_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-6xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Replay</h2>
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <UAlert v-if="list && !list.enabled" color="neutral" title="Replay is off on this instance." />
    <p class="text-sm text-neutral-500">
      Runs the bot's own strategy and settings over past candles, with its fees. The candle store
      starts {{ since ?? '...' }} for this bot's exchange; the first Kraken replay of a pair can
      take a while, since Kraken candles are built from trades.
    </p>

    <UCard v-if="list?.enabled && list.can_run">
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Bot">
          <USelect
            v-model="form.bot"
            class="w-48"
            :items="bots.map((b) => b.name)"
            data-testid="replay-bot"
          />
        </UFormField>
        <UFormField label="From">
          <UInput v-model="form.from" type="date" :min="since" :max="form.to" />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="form.to" type="date" :max="today" />
        </UFormField>
        <div class="flex gap-1">
          <UButton size="sm" color="neutral" variant="outline" label="3M" @click="preset(3)" />
          <UButton size="sm" color="neutral" variant="outline" label="6M" @click="preset(6)" />
          <UButton size="sm" color="neutral" variant="outline" label="1Y" @click="preset(12)" />
          <UButton size="sm" color="neutral" variant="outline" label="All" @click="preset('all')" />
        </div>
        <UButton
          class="ms-auto"
          icon="mdi:play"
          label="Replay"
          :loading="busy"
          :disabled="!formOk"
          @click="start"
        />
      </div>
    </UCard>

    <UCard v-if="selected">
      <template #header>
        <span class="font-semibold"
          >{{ selected.bot }} · {{ selected.from }} to {{ selected.to }}</span
        >
        <UBadge :color="stateColor(selected.state)" variant="subtle" class="ms-2">{{
          selected.state
        }}</UBadge>
        <span v-if="selected.note" class="text-sm text-neutral-500"> · {{ selected.note }}</span>
      </template>
      <UAlert v-if="selected.error" color="error" :title="selected.error" />
      <div v-if="selected.summary" class="flex flex-col gap-4">
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
          <dt>Start</dt>
          <dd class="text-end">
            {{ money(selected.summary.start_balance) }} {{ selected.summary.stake }}
          </dd>
          <dt>End</dt>
          <dd class="text-end">{{ money(selected.summary.final_balance) }}</dd>
          <dt>Profit after fees</dt>
          <dd class="text-end" :class="tone(selected.summary.profit_net)">
            {{ money(selected.summary.profit_net) }} ({{ pct(selected.summary.profit_pct) }})
          </dd>
          <dt>Fees paid</dt>
          <dd class="text-end">{{ money(selected.summary.fees) }}</dd>
          <dt>Before fees</dt>
          <dd class="text-end">{{ money(selected.summary.profit_gross) }}</dd>
          <dt>Max drawdown</dt>
          <dd class="text-end">{{ pct(-selected.summary.max_drawdown_pct) }}</dd>
          <dt>Trades (won / lost)</dt>
          <dd class="text-end">
            {{ selected.summary.trades }} ({{ selected.summary.wins }} /
            {{ selected.summary.losses }})
          </dd>
          <dt>Buy and hold</dt>
          <dd class="text-end" :class="tone(selected.summary.market_pct)">
            {{ pct(selected.summary.market_pct) }}
          </dd>
        </dl>
        <div
          v-if="selected.bias"
          class="flex flex-wrap items-center gap-2 text-sm"
          data-testid="bias"
        >
          <span>Lookahead bias:</span>
          <UBadge :color="biasColor(selected.bias.lookahead)" variant="subtle">{{
            selected.bias.lookahead
          }}</UBadge>
          <span>Recursive:</span>
          <UBadge :color="biasColor(selected.bias.recursive)" variant="subtle">{{
            selected.bias.recursive
          }}</UBadge>
          <span v-if="selected.bias.indicators" class="text-red-600"
            >uses the future in {{ selected.bias.indicators }}</span
          >
          <span v-if="selected.bias.note" class="text-neutral-500">{{ selected.bias.note }}</span>
        </div>
        <RobustnessVerdict v-if="selected.robust" :robust="selected.robust" />
        <UTable :data="trades" :columns="tradeColumns">
          <template #open-cell="{ row }">{{ row.original.open.slice(0, 10) }}</template>
          <template #close-cell="{ row }">{{ row.original.close.slice(0, 10) }}</template>
          <template #profit_net-cell="{ row }"
            ><span :class="tone(row.original.profit_net)"
              >{{ money(row.original.profit_net) }} ({{ pct(row.original.profit_pct) }})</span
            ></template
          >
          <template #fee-cell="{ row }">{{ money(row.original.fee) }}</template>
        </UTable>
      </div>
    </UCard>

    <UCard v-if="list?.enabled">
      <template #header><span class="font-semibold">Replays</span></template>
      <UTable :data="replays" :columns="jobColumns">
        <template #range-cell="{ row }">{{ row.original.from }} to {{ row.original.to }}</template>
        <template #state-cell="{ row }">
          <UBadge :color="stateColor(row.original.state)" variant="subtle">{{
            row.original.state
          }}</UBadge>
        </template>
        <template #profit-cell="{ row }">
          <span v-if="row.original.summary" :class="tone(row.original.summary.profit_net)">
            {{ money(row.original.summary.profit_net) }} {{ row.original.summary.stake }} ({{
              pct(row.original.summary.profit_pct)
            }})
          </span>
        </template>
        <template #fees-cell="{ row }">{{
          row.original.summary ? money(row.original.summary.fees) : ''
        }}</template>
        <template #trades-cell="{ row }">{{ row.original.summary?.trades ?? '' }}</template>
        <template #open-cell="{ row }">
          <UButton
            size="sm"
            color="neutral"
            icon="mdi:eye"
            :title="`Show ${row.original.id}`"
            @click="select(row.original.id)"
          />
        </template>
      </UTable>
    </UCard>

    <UCard v-if="fetches.length">
      <template #header>
        <span class="font-semibold">Candle store</span>
        <span class="text-sm text-neutral-500"> · refreshed at hub start and daily</span>
      </template>
      <ul class="text-sm flex flex-col gap-1">
        <li v-for="f in fetches.slice(0, 6)" :key="f.id">
          <UBadge :color="stateColor(f.state)" variant="subtle">{{ f.state }}</UBadge>
          {{ f.exchange }}: {{ f.pairs.join(', ') }}
          <span class="text-neutral-500">{{ f.error || f.note }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
