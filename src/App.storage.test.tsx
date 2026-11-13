import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Kept apart from App.test.tsx: these tests break storage on purpose.

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App storage status", () => {
  it("explains that storage is unavailable instead of loading forever", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage is unavailable — your scenes can't be saved in this browser",
    );
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows the save state in the header once the library is restored", async () => {
    renderApp();
    await screen.findAllByTestId("scene-card");

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
