<script setup lang="ts">
const botStore = useBotStore();
const { hubAvailable } = useWickfleet();
</script>

<template>
  <footer class="md:hidden">
    <!-- Only visible on xs (phone) viewport! History, Balance and Pairlist sit in the menu. -->
    <hr class="my-0" />
    <div class="flex gap-2 justify-between px-2">
      <UButton
        v-if="hubAvailable"
        icon-pos="top"
        variant="link"
        active-class="underline"
        class="flex flex-col gap-1"
        to="/fleet"
        label="Fleet"
        icon="mdi:chart-box-outline"
      />
      <UButton
        v-if="hubAvailable"
        icon-pos="top"
        variant="link"
        active-class="underline"
        class="flex flex-col gap-1"
        to="/bots"
        label="Bots"
        icon="mdi:robot-outline"
      />
      <UButton
        v-if="!botStore.canRunBacktest"
        icon-pos="top"
        variant="link"
        active-class="underline"
        class="flex flex-col gap-1"
        to="/open_trades"
        label="Trades"
        icon="mdi:folder-open"
      />
      <UButton
        v-if="hubAvailable"
        icon-pos="top"
        variant="link"
        active-class="underline"
        class="flex flex-col gap-1"
        to="/strategies"
        label="Strategies"
        icon="mdi:puzzle-outline"
      />
      <UButton
        v-if="!botStore.canRunBacktest"
        icon-pos="top"
        variant="link"
        active-class="underline"
        class="flex flex-col gap-1"
        to="/dashboard"
        label="Dashboard"
        icon="mdi:view-dashboard-outline"
      />
    </div>
  </footer>
</template>
