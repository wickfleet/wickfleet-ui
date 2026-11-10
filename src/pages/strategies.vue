<script setup lang="ts">
// Wickfleet strategy editor: rules as Blockly blocks, settings as a form.
// Every edit is checked by the hub, which answers with a plain-language
// readback and the generated code; saving commits spec and code together.
import * as Blockly from 'blockly';
import type { SpecSummary } from '@/composables/useWickfleet';
import {
  type Spec,
  type SpecMeta,
  metaOf,
  newSpec,
  refsFor,
  specToState,
  stateToSpec,
  type WorkspaceState,
} from '@/composables/strategySpec';
import { defineBlocks, setKnownRefs, setModel, toolbox } from '@/composables/strategyBlocks';

definePage({
  meta: {
    allowAnonymous: true,
  },
});

const { hubApi } = useWickfleet();
const router = useRouter();
const specs = ref<SpecSummary[]>([]);
const canCreate = ref(false);
const canDraft = ref(false);
const sentence = ref('');
const drafting = ref(false);
const draftNote = ref('');
const error = ref('');

const editing = ref<'new' | string | null>(null);
const editable = ref(true);
const meta = ref<SpecMeta>(metaOf(newSpec()));
const readback = ref('');
const python = ref('');
const checkError = ref('');
const showCode = ref(false);
const saving = ref(false);

// Settings shown as percentages and a short ROI list in the form.
const stoplossPct = computed({
  get: () => +(-meta.value.stoploss * 100).toFixed(4),
  set: (v: number) => (meta.value.stoploss = -Number(v) / 100),
});
const roiText = ref('');
const trailingPct = ref<number | undefined>();
const trailingOffsetPct = ref<number | undefined>();
const guardPct = ref<number | undefined>();
const modelOn = computed({
  get: () => !!meta.value.model,
  set: (on: boolean) => {
    meta.value.model = on ? { features: 'freqai_example', target: 'mean_return' } : undefined;
    if (on && !meta.value.startup_candles) meta.value.startup_candles = 40;
    setModel(on);
    scheduleCheck();
  },
});

function roiToText(roi?: Record<string, number>) {
  return Object.entries(roi ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([m, r]) => `${m}:${+(r * 100).toFixed(4)}`)
    .join(', ');
}

function textToRoi(t: string): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const part of t
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [m, pct] = part.split(':').map((x) => x.trim());
    if (m === undefined || pct === undefined) continue;
    out[m] = Number(pct) / 100;
  }
  return Object.keys(out).length ? out : undefined;
}

const canvas = ref<HTMLDivElement>();
let ws: Blockly.WorkspaceSvg | undefined;

async function load() {
  try {
    const r = await hubApi.specs();
    specs.value = r.specs;
    canCreate.value = r.can_create;
    canDraft.value = !!r.can_draft;
    error.value = '';
  } catch (e) {
    error.value = `Hub not reachable: ${e}`;
  }
}

function currentSpec(): Spec {
  const m: SpecMeta = { ...meta.value };
  delete m.author;
  m.roi = textToRoi(roiText.value);
  m.trailing = trailingPct.value
    ? {
        positive: Number(trailingPct.value) / 100,
        ...(trailingOffsetPct.value ? { offset: Number(trailingOffsetPct.value) / 100 } : {}),
        ...(trailingOffsetPct.value ? { only_offset_reached: true } : {}),
      }
    : undefined;
  m.entry_guard = guardPct.value ? { max_above_close: Number(guardPct.value) / 100 } : undefined;
  if (!m.model) delete m.startup_candles;
  const state = (
    ws ? Blockly.serialization.workspaces.save(ws) : { blocks: { blocks: [] } }
  ) as WorkspaceState;
  return JSON.parse(JSON.stringify(stateToSpec(m, state)));
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleCheck() {
  clearTimeout(timer);
  timer = setTimeout(check, 500);
}

async function check() {
  try {
    const r = await hubApi.checkSpec(currentSpec());
    readback.value = r.describe;
    python.value = r.python;
    checkError.value = '';
  } catch (e: unknown) {
    checkError.value = (e as { data?: { error?: string } }).data?.error ?? String(e);
    readback.value = '';
  }
}

async function open(spec: Spec, mode: 'new' | string, canEdit = true) {
  editing.value = mode;
  editable.value = canEdit;
  meta.value = metaOf(spec);
  roiText.value = roiToText(spec.roi);
  trailingPct.value = spec.trailing ? +(spec.trailing.positive * 100).toFixed(4) : undefined;
  trailingOffsetPct.value = spec.trailing?.offset
    ? +(spec.trailing.offset * 100).toFixed(4)
    : undefined;
  guardPct.value = spec.entry_guard
    ? +(spec.entry_guard.max_above_close * 100).toFixed(4)
    : undefined;
  await nextTick();
  if (!canvas.value) return;
  defineBlocks();
  setKnownRefs(refsFor(spec.indicators, !!spec.model), !!spec.model);
  ws?.dispose();
  ws = Blockly.inject(canvas.value, {
    toolbox: toolbox(),
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: 0.85 },
    readOnly: !canEdit,
    renderer: 'thrasos',
  });
  Blockly.serialization.workspaces.load(specToState(spec) as object, ws);
  ws.addChangeListener((e: Blockly.Events.Abstract) => {
    if (!e.isUiEvent) scheduleCheck();
  });
  void check();
}

// A model proposes a spec; it opens as a new, unsaved strategy to review.
// Drafts can outlast the proxy timeout, so the hub runs them as a job we poll.
async function draft() {
  drafting.value = true;
  draftNote.value = '';
  try {
    let job = await hubApi.draftStart(sentence.value);
    const until = Date.now() + 5 * 60_000;
    while (job.state === 'running' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 3_000));
      job = await hubApi.draftGet(job.id);
    }
    if (job.state !== 'done' || !job.result) {
      throw new Error(job.error ?? 'the draft took too long');
    }
    const r = job.result;
    draftNote.value = `Drafted by ${r.provider} in ${r.seconds.toFixed(0)} s. Check the readback.`;
    await open(r.spec, 'new');
  } catch (e: unknown) {
    const msg =
      (e as { data?: { error?: string } }).data?.error ?? (e as Error).message ?? String(e);
    showAlert(`Draft: ${msg}`, 'error');
  } finally {
    drafting.value = false;
  }
}

function startNew() {
  void open(newSpec(), 'new');
}

async function startEdit(name: string) {
  const r = await hubApi.spec(name);
  await open(r.spec, name, r.editable);
}

function close() {
  draftNote.value = '';
  ws?.dispose();
  ws = undefined;
  editing.value = null;
}

async function save() {
  const spec = currentSpec();
  saving.value = true;
  try {
    const r = await hubApi.saveSpec(spec);
    showAlert(`${spec.name}: ${r.result}. ${r.note ?? ''}`, 'success');
    editing.value = spec.name;
    await load();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`${spec.name}: ${msg}`, 'error');
  } finally {
    saving.value = false;
  }
}

async function remove(name: string) {
  try {
    await hubApi.deleteSpec(name);
    showAlert(`${name}: removed`, 'success');
    close();
    await load();
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: string } }).data?.error ?? String(e);
    showAlert(`${name}: ${msg}`, 'error');
  }
}

function newBot() {
  void router.push(`/bots?strategy=${meta.value.name}.py`);
}

watch([meta, roiText, trailingPct, trailingOffsetPct, guardPct], scheduleCheck, { deep: true });
onMounted(load);
onUnmounted(() => {
  clearTimeout(timer);
  ws?.dispose();
});
</script>

<template>
  <div class="mx-auto mt-3 p-4 max-w-7xl flex flex-col gap-4 text-start">
    <div class="flex items-center gap-2">
      <h2 class="text-2xl font-bold me-auto">Strategies</h2>
      <UButton
        v-if="canCreate && !editing"
        icon="mdi:plus"
        label="New strategy"
        @click="startNew"
      />
      <UButton color="neutral" icon="mdi:refresh" @click="load" />
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <p class="text-sm text-neutral-500">
      Build the rules from blocks; the hub checks every change and reads it back in plain words.
      Saving commits the spec and the generated strategy; a new bot on it still needs a replay.
    </p>

    <UCard v-if="!editing && canDraft">
      <template #header><span class="font-semibold">Describe it in a sentence</span></template>
      <div class="flex flex-col gap-2">
        <UTextarea
          v-model="sentence"
          :rows="2"
          class="w-full"
          placeholder="Hourly: buy when RSI 14 crosses up through 30, sell above 70, 5% stop."
          data-testid="draft-sentence"
        />
        <div class="flex justify-end">
          <UButton
            icon="mdi:auto-fix"
            label="Draft"
            :loading="drafting"
            :disabled="sentence.trim().length < 10"
            @click="draft"
          />
        </div>
      </div>
    </UCard>

    <UCard v-if="!editing">
      <ul class="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        <li v-for="s in specs" :key="s.name" class="py-2 flex items-center gap-2">
          <span class="font-semibold">{{ s.name }}</span>
          <UBadge variant="subtle" color="neutral">{{ s.timeframe }}</UBadge>
          <UBadge v-if="s.model" variant="subtle" color="info">model</UBadge>
          <span class="text-sm text-neutral-500 me-auto"
            >{{ s.description }}<template v-if="s.author"> · {{ s.author }}</template
            ><template v-if="s.used_by.length">
              · used by {{ s.used_by.join(', ') }}</template
            ></span
          >
          <UButton
            size="sm"
            color="neutral"
            :icon="s.editable ? 'mdi:pencil' : 'mdi:eye'"
            :title="`${s.editable ? 'Edit' : 'Show'} ${s.name}`"
            @click="startEdit(s.name)"
          />
        </li>
        <li v-if="!specs.length" class="py-2 text-sm text-neutral-500">
          No strategy specs yet. Hand-written strategies stay on the Bots page.
        </li>
      </ul>
    </UCard>

    <template v-if="editing">
      <UCard>
        <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <UFormField label="Name (class)">
            <UInput v-model="meta.name" :disabled="editing !== 'new'" placeholder="MyStrategy" />
          </UFormField>
          <UFormField label="Timeframe">
            <USelect
              v-model="meta.timeframe"
              :items="['5m', '15m', '30m', '1h', '4h', '1d', '1w']"
              :disabled="!editable"
            />
          </UFormField>
          <UFormField label="Stoploss %">
            <UInput v-model.number="stoplossPct" type="number" step="0.5" :disabled="!editable" />
          </UFormField>
          <UFormField label="Take profit (min:%, ...)">
            <UInput v-model="roiText" placeholder="0:50, 1440:20" :disabled="!editable" />
          </UFormField>
          <UFormField label="Trailing %">
            <UInput v-model.number="trailingPct" type="number" step="0.5" :disabled="!editable" />
          </UFormField>
          <UFormField label="Trailing after %">
            <UInput
              v-model.number="trailingOffsetPct"
              type="number"
              step="0.5"
              :disabled="!editable"
            />
          </UFormField>
          <UFormField label="Description" class="sm:col-span-3">
            <UInput v-model="meta.description" class="w-full" :disabled="!editable" />
          </UFormField>
          <UFormField label="Max entry above close %">
            <UInput v-model.number="guardPct" type="number" step="0.05" :disabled="!editable" />
          </UFormField>
          <UFormField label="FreqAI model">
            <USwitch v-model="modelOn" :disabled="!editable" data-testid="model-switch" />
          </UFormField>
          <UFormField v-if="modelOn" label="Startup candles">
            <UInput v-model.number="meta.startup_candles" type="number" :disabled="!editable" />
          </UFormField>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-5">
        <div
          ref="canvas"
          class="lg:col-span-3 h-[560px] rounded border border-neutral-300 dark:border-neutral-700"
          data-testid="blockly"
        />
        <UCard class="lg:col-span-2">
          <template #header><span class="font-semibold">What it does</span></template>
          <UAlert
            v-if="draftNote && editing === 'new'"
            color="info"
            variant="subtle"
            :title="draftNote"
            class="mb-2"
          />
          <UAlert v-if="checkError" color="error" :title="checkError" data-testid="spec-error" />
          <p v-else class="text-sm whitespace-pre-line" data-testid="readback">{{ readback }}</p>
          <UButton
            class="mt-3"
            size="sm"
            color="neutral"
            variant="ghost"
            :icon="showCode ? 'mdi:chevron-up' : 'mdi:chevron-down'"
            label="Generated code"
            @click="showCode = !showCode"
          />
          <pre v-if="showCode" class="text-xs overflow-auto max-h-80 mt-2">{{ python }}</pre>
        </UCard>
      </div>

      <div class="flex gap-2 justify-end">
        <UButton
          v-if="editing !== 'new' && editable"
          color="error"
          variant="outline"
          icon="mdi:delete"
          label="Delete"
          @click="remove(meta.name)"
        />
        <UButton color="neutral" variant="outline" label="Close" @click="close" />
        <UButton
          v-if="editing !== 'new'"
          color="neutral"
          icon="mdi:robot-outline"
          label="New bot with it"
          @click="newBot"
        />
        <UButton
          v-if="editable"
          icon="mdi:content-save"
          label="Save"
          :loading="saving"
          :disabled="!!checkError || !readback"
          @click="save"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Blockly's light toolbox keeps white labels; give them contrast. */
[data-testid='blockly'] :deep(.blocklyToolboxCategoryLabel),
[data-testid='blockly'] :deep(.blocklyTreeLabel) {
  color: #1f2937;
}
</style>
