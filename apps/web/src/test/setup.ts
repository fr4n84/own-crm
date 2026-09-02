import "@testing-library/jest-dom/vitest";

process.env.OPENAI_API_KEY ??= "test-openai-api-key";

if (!("PointerEvent" in window)) {
  class TestPointerEvent extends MouseEvent {}
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
}

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
