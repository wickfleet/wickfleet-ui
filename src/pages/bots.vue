<script setup lang="ts">
// Wickfleet bot manager: every save or delete is a commit to the registry;
// the hub starts or removes the container about a minute later.
import type { TableColumn } from '@nuxt/ui';
import type { BotInput, HubBot, HubBots, ReplayJob } from '@/composables/useWickfleet';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi, syncHubBots } = useWickfleet();
// Composables only work during setup, never after an await.
const route = useRoute();
const hub = ref<HubBots>();
const strategies = ref<string[]>([]);
const error = ref('');
const waiting = ref('');
const busy = ref(false);
const confirmDelete = ref('');

interface Form {
  name: string;
  owner: string;
  strategy_file: string;
  strategy: string;
  exchange: string;
  pairs: string;
  stake_currency: string;
  wallet: number;
  max_open_trades: number;
  feePct: number | undefined;
  image: string;
  mem_limit: string;
}
const emptyForm = (): Form => ({
  name: '',
  owner: '',
  strategy_file: '',
  strategy: '',
  exchange: 'kraken',
  pairs: 'BTC/USDT, ETH/USDT',
  stake_currency: 'USDT',
  wallet: 1000,
  max_open_trades: 3,
  feePct: 0.8,
  image: 'freqtrade',
  mem_limit: '768m',
});
const form = ref<Form>(emptyForm());
const editing = ref<'new' | string | null>(null);

const canWrite = computed(() => hub.value?.role === 'operator' || hub.value?.role === 'admin');
const isAdmin = computed(() => hub.value?.role === 'admin');
const nameOk = computed(() => /^[a-z][a-z0-9-]{0,30}$/.test(form.value.name));

// A new bot saves only after a replay of exactly these settings (the hub checks too).
const replayOn = ref(false);
const replaySince = ref('');
const draftReplay = ref<{ key: string; job?: ReplayJob }>();
let draftTimer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    const [b, s, r] = await Promise.all([
      hubApi.bots(),
      hubApi.strategies(),
      hubApi.replays().catch(() => undefined),
    ]);
    hub.value = b;
    strategies.value = s.strategies;
    replayOn.value = !!r?.enabled;
    replaySince.value = r?.since ?? '';
    // "New bot with it" from the Strategies page. A fresh save reaches the
    // hub's registry checkout on the next git-sync, so wait for it.
    const want = String(route.query.strategy ?? '');
    if (want && canWrite.value && editing.value === null) {
      if (strategies.value.includes(want)) {
        waiting.value = '';
        startNew();
        form.value.strategy_file = want;
      } else {
        waitFor(want);
      }
    }
    error.value = '';
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

let waitTimer: ReturnType<typeof setTimeout> | undefined;
let waitTries = 0;
function waitFor(want: string) {
  if (waitTries >= 12) {
    waiting.value = `${want} is not in the registry yet. Reload in a minute.`;
    return;
  }
  waitTries++;
  waiting.value = `Waiting for ${want} to reach the registry (about a minute after Save).`;
  clearTimeout(waitTimer);
  waitTimer = setTimeout(() => void load(), 10_000);
}

function startNew() {
  draftReplay.value = undefined;
  form.value = emptyForm();
  form.value.strategy_file = strategies.value[0] ?? '';
  form.value.strategy = form.value.strategy_file.replace(/\.py$/, '');
  editing.value = 'new';
}

function startEdit(b: HubBot) {
  form.value = {
    name: b.name,
    owner: b.owner,
    strategy_file: b.strategy_file ?? '',
    strategy: b.strategy,
    exchange: b.exchange,
    pairs: b.pairs.join(', '),
    stake_currency: b.stake_currency,
    wallet: b.wallet,
    max_open_trades: b.max_open_trades,
    feePct: b.fee !== undefined ? +(b.fee * 100).toFixed(4) : undefined,
    image: b.image ?? 'freqtrade',
    mem_limit: b.mem_limit ?? '',
  };
  editing.value = b.name;
}

watch(
  () => form.value.strategy_file,
  (f, old) => {
    // Class follows the file unless someone typed a different class.
    if (!form.value.strategy || form.value.strategy === old?.replace(/\.py$/, '')) {
      form.value.strategy = f.replace(/\.py$/, '');
    }
  },
);

function formBody(): BotInput {
  const f = form.value;
  const body: BotInput = {
    strategy: f.strategy,
    strategy_file: f.strategy_file || undefined,
    exchange: f.exchange,
    pairs: f.pairs
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    stake_currency: f.stake_currency,
    wallet: Number(f.wallet),
    max_open_trades: Number(f.max_open_trades),
    fee: f.feePct !== undefined && `${f.feePct}` !== '' ? Number(f.feePct) / 100 : undefined,
    image: f.image || undefined,
    mem_limit: f.mem_limit || undefined,
  };
  if (isAdmin.value && f.owner) body.owner = f.owner;
  return body;
}

// Owner and name do not change a backtest, so they stay out of the key.
const settingsKey = () => JSON.stringify({ ...formBody(), owner: undefined });
const replayBiased = computed(() => draftReplay.value?.job?.bias?.lookahead === 'biased');
const replayPassed = computed(
  () =>
    draftReplay.value?.job?.state === 'done' &&
    draftReplay.value.key === settingsKey() &&
    !replayBiased.value,
);
const replayRunning = computed(
  () =>
    !!draftReplay.value &&
    !draftReplay.value.job?.error &&
    draftReplay.value.job?.state !== 'done' &&
    draftReplay.value.job?.state !== 'failed',
);
const needsReplay = computed(
  () => editing.value === 'new' && replayOn.value && !replayPassed.value,
);

async function replayDraft() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  let from = d.toISOString().slice(0, 10);
  if (replaySince.value && from < replaySince.value) from = replaySince.value;
  const to = new Date().toISOString().slice(0, 10);
  const draft = formBody();
  delete draft.owner;
  const key = settingsKey();
  try {
    const res = await hubApi.startReplay({ draft, from, to });
    draftReplay.value = { key };
    clearInterval(draftTimer);
    draftTimer = setInterval(async () => {
      const r = await hubApi.replay(res.id);
      draftReplay.value = { key, job: r.job };
      if (r.job.state === 'done' || r.job.state === 'failed') clearInterval(draftTimer);
    }, 3_000);
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`Replay: ${msg}`, 'error');
  }
}
onUnmounted(() => {
  clearInterval(draftTimer);
  clearTimeout(waitTimer);
});

async function save() {
  const f = form.value;
  const body = formBody();
  busy.value = true;
  try {
    const res = (await hubApi.save(f.name, body)) as { result: string; note?: string };
    showAlert(`${f.name}: ${res.result}. ${res.note ?? ''}`, 'success');
    editing.value = null;
    await load();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`${f.name}: ${msg}`, 'error');
  } finally {
    busy.value = false;
  }
}

async function remove(name: string) {
  if (confirmDelete.value !== name) {
    confirmDelete.value = name;
    return;
  }
  confirmDelete.value = '';
  busy.value = true;
  try {
    await hubApi.remove(name);
    showAlert(`${name}: removed. The container goes within a minute; its data stays.`, 'success');
    await load();
    await syncHubBots();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`${name}: ${msg}`, 'error');
  } finally {
    busy.value = false;
  }
}

const columns: TableColumn<HubBot>[] = [
  { accessorKey: 'name', header: 'Bot' },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'strategy', header: 'Strategy' },
  { accessorKey: 'exchange', header: 'Exchange' },
  { accessorKey: 'pairs', header: 'Pairs' },
  { accessorKey: 'fee', header: 'Fee / leg' },
  { id: 'actions', header: '' },
];

onMounted(load);
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-6xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Bots</h2>
      <span v-if="hub" class="text-sm text-neutral-500">{{ hub.user }} · {{ hub.role }}</span>
      <UButton v-if="canWrite" icon="mdi:plus" label="New bot" @click="startNew" />
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <UAlert v-if="waiting" color="info" :title="waiting" />
    <p class="text-sm text-neutral-500">
      Every bot runs as a dry run. Saving or deleting commits to the registry; the change is live
      about a minute later.
    </p>

    <UCard v-if="editing">
      <template #header>
        <span class="font-semibold">{{ editing === 'new' ? 'New bot' : `Edit ${editing}` }}</span>
      </template>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          label="Name"
          :error="form.name && !nameOk ? 'a-z, 0-9 and -, starting with a letter' : undefined"
        >
          <UInput
            v-model="form.name"
            class="w-full"
            :disabled="editing !== 'new'"
            placeholder="trend-btc"
          />
        </UFormField>
        <UFormField v-if="isAdmin" label="Owner (empty = you)">
          <UInput v-model="form.owner" class="w-full" />
        </UFormField>
        <UFormField label="Strategy file">
          <USelect
            v-model="form.strategy_file"
            class="w-full"
            :items="strategies"
            data-testid="bot-strategy-file"
          />
        </UFormField>
        <UFormField label="Strategy class">
          <UInput v-model="form.strategy" class="w-full" />
        </UFormField>
        <UFormField label="Exchange">
          <USelect
            v-model="form.exchange"
            class="w-full"
            :items="['kraken', 'ndax', 'binance']"
            data-testid="bot-exchange"
          />
        </UFormField>
        <UFormField label="Pairs (comma separated)">
          <UInput v-model="form.pairs" class="w-full" />
        </UFormField>
        <UFormField label="Stake currency">
          <UInput v-model="form.stake_currency" class="w-full" />
        </UFormField>
        <UFormField label="Dry wallet">
          <UInput v-model.number="form.wallet" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Max open trades">
          <UInput v-model.number="form.max_open_trades" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Fee per leg, % (Kraken Tier 1 taker 0.8, NDAX 0.2)">
          <UInput v-model.number="form.feePct" type="number" step="0.01" class="w-full" />
        </UFormField>
        <UFormField label="Image">
          <USelect v-model="form.image" class="w-full" :items="hub?.images ?? ['freqtrade']" />
        </UFormField>
        <UFormField label="Memory limit">
          <UInput v-model="form.mem_limit" class="w-full" placeholder="768m" />
        </UFormField>
      </div>
      <template #footer>
        <p v-if="editing === 'new' && replayOn" class="text-sm mb-2" data-testid="draft-replay">
          <template v-if="!draftReplay"
            >A new bot needs a replay of these settings before it saves.</template
          >
          <template v-else-if="draftReplay.job?.state === 'failed'"
            >Replay failed: {{ draftReplay.job.error }}</template
          >
          <template v-else-if="draftReplay.job?.summary && replayPassed"
            >Last year: {{ draftReplay.job.summary.profit_pct.toFixed(2) }}% after
            {{ draftReplay.job.summary.fees.toFixed(2) }} {{ draftReplay.job.summary.stake }} fees,
            {{ draftReplay.job.summary.trades }} trades; buy and hold
            {{ draftReplay.job.summary.market_pct.toFixed(2) }}%.<template
              v-if="draftReplay.job.bias?.lookahead === 'inconclusive'"
            >
              Lookahead bias not judged: too few trades.</template
            ></template
          >
          <template v-else-if="replayBiased"
            >The replay found lookahead bias in {{ draftReplay.job?.bias?.indicators }}: the
            strategy uses future candles, so it cannot start.</template
          >
          <template v-else-if="draftReplay.job?.state === 'done'"
            >Settings changed since the replay; replay again.</template
          >
          <template v-else>Replaying... {{ draftReplay.job?.note ?? '' }}</template>
        </p>
        <div
          v-if="editing === 'new' && replayOn && replayPassed && draftReplay?.job?.robust"
          class="mb-2"
        >
          <RobustnessVerdict :robust="draftReplay.job.robust" compact />
          <p v-if="!draftReplay.job.robust.pass" class="text-sm mt-1" data-testid="robust-warning">
            It can still start as a dry run to watch it; live trading needs a pass.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="editing = null" />
          <UButton
            v-if="editing === 'new' && replayOn"
            color="neutral"
            icon="mdi:history"
            label="Replay last year"
            :loading="replayRunning"
            :disabled="!form.strategy"
            @click="replayDraft"
          />
          <UButton
            icon="mdi:content-save"
            label="Save"
            :loading="busy"
            :disabled="!nameOk || !form.strategy || needsReplay"
            @click="save"
          />
        </div>
      </template>
    </UCard>

    <UCard v-if="hub">
      <UTable :data="hub.bots" :columns="columns">
        <template #pairs-cell="{ row }">{{ row.original.pairs.join(', ') }}</template>
        <template #fee-cell="{ row }">
          {{
            row.original.fee !== undefined ? `${(row.original.fee * 100).toFixed(2)}%` : 'exchange'
          }}
        </template>
        <template #actions-cell="{ row }">
          <div v-if="row.original.editable" class="flex gap-1 justify-end">
            <UButton
              size="sm"
              color="neutral"
              icon="mdi:history"
              title="Replay"
              :to="`/replay?bot=${row.original.name}`"
            />
            <UButton
              size="sm"
              color="neutral"
              icon="mdi:pencil"
              title="Edit"
              @click="startEdit(row.original)"
            />
            <UButton
              size="sm"
              :color="confirmDelete === row.original.name ? 'error' : 'neutral'"
              icon="mdi:delete"
              :label="confirmDelete === row.original.name ? 'Really delete?' : undefined"
              :loading="busy"
              @click="remove(row.original.name)"
            />
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>
