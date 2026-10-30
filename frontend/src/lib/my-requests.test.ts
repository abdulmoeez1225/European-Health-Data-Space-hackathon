import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { rememberRequest, useMyRequestIds } from "./my-requests";

beforeEach(() => {
  window.localStorage.clear();
});

describe("my requests", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useMyRequestIds());
    expect(result.current).toEqual([]);
  });

  it("lists the most recent request first and moves a resubmitted one to the top", () => {
    const { result } = renderHook(() => useMyRequestIds());
    act(() => {
      rememberRequest("R01");
      rememberRequest("R05");
      rememberRequest("R01");
    });
    expect(result.current).toEqual(["R01", "R05"]);
  });

  it("ignores stored values that are not a list of ids", () => {
    window.localStorage.setItem("gatekeeper.myRequests", '{"not":"a list"}');
    const { result } = renderHook(() => useMyRequestIds());
    expect(result.current).toEqual([]);
  });
});
