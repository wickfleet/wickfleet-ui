<script setup lang="ts">
// Wickfleet compare: replay several bots over one window and line them up.
import type { TableColumn } from '@nuxt/ui';
import type { CompareList, CompareRow, Comparison, HubBot } from '@/composables/useWickfleet';
import { best, duration, maybe, moneyOrHidden, progress } from '@/composables/wickfleetCompare';
import { pct, tone } from '@/composables/wickfleetFormat';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi } = useWickfleet();
const list = ref<CompareList>();
const bots = ref<HubBot[]>([]);
const error = ref('');
const busy = ref(false);

const day = (d: Date) => d.toISOString().slice(0, 10);
const today = day(new Date());
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return day(d);
};
const form = ref({ from: monthsAgo(12), to: today, all: false, picked: [] as string[] });

const selectedId = ref('');
const selected = ref<Comparison>();

// Bots this login may replay: its own, or any for an admin.
const runnable = computed(() => bots.value.filter((b) => b.editable));
const count = computed(() => (form.value.all ? runnable.value.length : form.value.picked.length));
const formOk = computed(
  () =>
    count.value >= 2 &&
    count.value <= (list.value?.max_bots || 12) &&
    form.value.from < form.value.to &&
    form.value.to <= today,
);

function toggle(name: string, on: boolean | 'indeterminate') {
  const set = new Set(form.value.picked);
  if (on === true) set.add(name);
  else set.delete(name);
  form.value.picked = [...set];
}

async function load() {
  try {
    const [l, b] = await Promise.all([hubApi.compareList(), hubApi.bots()]);
    list.value = l;
    bots.value = b.bots;
    error.value = '';
    if (!selectedId.value && l.comparisons[0]) selectedId.value = l.comparisons[0].id;
    if (selectedId.value) selected.value = await hubApi.compare(selectedId.value);
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

async function select(id: string) {
  selectedId.value = id;
  selected.value = await hubApi.compare(id);
}

async function start() {
  busy.value = true;
  try {
    const body = form.value.all
      ? { all: true, from: form.value.from, to: form.value.to }
      : { bots: form.value.picked, from: form.value.from, to: form.value.to };
    const res = await hubApi.startCompare(body);
    showAlert(
      `Comparison queued: ${count.value} bots, ${form.value.from} to ${form.value.to}`,
      'success',
    );
    selectedId.value = res.id;
    await load();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`Compare: ${msg}`, 'error');
  } finally {
    busy.value = false;
  }
}

const rows = computed(() => selected.value?.bots ?? []);
// The best bot per column, highlighted.
const leaders = computed(() => ({
  profit: best(rows.value, (m) => m.profit_pct, true),
  dd: best(rows.value, (m) => m.max_drawdown_pct, false),
  sharpe: best(rows.value, (m) => m.sharpe, true),
  sortino: best(rows.value, (m) => m.sortino, true),
  pf: best(rows.value, (m) => m.profit_factor, true),
  mc: best(rows.value, (m) => m.mc_p95_drawdown_pct, false),
}));
const lead = (key: keyof typeof leaders.value, bot: string) =>
  leaders.value[key] === bot ? 'font-semibold underline decoration-dotted' : '';

const stateColor = (s: string) =>
  s === 'done' ? 'success' : s === 'failed' ? 'error' : s === 'waiting' ? 'neutral' : 'warning';
const verdictColor = (v: string) =>
  v === 'pass' ? 'success' : v === 'biased' ? 'error' : v === 'fail' ? 'warning' : 'neutral';

const columns: TableColumn<CompareRow>[] = [
  { accessorKey: 'bot', header: 'Bot' },
  { id: 'profit', header: 'Profit' },
  { id: 'dd', header: 'Max DD' },
  { id: 'sharpe', header: 'Sharpe' },
  { id: 'sortino', header: 'Sortino' },
  { id: 'win', header: 'Win rate' },
  { id: 'trades', header: 'Trades' },
  { id: 'duration', header: 'Avg hold' },
  { id: 'pf', header: 'Profit factor' },
  { id: 'windows', header: 'Windows' },
  { id: 'mc', header: 'MC DD (95%)' },
  { id: 'verdict', header: 'Verdict' },
];

const active = computed(() => selected.value?.state === 'running');
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  // Poll only while the shown comparison runs. Each call is short.
  timer = setInterval(() => {
    if (active.value) void load();
  }, 5_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-6xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Compare</h2>
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <UAlert
      v-if="list?.demo && !list.comparisons.length"
      color="neutral"
      data-testid="compare-demo"
      title="Comparisons are not available in the demo: a comparison runs replays, and the demo is read-only."
    />
    <UAlert
      v-else-if="list?.demo"
      color="neutral"
      data-testid="compare-demo"
      title="Read-only demo: this is the last comparison. Running a new one needs your own instance."
    />
    <UAlert
      v-else-if="list && !list.enabled"
      color="neutral"
      title="Replay is off on this instance, so comparisons are too."
    />
    <p class="text-sm text-neutral-500">
      Replays each bot with its own pairs, strategy, timeframe and stake over the same window, one
      after another in the replay queue, then lines the results up.
    </p>

    <UCard v-if="list?.can_run" data-testid="compare-form">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <UCheckbox
            v-model="form.all"
            :label="`All my bots (${runnable.length})`"
            data-testid="compare-all"
          />
          <template v-if="!form.all">
            <UCheckbox
              v-for="b in runnable"
              :key="b.name"
              :model-value="form.picked.includes(b.name)"
              :label="b.name"
              :data-testid="`compare-bot-${b.name}`"
              @update:model-value="toggle(b.name, $event)"
            />
          </template>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="From">
            <UInput v-model="form.from" type="date" :max="form.to" />
          </UFormField>
          <UFormField label="To">
            <UInput v-model="form.to" type="date" :max="today" />
          </UFormField>
          <div class="flex gap-1">
            <UButton
              v-for="m in [3, 6, 12]"
              :key="m"
              size="sm"
              color="neutral"
              variant="outline"
              :label="m === 12 ? '1Y' : `${m}M`"
              @click="form.from = monthsAgo(m)"
            />
          </div>
          <UButton
            class="ms-auto"
            icon="mdi:compare-horizontal"
            :label="`Compare ${count} bots`"
            :loading="busy"
            :disabled="!formOk"
            data-testid="compare-start"
            @click="start"
          />
        </div>
      </div>
    </UCard>

    <UCard v-if="selected" data-testid="compare-result">
      <template #header>
        <span class="font-semibold">{{ selected.from }} to {{ selected.to }}</span>
        <UBadge :color="stateColor(selected.state)" variant="subtle" class="ms-2">{{
          selected.state
        }}</UBadge>
        <span class="text-sm text-neutral-500"> · {{ progress(selected.bots) }}</span>
      </template>
      <UAlert v-if="selected.error" color="error" :title="selected.error" class="mb-3" />
      <UAlert
        v-if="selected.redacted"
        color="neutral"
        class="mb-3"
        data-testid="compare-redacted"
        title="Viewer access: amounts are hidden, percentages and ratios stay."
      />
      <!-- Phone: one card per bot, the table needs a wider screen. -->
      <div class="flex flex-col gap-3 sm:hidden" data-testid="compare-cards">
        <div v-for="r in rows" :key="r.bot" class="border-b border-neutral-700/40 pb-2">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ r.bot }}</span>
            <span class="text-xs text-neutral-500">{{ r.strategy }}</span>
            <UBadge
              v-if="r.metrics"
              class="ms-auto"
              :color="verdictColor(r.metrics.verdict)"
              variant="subtle"
              >{{ r.metrics.verdict }}</UBadge
            >
            <UBadge v-else class="ms-auto" :color="stateColor(r.state)" variant="subtle">{{
              r.state
            }}</UBadge>
          </div>
          <p v-if="!r.metrics" class="text-xs text-neutral-500">{{ r.error || r.note }}</p>
          <dl v-else class="grid grid-cols-2 gap-x-4 text-sm">
            <dt>Profit</dt>
            <dd class="text-end" :class="tone(r.metrics.profit_pct)">
              {{ pct(r.metrics.profit_pct) }} ({{
                moneyOrHidden(r.metrics.profit_abs, r.metrics.stake)
              }})
            </dd>
            <dt>Max drawdown</dt>
            <dd class="text-end">{{ pct(-r.metrics.max_drawdown_pct) }}</dd>
            <dt>Sharpe / Sortino</dt>
            <dd class="text-end">{{ maybe(r.metrics.sharpe) }} / {{ maybe(r.metrics.sortino) }}</dd>
            <dt>Trades, win rate</dt>
            <dd class="text-end">
              {{ r.metrics.trades }},
              {{
                r.metrics.win_rate_pct === undefined
                  ? 'n/a'
                  : `${r.metrics.win_rate_pct.toFixed(1)}%`
              }}
            </dd>
            <dt>Avg hold</dt>
            <dd class="text-end">{{ duration(r.metrics.avg_duration_s) }}</dd>
            <dt>Profit factor</dt>
            <dd class="text-end">{{ maybe(r.metrics.profit_factor) }}</dd>
            <dt>Windows passed</dt>
            <dd class="text-end">{{ r.metrics.windows_passed }} / {{ r.metrics.windows }}</dd>
            <dt>MC drawdown (95%)</dt>
            <dd class="text-end">
              {{
                r.metrics.mc_p95_drawdown_pct === undefined
                  ? 'n/a'
                  : pct(-r.metrics.mc_p95_drawdown_pct)
              }}
            </dd>
          </dl>
        </div>
      </div>
      <div class="overflow-x-auto hidden sm:block">
        <UTable :data="rows" :columns="columns" data-testid="compare-table">
          <template #bot-cell="{ row }">
            <div class="flex flex-col">
              <span>{{ row.original.bot }}</span>
              <span class="text-xs text-neutral-500"
                >{{ row.original.strategy }} · {{ row.original.exchange }}</span
              >
              <span v-if="!row.original.metrics" class="text-xs">
                <UBadge :color="stateColor(row.original.state)" variant="subtle" size="sm">{{
                  row.original.state
                }}</UBadge>
                <span class="text-neutral-500"> {{ row.original.error || row.original.note }}</span>
              </span>
            </div>
          </template>
          <template #profit-cell="{ row }">
            <span
              v-if="row.original.metrics"
              :class="[tone(row.original.metrics.profit_pct), lead('profit', row.original.bot)]"
            >
              {{ pct(row.original.metrics.profit_pct) }}<br />
              <span class="text-xs">{{
                moneyOrHidden(row.original.metrics.profit_abs, row.original.metrics.stake)
              }}</span>
            </span>
          </template>
          <template #dd-cell="{ row }">
            <span v-if="row.original.metrics" :class="lead('dd', row.original.bot)">{{
              pct(-row.original.metrics.max_drawdown_pct)
            }}</span>
          </template>
          <template #sharpe-cell="{ row }">
            <span v-if="row.original.metrics" :class="lead('sharpe', row.original.bot)">{{
              maybe(row.original.metrics.sharpe)
            }}</span>
          </template>
          <template #sortino-cell="{ row }">
            <span v-if="row.original.metrics" :class="lead('sortino', row.original.bot)">{{
              maybe(row.original.metrics.sortino)
            }}</span>
          </template>
          <template #win-cell="{ row }">
            <span v-if="row.original.metrics">{{
              row.original.metrics.win_rate_pct === undefined
                ? 'n/a'
                : `${row.original.metrics.win_rate_pct.toFixed(1)}%`
            }}</span>
          </template>
          <template #trades-cell="{ row }">{{ row.original.metrics?.trades ?? '' }}</template>
          <template #duration-cell="{ row }">
            <span v-if="row.original.metrics">{{
              duration(row.original.metrics.avg_duration_s)
            }}</span>
          </template>
          <template #pf-cell="{ row }">
            <span v-if="row.original.metrics" :class="lead('pf', row.original.bot)">{{
              maybe(row.original.metrics.profit_factor)
            }}</span>
          </template>
          <template #windows-cell="{ row }">
            <span v-if="row.original.metrics"
              >{{ row.original.metrics.windows_passed }} / {{ row.original.metrics.windows }}</span
            >
          </template>
          <template #mc-cell="{ row }">
            <span
              v-if="row.original.metrics"
              :class="lead('mc', row.original.bot)"
              :title="
                row.original.metrics.mc_ruin_pct === undefined
                  ? ''
                  : `${row.original.metrics.mc_ruin_pct}% of resamples reach ruin${row.original.metrics.mc_judged ? '' : ', too few trades to judge'}`
              "
              >{{
                row.original.metrics.mc_p95_drawdown_pct === undefined
                  ? 'n/a'
                  : pct(-row.original.metrics.mc_p95_drawdown_pct)
              }}</span
            >
          </template>
          <template #verdict-cell="{ row }">
            <UBadge
              v-if="row.original.metrics"
              :color="verdictColor(row.original.metrics.verdict)"
              variant="subtle"
              :title="row.original.metrics.reasons?.join('\n')"
              >{{ row.original.metrics.verdict }}</UBadge
            >
          </template>
        </UTable>
      </div>
      <div v-if="rows.some((r) => r.equity?.length)" class="mt-4">
        <h3 class="font-semibold text-sm mb-1">Return over the window</h3>
        <EquityOverlayChart :rows="rows" />
      </div>
    </UCard>

    <UCard v-if="list?.comparisons.length">
      <template #header><span class="font-semibold">Comparisons</span></template>
      <ul class="flex flex-col gap-1 text-sm" data-testid="compare-list">
        <li v-for="c in list.comparisons" :key="c.id" class="flex flex-wrap items-center gap-2">
          <UBadge :color="stateColor(c.state)" variant="subtle">{{ c.state }}</UBadge>
          <span>{{ c.from }} to {{ c.to }}</span>
          <span class="text-neutral-500">{{ c.bots.map((b) => b.bot).join(', ') }}</span>
          <UButton
            size="xs"
            color="neutral"
            icon="mdi:eye"
            class="ms-auto"
            :title="`Show ${c.id}`"
            @click="select(c.id)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
