<script setup lang="ts">
// Return % of several replays over the same dates, one line per bot.
import type { EChartsOption } from 'echarts';
import ECharts from 'vue-echarts';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { CompareRow } from '@/composables/useWickfleet';
import { overlay } from '@/composables/wickfleetCompare';

use([
  LineChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);

const props = defineProps<{ rows: CompareRow[] }>();
const settingsStore = useSettingsStore();

const option = computed<EChartsOption>(() => {
  const o = overlay(props.rows);
  return {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${Number(v).toFixed(2)}%` },
    legend: { top: 0, type: 'scroll' },
    grid: { left: 48, right: 16, top: 36, bottom: 48 },
    xAxis: { type: 'category', data: o.dates, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }],
    series: o.series.map((s) => ({
      name: s.name,
      type: 'line',
      showSymbol: false,
      data: s.data,
    })),
  };
});
</script>

<template>
  <ECharts
    :option="option"
    :theme="settingsStore.chartTheme"
    autoresize
    class="equity-overlay"
    data-testid="equity-overlay"
  />
</template>

<style scoped>
.equity-overlay {
  width: 100%;
  height: 320px;
}
</style>
