import {
  BrowserDatabaseError,
  classifyBrowserDatabaseError,
} from "@/web/db/browser-database-errors";
import { describe, expect, it } from "vitest";

describe("browser database errors", () => {
  it.each([
    ["OPFS is unavailable", "opfs-unavailable"],
    ["The operation failed: quota exceeded", "quota"],
    ["Database disk image is malformed", "corruption"],
    ["Private browsing is not authorized", "private-browsing"],
  ])("classifies %s as %s", (message, code) => {
    expect(classifyBrowserDatabaseError(new Error(message)).code).toBe(code);
  });

  it("classifies migration failures separately", () => {
    expect(
      classifyBrowserDatabaseError(new Error("constraint failed"), "migration"),
    ).toEqual(expect.objectContaining({ code: "migration" }));
  });

  it("classifies worker failures separately", () => {
    expect(
      classifyBrowserDatabaseError(new Error("worker stopped"), "worker"),
    ).toEqual(expect.objectContaining({ code: "worker" }));
  });

  it("preserves an existing typed error", () => {
    const error = new BrowserDatabaseError("corruption", "bad database");
    expect(classifyBrowserDatabaseError(error)).toBe(error);
  });
});
