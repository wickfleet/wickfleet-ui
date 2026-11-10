<script setup lang="ts">
import type { ReplayRobust } from '@/composables/useWickfleet';
import { pct, tone } from '@/composables/wickfleetFormat';

const props = defineProps<{ robust: ReplayRobust; compact?: boolean }>();

const mc = computed(() => props.robust.monte_carlo);
// Bar height follows the window's size against the largest move.
const scale = computed(() =>
  Math.max(1, ...props.robust.windows.map((w) => Math.abs(w.profit_pct))),
);
const height = (v: number) => `${Math.max(6, (Math.abs(v) / scale.value) * 100)}%`;
</script>

<template>
  <div class="flex flex-col gap-2 text-sm" data-testid="robust">
    <div class="flex flex-wrap items-center gap-2">
      <span>Robustness:</span>
      <UBadge :color="robust.pass ? 'success' : 'warning'" variant="subtle">{{
        robust.pass ? 'passes' : 'not robust'
      }}</UBadge>
      <span class="text-neutral-500"
        >profitable in {{ robust.profitable }} of {{ robust.windows.length }} 30-day windows, worst
        {{ pct(robust.worst_pct) }},
        <span :class="tone(robust.vs_hold_pct)">{{ pct(robust.vs_hold_pct) }}</span> against buy and
        hold</span
      >
    </div>
    <ul v-if="!robust.pass && robust.reasons?.length" class="list-disc ms-5 text-amber-700">
      <li v-for="r in robust.reasons" :key="r">{{ r }}</li>
    </ul>
    <template v-if="!compact">
      <div
        v-if="robust.windows.length"
        class="flex items-center gap-0.5 h-16"
        aria-label="profit per 30-day window, oldest first"
      >
        <div
          v-for="w in robust.windows"
          :key="w.from"
          class="flex-1 h-full flex flex-col justify-center"
          :title="`${w.from} to ${w.to}: ${pct(w.profit_pct)}, ${w.trades} trades`"
        >
          <div class="h-1/2 flex items-end">
            <div
              v-if="w.profit_pct > 0"
              class="w-full bg-green-500 rounded-t-sm"
              :style="{ height: height(w.profit_pct) }"
            />
          </div>
          <div class="h-1/2 flex items-start">
            <div
              v-if="w.profit_pct < 0"
              class="w-full bg-red-500 rounded-b-sm"
              :style="{ height: height(w.profit_pct) }"
            />
            <div
              v-else-if="w.trades === 0"
              class="w-full border-t border-dashed border-neutral-400"
            />
          </div>
        </div>
      </div>
      <p v-if="mc" class="text-neutral-500">
        Monte Carlo, {{ mc.runs.toLocaleString() }} resamples of the trades: median
        {{ pct(mc.median_return_pct) }}, worst 5% {{ pct(mc.p5_return_pct) }}; drawdown median
        {{ mc.median_drawdown_pct.toFixed(1) }}%, worst 5% {{ mc.p95_drawdown_pct.toFixed(1) }}%;
        {{ mc.ruin_pct.toFixed(1) }}% reach a 50% drawdown.
        <template v-if="!mc.judged">Too few trades to judge.</template>
      </p>
    </template>
  </div>
</template>
