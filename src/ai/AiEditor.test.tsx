import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneEditorPane } from "@/scene/SceneEditorPane";
import { DEFAULT_SOURCE } from "@/scenes/sceneList";
import { AI_SETTINGS_KEY, type AiSettings } from "./aiSettings";
import { AI_USAGE_KEY } from "./usage";

const URL_BASE = "https://agent.example.test/v1";
const ENDPOINT = `${URL_BASE}/chat/completions`;
const KEY = "sk-test-key-1234567890";
const SETUP: AiSettings = {
  apiUrl: URL_BASE,
  apiKey: KEY,
  model: "some-model",
  dailyRequestAllowance: null,
  dailyTokenAllowance: null,
};
const RECOLOURED = DEFAULT_SOURCE.replace("background: #fff", "background: #fde68a");

/** The pane the way App hosts it: source in state, edits lifted out via onChange. */
function Harness({ onSource }: { onSource?: (source: string) => void }) {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  return (
    <SceneEditorPane
      source={source}
      onChange={(next) => {
        setSource(next);
        onSource?.(next);
      }}
    />
  );
}

function editorView(container: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("no editor mounted");
  return view;
}

function completion(
  content: string,
  init: {
    finish?: string;
    tokens?: number;
    headers?: Record<string, string>;
    status?: number;
  } = {},
): Response {
  const ok = (init.status ?? 200) < 400;
  const body = ok
    ? {
        choices: [{ message: { content }, finish_reason: init.finish ?? "stop" }],
        usage: { total_tokens: init.tokens ?? 1_500 },
      }
    : { error: { message: content } };
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function editReply(source: string, prose = "Made the canvas yellow.") {
  return `${prose}\n\n\`\`\`html\n${source.replace(/\n$/, "")}\n\`\`\``;
}

function stubFetch(impl: (init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init: RequestInit) => impl(init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A finished setup already in storage, as if entered on an earlier visit. */
function withSetup(overrides: Partial<AiSettings> = {}) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ ...SETUP, ...overrides }));
}

function savedSettings(): AiSettings {
  return JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)!);
}

type User = ReturnType<typeof userEvent.setup>;

async function openPanel(user: User) {
  await user.click(screen.getByRole("button", { name: "AI editor" }));
}

/** Through the gear, which is there whether or not anything is set up yet. */
async function openSetup(user: User) {
  await user.click(screen.getByRole("button", { name: "Coding agent setup" }));
  return screen.getByRole("dialog", { name: "Coding agent setup" });
}

/** Replace a field's contents. Pasted, not typed: a keystroke each is slow in jsdom. */
async function fillIn(user: User, label: string, text: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  if (text) {
    await user.click(field);
    await user.paste(text);
  }
}

// Pasted rather than typed: a keystroke per character is slow in jsdom, and
// what is under test here is what happens on send, not the typing.
async function ask(user: User, text: string) {
  await user.click(screen.getByRole("textbox", { name: "Describe a change" }));
  await user.paste(text);
  await user.keyboard("{Enter}");
}

// jsdom has no layout engine. CodeMirror's cursor layer asks a Range for its
// rects whenever the editor has focus and logs when the method is missing —
// harmless, but it would bury any real failure in this file's output.
beforeAll(() => {
  Range.prototype.getClientRects = function getClientRects() {
    return [] as unknown as DOMRectList;
  };
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("setting up the coding agent", () => {
  it("asks for a setup first, and the panel has no chat box until there is one", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);

    const panel = screen.getByRole("region", { name: "AI editor" });
    expect(within(panel).getByText("Connect a coding agent")).toBeVisible();
    expect(within(panel).queryByRole("textbox", { name: "Describe a change" })).toBeNull();
    expect(within(panel).queryByRole("status", { name: "AI usage remaining" })).toBeNull();
  });

  it("opens the setup from the call-to-action as well as from the gear", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Set up coding agent" }));

    expect(screen.getByRole("dialog", { name: "Coding agent setup" })).toBeVisible();
  });

  it("is closed until asked for, so the editor keeps all of its room", () => {
    render(<Harness />);

    expect(screen.queryByRole("region", { name: "AI editor" })).toBeNull();
  });

  it("says what each field is and where to find it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    const dialog = await openSetup(user);

    for (const label of ["API URL", "API key", "Model"]) {
      expect(within(dialog).getByLabelText(label)).toBeVisible();
    }
    // Where each comes from, in the words a provider's own pages use.
    expect(within(dialog).getByText(/“base URL” or “endpoint”/)).toBeVisible();
    expect(within(dialog).getByText(/usually under “API keys”/)).toBeVisible();
    expect(within(dialog).getByText(/exactly as your provider lists it/)).toBeVisible();
    // What is sent, up front — and what "any API" means.
    expect(within(dialog).getByText(/this scene’s code/)).toBeVisible();
    expect(within(dialog).getByText(/OpenAI “chat completions” format/)).toBeVisible();
  });

  it("walks through the free option, and its button fills the form in", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    const dialog = await openSetup(user);

    const guide = within(dialog).getByText(/Set up a free one with Groq/);
    expect(guide).toBeVisible();
    expect(within(dialog).getByRole("link", { name: /console\.groq\.com\/keys/ })).toHaveAttribute(
      "href",
      "https://console.groq.com/keys",
    );

    await user.click(within(dialog).getByRole("button", { name: /Fill in Groq’s values/ }));

    expect(within(dialog).getByLabelText("API URL")).toHaveValue("https://api.groq.com/openai/v1");
    expect(within(dialog).getByLabelText("Model")).toHaveValue("llama-3.3-70b-versatile");
    expect(within(dialog).getByLabelText("Tokens per day")).toHaveValue("100000");
    // The key is the person's own to make — the button never supplies one.
    expect(within(dialog).getByLabelText("API key")).toHaveValue("");
  });

  it("tucks the free walk-through away once there is a working setup", async () => {
    withSetup();
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    const dialog = await openSetup(user);

    expect(within(dialog).getByText(/Set up a free one with Groq/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Fill in Groq’s values/ })).not.toBeVisible();
  });

  it("saves the setup, then offers the chat box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await fillIn(user, "API URL", URL_BASE);
    await fillIn(user, "API key", KEY);
    await fillIn(user, "Model", "some-model");
    await fillIn(user, "Tokens per day", "50,000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savedSettings()).toEqual({ ...SETUP, dailyTokenAllowance: 50_000 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Describe a change" })).toBeVisible();
  });

  it("refuses to save without a URL and a model, saying which", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(expect.arrayContaining(["Enter the API URL.", "Enter the model name."]));
    expect(localStorage.getItem(AI_SETTINGS_KEY)).toBeNull();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("refuses an http address that isn’t on this machine", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await fillIn(user, "API URL", "http://agent.example.test/v1");
    await fillIn(user, "Model", "some-model");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Use https/);
    expect(localStorage.getItem(AI_SETTINGS_KEY)).toBeNull();
  });

  it("takes a local model with no key at all", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await fillIn(user, "API URL", "http://localhost:11434/v1");
    await fillIn(user, "Model", "local-model");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savedSettings()).toMatchObject({
      apiUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "local-model",
    });
    expect(screen.getByRole("textbox", { name: "Describe a change" })).toBeVisible();
  });

  it("keeps the key in this browser and never puts it back on the page", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);
    await fillIn(user, "API URL", URL_BASE);
    await fillIn(user, "API key", KEY);
    await fillIn(user, "Model", "some-model");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savedSettings().apiKey).toBe(KEY);
    expect(document.body.innerHTML).not.toContain(KEY);

    // Reopening the setup shows a masked hint, not the key.
    await openSetup(user);
    const field = screen.getByLabelText("API key") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.placeholder).toContain("sk-t…7890");
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it("keeps the saved key through an edit that leaves the URL where it was", async () => {
    withSetup();
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await fillIn(user, "Model", "another-model");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savedSettings()).toMatchObject({ apiKey: KEY, model: "another-model" });
  });

  it("does not carry the saved key to a different host", async () => {
    withSetup();
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await fillIn(user, "API URL", "https://elsewhere.example.test/v1");

    // Said before saving, not discovered after.
    expect((screen.getByLabelText("API key") as HTMLInputElement).placeholder).toMatch(
      /different URL and won’t be sent here/,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savedSettings()).toMatchObject({
      apiUrl: "https://elsewhere.example.test/v1",
      apiKey: "",
    });
  });

  it("changes nothing on Cancel or Esc, and Esc does not leave the editor", async () => {
    withSetup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);
    await fillIn(user, "Model", "edited-but-unsaved");
    onWindowKey.mockClear();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(savedSettings().model).toBe("some-model");
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("forgets the key on request but keeps the rest of the setup", async () => {
    withSetup();
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await openSetup(user);

    await user.click(screen.getByRole("button", { name: "Remove saved key" }));

    expect(savedSettings()).toMatchObject({ apiUrl: URL_BASE, apiKey: "", model: "some-model" });
  });
});

describe("editing by request", () => {
  it("sends the current code with the request and applies the reply to the editor", async () => {
    withSetup();
    const fetchMock = stubFetch(async () => completion(editReply(RECOLOURED)));
    const onSource = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Harness onSource={onSource} />);
    await openPanel(user);

    await ask(user, "make the canvas yellow");

    await waitFor(() => expect(editorView(container).state.doc.toString()).toBe(RECOLOURED));
    expect(onSource).toHaveBeenLastCalledWith(RECOLOURED);

    const [url, init] = fetchMock.mock.calls[0];
    // Wherever the setup points — the editor has no address of its own.
    expect(url).toBe(ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(init.body as string);
    const last = sent.messages[sent.messages.length - 1].content as string;
    expect(last).toContain(DEFAULT_SOURCE.trim());
    expect(last).toContain("make the canvas yellow");

    expect(await screen.findByText("Made the canvas yellow.")).toBeVisible();
    expect(screen.getByText(/Applied to the code/)).toBeVisible();
  });

  it("reverts the whole edit with one undo", async () => {
    withSetup();
    stubFetch(async () => completion(editReply(RECOLOURED)));
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);
    await ask(user, "make the canvas yellow");
    await waitFor(() => expect(editorView(container).state.doc.toString()).toBe(RECOLOURED));

    const view = editorView(container);
    fireEvent.keyDown(view.contentDOM, { key: "z", code: "KeyZ", ctrlKey: true });

    expect(view.state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("answers a question without touching the code", async () => {
    withSetup();
    stubFetch(async () => completion("A box is a div with a class, positioned on the canvas."));
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);

    await ask(user, "what is a box?");

    expect(await screen.findByText(/A box is a div/)).toBeVisible();
    expect(editorView(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
    expect(screen.queryByText(/Applied to the code/)).toBeNull();
  });

  it("does not wipe the scene when the model replies with a fragment", async () => {
    withSetup();
    stubFetch(async () =>
      completion("Here you go.\n```css\n.canvas { background: #fde68a; }\n```"),
    );
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);

    await ask(user, "make the canvas yellow");

    expect(await screen.findByRole("alert")).toHaveTextContent(/complete document/);
    expect(editorView(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("does not apply a document the model ran out of room to finish", async () => {
    withSetup();
    stubFetch(async () =>
      completion("Sure.\n```html\n<!doctype html>\n<html>\n<head>", { finish: "length" }),
    );
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);

    await ask(user, "add ten boxes");

    expect(await screen.findByRole("alert")).toHaveTextContent(/cut off/);
    expect(editorView(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("holds the edit back if the code changed while the model was writing", async () => {
    withSetup();
    let respond!: (response: Response) => void;
    stubFetch(() => new Promise<Response>((resolve) => (respond = resolve)));
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);
    await ask(user, "make the canvas yellow");

    // The person keeps typing in the editor while the request is out.
    const view = editorView(container);
    const typed = "<!-- my note -->\n";
    act(() => view.dispatch({ changes: { from: 0, insert: typed } }));
    await act(async () => respond(completion(editReply(RECOLOURED))));

    expect(await screen.findByText(/Not applied/)).toBeVisible();
    expect(view.state.doc.toString()).toBe(typed + DEFAULT_SOURCE);

    await user.click(screen.getByRole("button", { name: "Apply anyway" }));

    expect(view.state.doc.toString()).toBe(RECOLOURED);
  });

  it("does not mistake auto-format’s re-indent for the person editing", async () => {
    withSetup();
    let respond!: (response: Response) => void;
    stubFetch(() => new Promise<Response>((resolve) => (respond = resolve)));
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);
    await ask(user, "make the canvas yellow");

    const view = editorView(container);
    const flush = DEFAULT_SOURCE.split("\n")
      .map((l) => l.trimStart())
      .join("\n");
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: flush } }));
    await act(async () => respond(completion(editReply(RECOLOURED))));

    await waitFor(() => expect(view.state.doc.toString()).toBe(RECOLOURED));
    expect(screen.queryByText(/Not applied/)).toBeNull();
  });

  it("lets a request be stopped while it is out", async () => {
    withSetup();
    stubFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openPanel(user);
    await ask(user, "make the canvas yellow");

    await user.click(await screen.findByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Cancelled.")).toBeVisible();
    expect(editorView(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
    expect(screen.getByRole("button", { name: "Send" })).toBeVisible();
  });

  it("remembers the conversation so a follow-up has something to refer to", async () => {
    withSetup();
    const fetchMock = stubFetch(async () => completion(editReply(RECOLOURED)));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await ask(user, "make the canvas yellow");
    await screen.findByText(/Applied to the code/);

    await ask(user, "now a bit darker");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const roles = second.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(second.messages[1].content).toBe("make the canvas yellow");
    expect(second.messages[2].content).toBe("Made the canvas yellow.");
  });

  it("keeps the conversation when the panel is closed and reopened", async () => {
    withSetup();
    stubFetch(async () => completion("Just a question answered."));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await ask(user, "hello there");
    await screen.findByText("Just a question answered.");

    await user.click(screen.getByRole("button", { name: "Close AI editor" }));
    expect(screen.queryByRole("region", { name: "AI editor" })).toBeNull();
    await openPanel(user);

    expect(screen.getByText("hello there")).toBeVisible();
    expect(screen.getByText("Just a question answered.")).toBeVisible();
  });
});

describe("when something goes wrong", () => {
  it("says so when the key is refused, and keeps the key", async () => {
    withSetup();
    stubFetch(async () => completion("Invalid API Key", { status: 401 }));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "make the canvas yellow");

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't accept the API key/);
    expect(savedSettings().apiKey).toBe(KEY);
  });

  it("shows the wait when the free limit is hit", async () => {
    withSetup();
    stubFetch(async () =>
      completion("Rate limit reached for tokens per day.", {
        status: 429,
        headers: { "retry-after": "600" },
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "make the canvas yellow");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Rate limit reached/);
    expect(screen.getByRole("status", { name: "AI usage remaining" })).toHaveTextContent(
      /try again in 10m/,
    );
  });

  it("keeps what was typed when the scene is too large to send", async () => {
    withSetup();
    const fetchMock = stubFetch(async () => completion("never"));
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const huge = DEFAULT_SOURCE.replace("</style>", `/* ${"x".repeat(20_000)} */</style>`);
    act(() => {
      const view = editorView(container);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: huge } });
    });
    await openPanel(user);

    await ask(user, "make the canvas yellow");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing was sent/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Describe a change" })).toHaveValue(
      "make the canvas yellow",
    );
  });
});

describe("usage remaining", () => {
  const HEADERS = {
    "x-ratelimit-limit-requests": "1000",
    "x-ratelimit-remaining-requests": "842",
    "x-ratelimit-reset-requests": "14m",
  };

  function strip() {
    return screen.getByRole("status", { name: "AI usage remaining" });
  }

  it("does not invent a limit for an API that gives none and was told none", async () => {
    withSetup();
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);

    expect(strip()).toHaveTextContent("0 requests in the last 24h");
    expect(strip()).toHaveTextContent("0 tokens in the last 24h");
    expect(strip()).not.toHaveTextContent(/left/);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("counts what was used, and how much that is, when no limit is known", async () => {
    withSetup();
    stubFetch(async () => completion("Just a question answered.", { tokens: 2_500 }));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "hello");

    await waitFor(() => expect(strip()).toHaveTextContent("1 request in the last 24h"));
    expect(strip()).toHaveTextContent("2.5K tokens in the last 24h");
  });

  it("shows what is left of the daily limits the person entered, as estimates", async () => {
    withSetup({ dailyRequestAllowance: 200, dailyTokenAllowance: 100_000 });
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);

    expect(strip()).toHaveTextContent("~200 of 200 requests left");
    expect(strip()).toHaveTextContent("~100K of 100K tokens left (est.)");
  });

  it("takes those limits down as replies come in", async () => {
    withSetup({ dailyRequestAllowance: 200, dailyTokenAllowance: 100_000 });
    stubFetch(async () => completion("Just a question answered.", { tokens: 2_500 }));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "hello");

    await waitFor(() => expect(strip()).toHaveTextContent("~199 of 200 requests left"));
    expect(strip()).toHaveTextContent("~97.5K of 100K tokens left (est.)");
  });

  it("prefers the API’s own count, exactly, when it sends one the browser can read", async () => {
    withSetup({ dailyRequestAllowance: 200, dailyTokenAllowance: 100_000 });
    stubFetch(async () =>
      completion("Just a question answered.", { tokens: 2_500, headers: HEADERS }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "hello");

    await waitFor(() => expect(strip()).toHaveTextContent("842 of 1,000 requests left"));
    expect(strip()).not.toHaveTextContent("~842");
    // The bar follows the tightest of what is known: 842/1000 here, not the tokens.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "84");
  });

  it("works from the API’s count alone, with no limits entered", async () => {
    withSetup();
    stubFetch(async () => completion("ok", { headers: HEADERS }));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await ask(user, "hello");

    await waitFor(() => expect(strip()).toHaveTextContent("842 of 1,000 requests left"));
    expect(strip()).toHaveTextContent("tokens in the last 24h");
  });

  it("is still there after the editor is reopened", async () => {
    withSetup();
    stubFetch(async () =>
      completion("ok", {
        tokens: 40_000,
        headers: {
          ...HEADERS,
          "x-ratelimit-remaining-requests": "500",
          "x-ratelimit-reset-requests": "1h",
        },
      }),
    );
    const user = userEvent.setup();
    const first = render(<Harness />);
    await openPanel(user);
    await ask(user, "hello");
    await waitFor(() => expect(strip()).toHaveTextContent("500 of 1,000"));
    expect(localStorage.getItem(AI_USAGE_KEY)).not.toBeNull();
    first.unmount();

    render(<Harness />);
    await openPanel(user);

    expect(strip()).toHaveTextContent("500 of 1,000 requests left");
    expect(strip()).toHaveTextContent("40K tokens in the last 24h");
  });

  it("starts from nothing when the coding agent is changed", async () => {
    withSetup();
    stubFetch(async () => completion("ok", { tokens: 40_000, headers: HEADERS }));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    await ask(user, "hello");
    await waitFor(() => expect(strip()).toHaveTextContent("842 of 1,000 requests left"));

    await openSetup(user);
    await fillIn(user, "API URL", "https://elsewhere.example.test/v1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Another API is another account: none of the first one's numbers apply.
    expect(strip()).toHaveTextContent("0 requests in the last 24h");
    expect(strip()).not.toHaveTextContent("842");
  });
});

describe("keyboard", () => {
  it("does not let Esc inside the chat box leave the editor", async () => {
    withSetup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    onWindowKey.mockClear();

    await user.type(screen.getByRole("textbox", { name: "Describe a change" }), "{Escape}");

    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    withSetup();
    const fetchMock = stubFetch(async () => completion("unused"));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await user.type(
      screen.getByRole("textbox", { name: "Describe a change" }),
      "line one{Shift>}{Enter}{/Shift}line two",
    );

    expect(screen.getByRole("textbox", { name: "Describe a change" })).toHaveValue(
      "line one\nline two",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts a suggestion in the box without spending a request on it", async () => {
    withSetup();
    const fetchMock = stubFetch(async () => completion("unused"));
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Add a red circle in the middle" }));

    expect(screen.getByRole("textbox", { name: "Describe a change" })).toHaveValue(
      "Add a red circle in the middle",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
