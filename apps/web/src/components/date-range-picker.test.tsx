import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DateRangePicker } from "./date-range-picker";

afterEach(() => {
  cleanup();
});

describe("DateRangePicker", () => {
  it("renders with placeholder text when no value provided", () => {
    const onChange = vi.fn();
    const { container } = render(<DateRangePicker onChange={onChange} />);

    // Should show placeholder text for both inputs
    const buttons = container.querySelectorAll("button");
    const placeholderButtons = Array.from(buttons).filter(
      (btn) => btn.textContent?.includes("Pick a date")
    );
    expect(placeholderButtons).toHaveLength(2);
    expect(Array.from(buttons).some((btn) => btn.className.includes("w-[200px]"))).toBe(
      false
    );
  });

  it("does not display an invalid calendar date as a normalized date", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateRangePicker from="2026-02-30" onChange={onChange} />
    );

    const placeholderButtons = Array.from(container.querySelectorAll("button")).filter(
      (btn) => btn.textContent?.includes("Pick a date")
    );
    expect(placeholderButtons).toHaveLength(2);
  });

  it("renders selected dates when value is provided", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateRangePicker
        from="2026-01-15"
        to="2026-01-31"
        onChange={onChange}
      />
    );

    // Should NOT show placeholder text
    const placeholderButtons = Array.from(container.querySelectorAll("button")).filter(
      (btn) => btn.textContent?.includes("Pick a date")
    );
    expect(placeholderButtons).toHaveLength(0);

    // Should show formatted dates
    expect(container.textContent).toContain("Jan 15, 2026");
    expect(container.textContent).toContain("Jan 31, 2026");
  });

  it("calls onChange with cleared values when clear button is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <DateRangePicker
        from="2026-01-15"
        to="2026-01-31"
        onChange={onChange}
      />
    );

    // Find the clear button by aria-label
    const clearButton = container.querySelector('button[aria-label="Clear date range"]');
    expect(clearButton).toBeTruthy();

    if (!clearButton) throw new Error("Clear button not found");
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
    });
  });
});
