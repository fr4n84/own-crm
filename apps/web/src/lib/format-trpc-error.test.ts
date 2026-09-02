import { describe, it, expect } from "vitest";

import { formatTrpcError } from "./format-trpc-error";

describe("formatTrpcError", () => {
  it("returns a friendly message for NOT_FOUND code", () => {
    const err = { data: { code: "NOT_FOUND" } };
    expect(formatTrpcError(err)).toMatch(/no se encontró/i);
  });

  it("returns a friendly message for UNAUTHORIZED code", () => {
    const err = { data: { code: "UNAUTHORIZED" } };
    expect(formatTrpcError(err)).toMatch(/permisos/i);
  });

  it("returns a friendly message for FORBIDDEN code", () => {
    const err = { data: { code: "FORBIDDEN" } };
    expect(formatTrpcError(err)).toMatch(/permisos/i);
  });

  it("returns a friendly message for BAD_REQUEST code", () => {
    const err = { data: { code: "BAD_REQUEST" } };
    expect(formatTrpcError(err)).toMatch(/datos inválidos/i);
  });

  it("returns a friendly message for CONFLICT code", () => {
    const err = { data: { code: "CONFLICT" } };
    expect(formatTrpcError(err)).toMatch(/ya existe/i);
  });

  it("returns a friendly message for INTERNAL_SERVER_ERROR code", () => {
    const err = { data: { code: "INTERNAL_SERVER_ERROR" } };
    expect(formatTrpcError(err)).toMatch(/servidor/i);
  });

  it("returns a friendly message for TOO_MANY_REQUESTS code", () => {
    const err = { data: { code: "TOO_MANY_REQUESTS" } };
    expect(formatTrpcError(err)).toMatch(/esperá/i);
  });

  it("falls back to err.message for unknown tRPC codes", () => {
    const err = { data: { code: "SOMETHING_NEW" }, message: "Mensaje custom" };
    expect(formatTrpcError(err)).toBe("Mensaje custom");
  });

  it("returns the Error.message for plain Error instances", () => {
    expect(formatTrpcError(new Error("boom"))).toBe("boom");
  });

  it("returns a generic message for null", () => {
    expect(formatTrpcError(null)).toBe("Error desconocido");
  });

  it("returns a generic message for undefined", () => {
    expect(formatTrpcError(undefined)).toBe("Error desconocido");
  });

  it("returns a generic message for non-Error values", () => {
    expect(formatTrpcError("just a string")).toBe("Error desconocido");
    expect(formatTrpcError(42)).toBe("Error desconocido");
  });
});
