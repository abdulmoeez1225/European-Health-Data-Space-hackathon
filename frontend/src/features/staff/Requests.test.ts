import { describe, expect, it } from "vitest";

import type { RequestResult } from "@/api/types";
import { burgenlandResult, rejectResult, speResult } from "@/mock/data";
import { reopened, sampleRequest, withdrawn } from "@/test/render";

import { filterQueue } from "./Requests";

// R02 and R05 carry review flags, so they need attention until staff withdraw them.
const flagged = rejectResult(sampleRequest("R02"));
const plain = burgenlandResult(sampleRequest("R01"), 32, null);
const pulled = withdrawn(speResult(sampleRequest("R05")));
const reconsidered = reopened(rejectResult(sampleRequest("R03")));
const alsoFlagged: RequestResult = { ...speResult(sampleRequest("R05")), request_id: "R06" };

const queue = [flagged, plain, pulled, alsoFlagged];
const ids = (results: RequestResult[]) => results.map((result) => result.request_id);

describe("filterQueue", () => {
  it("keeps only issued decisions with review flags for attention", () => {
    expect(ids(filterQueue(queue, "attention"))).toEqual(["R02", "R06"]);
  });

  it("keeps decisions staff have acted on for actioned: withdrawn grants and reopened refusals", () => {
    expect(ids(filterQueue(queue, "actioned"))).toEqual(["R05"]);
    expect(ids(filterQueue([...queue, reconsidered], "actioned"))).toEqual(["R05", "R03"]);
  });

  it("does not list a reopened refusal as needing attention, even though it still has flags", () => {
    expect(reconsidered.review_flags?.length).toBeGreaterThan(0);
    expect(filterQueue([reconsidered], "attention")).toEqual([]);
  });

  it("keeps everything, in order, for all", () => {
    expect(ids(filterQueue(queue, "all"))).toEqual(["R02", "R01", "R05", "R06"]);
  });

  it("does not list a withdrawn decision as needing attention, even though it still has flags", () => {
    expect(pulled.review_flags?.length).toBeGreaterThan(0);
    expect(filterQueue([pulled], "attention")).toEqual([]);
    expect(filterQueue([pulled], "actioned")).toEqual([pulled]);
  });

  it("does not list an issued decision without flags in either shortlist", () => {
    expect(filterQueue([plain], "attention")).toEqual([]);
    expect(filterQueue([plain], "actioned")).toEqual([]);
    expect(filterQueue([plain], "all")).toEqual([plain]);
  });

  it("follows needs_attention, not the flags themselves", () => {
    const quiet: RequestResult = { ...flagged, needs_attention: false };
    expect(filterQueue([quiet], "attention")).toEqual([]);
  });

  it("returns nothing for an empty queue in every filter", () => {
    expect(filterQueue([], "attention")).toEqual([]);
    expect(filterQueue([], "actioned")).toEqual([]);
    expect(filterQueue([], "all")).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const before = [...queue];
    filterQueue(queue, "attention");
    filterQueue(queue, "actioned");
    expect(queue).toEqual(before);
  });
});
