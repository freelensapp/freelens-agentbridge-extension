export function createSaveLifecycle() {
  let generation = 0;
  let badgeTimer: ReturnType<typeof setTimeout> | undefined;

  function clearBadgeTimer() {
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = undefined;
  }

  return {
    begin() {
      const request = ++generation;

      clearBadgeTimer();
      return () => generation === request;
    },
    invalidate() {
      generation++;
      clearBadgeTimer();
    },
    setBadgeTimer(callback: () => void) {
      clearBadgeTimer();
      badgeTimer = setTimeout(() => {
        badgeTimer = undefined;
        callback();
      }, 1000);
    },
  };
}
