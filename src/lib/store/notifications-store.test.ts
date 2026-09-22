// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const remove = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/http", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`status ${status}`);
      this.status = status;
    }
  },
}));
vi.mock("@/lib/api/smart", () => ({
  notificationsApi: { list: vi.fn(), markRead: vi.fn(), remove },
}));

import { ApiError } from "@/lib/api/http";
import { useNotificationsStore, type AppNotification } from "./notifications-store";

const note = (id: string, createdAt: string, read = false): AppNotification => ({
  id,
  type: "device_offline",
  title: `n${id}`,
  body: "b",
  read,
  createdAt,
});

const NEWEST = note("3", "2026-01-03T00:00:00Z");
const MIDDLE = note("2", "2026-01-02T00:00:00Z");
const OLDEST = note("1", "2026-01-01T00:00:00Z");

beforeEach(() => {
  remove.mockReset();
  useNotificationsStore.setState({ notifications: [NEWEST, MIDDLE, OLDEST], hydrated: true, loadFailed: false });
});

const ids = () => useNotificationsStore.getState().notifications.map((n) => n.id);

describe("notifications store: remove", () => {
  it("takes the notification out of the list at once and deletes it on the server", async () => {
    remove.mockResolvedValue(undefined);

    const pending = useNotificationsStore.getState().remove("2");

    expect(ids()).toEqual(["3", "1"]); // gone before the request finishes
    await pending;
    expect(remove).toHaveBeenCalledWith(2);
    expect(ids()).toEqual(["3", "1"]);
  });

  it("puts it back in its place and reports the failure when the server refuses", async () => {
    remove.mockRejectedValue(new ApiError(500));

    await expect(useNotificationsStore.getState().remove("2")).rejects.toBeInstanceOf(ApiError);

    expect(ids()).toEqual(["3", "2", "1"]);
  });

  it("treats 'not found' as success: it was already deleted on another device", async () => {
    remove.mockRejectedValue(new ApiError(404));

    await expect(useNotificationsStore.getState().remove("2")).resolves.toBeUndefined();

    expect(ids()).toEqual(["3", "1"]);
  });

  it("ignores an id that is not in the list", async () => {
    await useNotificationsStore.getState().remove("999");

    expect(remove).not.toHaveBeenCalled();
    expect(ids()).toEqual(["3", "2", "1"]);
  });
});

describe("notifications store: receive (live stream)", () => {
  const response = (id: number) => ({
    id,
    type: "device_offline",
    title: `n${id}`,
    body: "b",
    read: false,
    createdAt: "2026-01-04T00:00:00Z",
  });

  it("adds a pushed notification at the top", () => {
    useNotificationsStore.getState().receive(response(4));

    expect(ids()).toEqual(["4", "3", "2", "1"]);
  });

  it("does not duplicate one that a list refresh already brought in", () => {
    useNotificationsStore.getState().receive(response(2));

    expect(ids()).toEqual(["2", "3", "1"]);
  });
});
