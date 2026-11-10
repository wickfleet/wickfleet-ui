import { createRouter, createWebHistory } from 'vue-router';
import { handleHotUpdate, routes } from 'vue-router/auto-routes';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

let hubTimer: ReturnType<typeof setInterval> | undefined;

router.beforeEach(async (to) => {
  // Init bots here...
  initBots();
  // Wickfleet: bots come from the hub; a new or removed bot shows up within a minute.
  await syncHubBots();
  hubTimer ??= setInterval(() => void syncHubBots(), 60_000);
  const botStore = useBotStore();
  if (!to.meta?.allowAnonymous && !botStore.hasBots) {
    // Forward to login if login is required
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  } else {
    return true;
  }
});

if (import.meta.hot) {
  handleHotUpdate(router);
}

export default router;
