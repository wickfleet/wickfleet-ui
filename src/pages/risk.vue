<script setup lang="ts">
// Wickfleet risk: what the fleet holds right now, read live from the bots.
import type { TableColumn } from '@nuxt/ui';
import type {
  RiskBot,
  RiskCoin,
  RiskPair,
  RiskPosition,
  RiskReport,
} from '@/composables/useWickfleet';
import { coinMoney, worstTone } from '@/composables/wickfleetCompare';
import { money, pct, tone } from '@/composables/wickfleetFormat';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi } = useWickfleet();
const report = ref<RiskReport>();
const error = ref('');

async function load() {
  try {
    report.value = await hubApi.risk();
    error.value = '';
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

const kind = (dry: boolean) => (dry ? 'dry' : 'live');
const n = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
const amount = (v: number) =>
  v.toLocaleString(undefined, { maximumSignificantDigits: 6, minimumFractionDigits: 0 });

const botColumns = computed<TableColumn<RiskBot>[]>(() => [
  { accessorKey: 'name', header: 'Bot' },
  { id: 'open', header: 'Open' },
  ...(report.value?.redacted ? [] : [{ id: 'stake', header: 'At stake' }]),
  { id: 'dd', header: 'Drawdown now / worst' },
]);
const coinColumns: TableColumn<RiskCoin>[] = [
  { accessorKey: 'coin', header: 'Coin' },
  { id: 'bots', header: 'Bots' },
  { accessorKey: 'trades', header: 'Trades' },
  { id: 'amount', header: 'Amount' },
  { id: 'stake', header: 'At stake' },
];
const pairColumns: TableColumn<RiskPair>[] = [
  { accessorKey: 'pair', header: 'Pair' },
  { id: 'bots', header: 'Bots' },
  { id: 'stake', header: 'At stake' },
  { id: 'share', header: 'Share' },
];
const positionColumns: TableColumn<RiskPosition>[] = [
  { accessorKey: 'bot', header: 'Bot' },
  { accessorKey: 'pair', header: 'Pair' },
  { id: 'profit', header: 'Profit' },
  { id: 'stop', header: 'Stop' },
];

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 30_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-6xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Risk</h2>
      <span v-if="report" class="text-sm text-neutral-500">{{
        new Date(report.at).toLocaleTimeString()
      }}</span>
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <UAlert
      v-if="report?.redacted"
      color="neutral"
      data-testid="risk-redacted"
      title="Viewer access: stake and exposure are hidden."
    />

    <div
      v-if="report?.totals?.length"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      data-testid="risk-totals"
    >
      <UCard v-for="t in report.totals" :key="`${t.dry}-${t.stake}`">
        <div class="text-sm text-neutral-500">{{ kind(t.dry) }} · {{ t.stake }}</div>
        <div class="text-xl font-semibold">{{ money(t.at_stake) }} {{ t.stake }}</div>
        <div class="text-sm">
          at stake in {{ n(t.open_trades, 'open trade') }} on {{ n(t.bots, 'bot') }}, wallets
          {{ money(t.value) }}
        </div>
      </UCard>
    </div>

    <UCard v-if="report">
      <template #header><span class="font-semibold">Bots</span></template>
      <div class="overflow-x-auto">
        <UTable :data="report.bots" :columns="botColumns" data-testid="risk-bots">
          <template #name-cell="{ row }">
            {{ row.original.name }}
            <UBadge v-if="!row.original.dry" color="warning" variant="subtle" size="sm"
              >live</UBadge
            >
            <div v-if="row.original.error" class="text-xs text-red-600">
              {{ row.original.error }}
            </div>
          </template>
          <template #open-cell="{ row }">
            <span v-if="!row.original.error"
              >{{ row.original.open_trades }} / {{ row.original.max_open_trades }}</span
            >
          </template>
          <template #stake-cell="{ row }">
            <span v-if="row.original.at_stake !== undefined"
              >{{ money(row.original.at_stake) }} {{ row.original.stake }}</span
            >
          </template>
          <template #dd-cell="{ row }">
            <div v-if="!row.original.error" class="flex items-center gap-2 min-w-40">
              <span
                >{{ pct(-row.original.drawdown_pct) }} /
                {{ pct(-row.original.max_drawdown_pct) }}</span
              >
              <UBadge
                v-if="row.original.of_worst_pct !== undefined"
                :color="worstTone(row.original.of_worst_pct)"
                variant="subtle"
                size="sm"
                :title="'current drawdown as a share of the worst so far'"
                >{{ row.original.of_worst_pct.toFixed(0) }}%</UBadge
              >
            </div>
          </template>
        </UTable>
      </div>
    </UCard>

    <UCard v-if="report?.coins?.length">
      <template #header>
        <span class="font-semibold">Exposure per coin</span>
        <span class="text-sm text-neutral-500"> · across pairs and bots</span>
      </template>
      <div class="overflow-x-auto">
        <UTable :data="report.coins" :columns="coinColumns" data-testid="risk-coins">
          <template #coin-cell="{ row }">
            <span class="font-medium">{{ row.original.coin }}</span>
            <span class="text-xs text-neutral-500 ms-1">{{ kind(row.original.dry) }}</span>
          </template>
          <template #bots-cell="{ row }">{{ row.original.bots.join(', ') }}</template>
          <template #amount-cell="{ row }">{{ amount(row.original.amount) }}</template>
          <template #stake-cell="{ row }">{{ coinMoney(row.original.at_stake) }}</template>
        </UTable>
      </div>
    </UCard>

    <UCard v-if="report?.pairs?.length">
      <template #header><span class="font-semibold">Exposure per pair</span></template>
      <div class="overflow-x-auto">
        <UTable :data="report.pairs" :columns="pairColumns" data-testid="risk-pairs">
          <template #pair-cell="{ row }">
            <span class="font-medium">{{ row.original.pair }}</span>
            <span class="text-xs text-neutral-500 ms-1">{{ kind(row.original.dry) }}</span>
          </template>
          <template #bots-cell="{ row }">{{ row.original.bots.join(', ') }}</template>
          <template #stake-cell="{ row }"
            >{{ money(row.original.at_stake) }} {{ row.original.stake }}</template
          >
          <template #share-cell="{ row }">{{
            row.original.share_pct === undefined ? '' : `${row.original.share_pct.toFixed(0)}%`
          }}</template>
        </UTable>
      </div>
    </UCard>

    <UCard v-if="report">
      <template #header><span class="font-semibold">Open trades and their stops</span></template>
      <p v-if="!report.positions.length" class="text-sm text-neutral-500">No open trades.</p>
      <div v-else class="overflow-x-auto">
        <UTable :data="report.positions" :columns="positionColumns" data-testid="risk-positions">
          <template #profit-cell="{ row }">
            <span :class="tone(row.original.profit_pct)">{{ pct(row.original.profit_pct) }}</span>
          </template>
          <template #stop-cell="{ row }">{{
            row.original.stop_dist_pct === undefined ? 'n/a' : pct(row.original.stop_dist_pct)
          }}</template>
        </UTable>
      </div>
    </UCard>

    <UCard v-if="report">
      <template #header>
        <span class="font-semibold">Pair overlap</span>
        <span class="text-sm text-neutral-500"> · pairs two or more bots trade</span>
      </template>
      <p v-if="!report.overlap.length" class="text-sm text-neutral-500">No shared pairs.</p>
      <ul v-else class="flex flex-col gap-1 text-sm" data-testid="risk-overlap">
        <li v-for="o in report.overlap" :key="o.pair">
          <span class="font-medium">{{ o.pair }}</span
          >:
          <span v-for="(b, i) in o.bots" :key="b"
            ><span :class="o.open.includes(b) ? 'font-semibold' : 'text-neutral-500'">{{ b }}</span
            >{{ i < o.bots.length - 1 ? ', ' : '' }}</span
          >
          <span v-if="o.open.length" class="text-neutral-500">
            · {{ o.open.length }} holding it now</span
          >
        </li>
      </ul>
    </UCard>
  </div>
</template>
