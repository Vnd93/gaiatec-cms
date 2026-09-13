import { describe, expect, it, vi } from "vitest";

import {
  createServiceWorkerControllerChangeHandler,
  shouldReloadForServiceWorkerTakeover,
} from "../../src/app/components/ServiceWorkerRegister";

describe("service worker registration", () => {
  it("does not reload a first-time visitor when the worker claims the page", () => {
    expect(shouldReloadForServiceWorkerTakeover(false, false)).toBe(false);
  });

  it("reloads an already-controlled page once when an update takes over", () => {
    expect(shouldReloadForServiceWorkerTakeover(true, false)).toBe(true);
    expect(shouldReloadForServiceWorkerTakeover(true, true)).toBe(false);
  });

  it("tracks a first claim and reloads exactly once on the later takeover", () => {
    let controlled = false;
    const reload = vi.fn();
    const onControllerChange = createServiceWorkerControllerChangeHandler(false, () => controlled, reload);

    controlled = true;
    onControllerChange();
    expect(reload).not.toHaveBeenCalled();

    onControllerChange();
    onControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads an initially controlled page once", () => {
    const reload = vi.fn();
    const onControllerChange = createServiceWorkerControllerChangeHandler(true, () => true, reload);

    onControllerChange();
    onControllerChange();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
