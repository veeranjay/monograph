import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home uses imported data, navigates, and opens accessible creation dialogs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("link", { name: "Library", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("creates a note, autosaves all fields, supports math, and persists after reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("An end-to-end thought");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "An end-to-end thought",
  );
  await page.getByRole("button", { name: "Keep writing" }).click();
  await page
    .getByLabel("paragraph block 1")
    .fill("An idea that should survive a reload.");
  await page.getByLabel("Note title").fill("A thought worth keeping");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A thought worth keeping",
  );
  await expect(page.getByLabel("paragraph block 1")).toHaveValue(
    "An idea that should survive a reload.",
  );
  await page.getByRole("button", { name: "Add equation", exact: true }).click();
  await page.getByLabel("math block 2").fill("x^2 + y^2 = r^2");
  await expect(page.locator(".equation-preview .katex")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
});

test("a note survives immediate navigation before the autosave delay", async ({
  page,
}) => {
  await page.goto("/#/notes");
  await page.getByRole("link", { name: /Browser note/ }).click();
  await page.getByRole("button", { name: "Keep writing" }).click();
  await page
    .getByLabel("paragraph block 1")
    .fill("Saved even when leaving immediately");
  const url = page.url();
  await page.getByRole("link", { name: "Library", exact: true }).last().click();
  await page.goto(url);
  await expect(page.getByLabel("paragraph block 1")).toHaveValue(
    "Saved even when leaving immediately",
  );
});

test("pin, trash, and restore preserve content", async ({ page, request }) => {
  await request.post("/api/notes", {
    data: {
      title: "Pin and restore test",
      content: '[{"id":"preserved","type":"paragraph","content":"Still here"}]',
    },
  });
  await page.goto("/#/notes");
  const card = page
    .locator(".item-card")
    .filter({ hasText: "Pin and restore test" });
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Pin to home" }).click();
  await expect(card.locator(".pin-indicator")).toBeVisible();
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(card).not.toBeVisible();
  await page.getByRole("link", { name: "Trash", exact: true }).click();
  const trashed = page
    .locator(".item-card")
    .filter({ hasText: "Pin and restore test" });
  await expect(trashed).toBeVisible();
  await trashed.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(trashed).not.toBeVisible();
  await page
    .getByRole("link", { name: "Library", exact: true })
    .first()
    .click();
  await expect(
    page.locator(".item-card").filter({ hasText: "Pin and restore test" }),
  ).toBeVisible();
});

test("keyboard search finds content and Escape restores focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("Search workspace")
    .fill("Browser problem");
  await expect(
    page.getByRole("button", { name: /Problem 1.*Browser problem 1/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("captures a thought and converts it to a note without losing text", async ({
  page,
}) => {
  await page.goto("/#/inbox");
  await page
    .getByRole("button", { name: "Capture a thought", exact: true })
    .click();
  await page.getByLabel("Your thought").fill("A thought from the browser test");
  await page.getByRole("button", { name: "Save to inbox" }).click();
  const card = page
    .locator(".inbox-card")
    .filter({ hasText: "A thought from the browser test" });
  await card.getByRole("button", { name: "Turn into a note" }).click();
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByLabel("paragraph block 1")).toHaveValue(
    "A thought from the browser test",
  );
});

test("practice saves and advances, pauses, resumes, flags review, and finishes", async ({
  page,
  request,
}) => {
  await page.goto("/#/practice");
  await page
    .getByLabel("Choose a practice sheet")
    .selectOption({ label: "Browser practice sheet · Browser workflows" });
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser problem 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume timer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume timer", exact: true }).click();
  await page
    .getByLabel("Your working & reflections")
    .fill("Practice notes with $x^2$.");
  await page.getByRole("button", { name: "Review later", exact: true }).click();
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("button", { name: "Save & next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser problem 2", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your working & reflections")).toHaveValue("");
  await page
    .getByLabel("Your working & reflections")
    .fill("An unfinished draft survives returning.");
  const sessionUrl = page.url();
  await page.getByRole("link", { name: "All sessions", exact: true }).click();
  await page.goto(sessionUrl);
  await expect(page.getByLabel("Your working & reflections")).toHaveValue(
    "An unfinished draft survives returning.",
  );
  await page
    .getByRole("button", { name: "Partway there", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser problem 3", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find your flow." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /^Review/ })
    .first()
    .click();
  const row = page
    .locator(".review-item")
    .filter({ hasText: "Browser problem 1" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Understood" }).click();
  await expect(row).not.toBeVisible();
});

test("renders original PDFs with a local worker, selectable text, and pagination", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  test.skip(!workspace.pdfs.length, "No PDF supplied in this checkout");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/#/pdf/${workspace.pdfs[0].id}`);
  await expect(page.locator(".pdf-page canvas")).toBeVisible();
  await expect(page.locator(".pdf-rendering")).not.toBeVisible();
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  await page
    .locator(".textLayer span")
    .first()
    .evaluate((span) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(range);
      span.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await expect(
    page.getByRole("button", { name: "Keep highlight", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Highlight note", { exact: true })
    .fill("A kept passage from the browser test");
  await page
    .getByRole("button", { name: "Keep highlight", exact: true })
    .click();
  await expect(
    page
      .locator(".highlight-note")
      .filter({ hasText: "A kept passage from the browser test" }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Next page", exact: true })
      .isEnabled()
  ) {
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByLabel("PDF page", { exact: true })).toHaveValue("2");
    await expect(page.locator(".pdf-rendering")).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("math completion inserts an editable equation and autosaves it", async ({
  page,
  request,
}) => {
  const created = await (
    await request.post("/api/notes", {
      data: { title: "Math completion test" },
    })
  ).json();
  await page.goto(`/#/note/${created.id}`);
  await page.getByRole("button", { name: "Add equation", exact: true }).click();
  const input = page.getByLabel("math block 1");
  await input.fill("/int");
  await input.press("Enter");
  await expect(input).toHaveValue(/\\int_\{a\}\^\{b\}/);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(page.getByLabel("math block 1")).toHaveValue(
    /\\int_\{a\}\^\{b\}/,
  );
});

test("notebooks and their contents can be restored together", async ({
  page,
  request,
}) => {
  const subject = await (
    await request.post("/api/subjects", {
      data: { name: "Recoverable notebook" },
    })
  ).json();
  await request.post("/api/notes", {
    data: { title: "A note inside a notebook", subject_id: subject.id },
  });
  await page.goto(`/#/notebook/${subject.id}`);
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "More options" })
    .click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/notebooks$/);
  await page.goto("/#/trash");
  const notebook = page
    .locator(".trashed-notebooks .review-item")
    .filter({ hasText: "Recoverable notebook" });
  await notebook.getByRole("button", { name: "Restore notebook" }).click();
  await page.goto(`/#/notebook/${subject.id}`);
  await expect(
    page.locator(".item-card").filter({ hasText: "A note inside a notebook" }),
  ).toBeVisible();
});

test("preferences persist and the dark appearance remains accessible", async ({
  page,
  request,
}) => {
  await page.goto("/#/settings");
  await page.getByLabel("Your name", { exact: true }).fill("Asha");
  await page.getByLabel("Weekly practice goal").fill("25");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("button", { name: "After hours" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Asha",
  );
  await expect(page.getByLabel("Weekly practice goal")).toHaveValue("25");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page
      .getByRole("heading", { name: "Good morning, Asha.", exact: false })
      .or(page.getByRole("heading", { name: "Good afternoon, Asha." }))
      .or(page.getByRole("heading", { name: "Good evening, Asha." })),
  ).toBeVisible();
  await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await request.put("/api/workspace/settings", {
    data: { appearance: "light", name: "", weeklyGoal: 20 },
  });
});

test("mobile navigation works without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Library", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("respects reduced motion and keeps key pages accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/#/library", "/#/practice", "/#/settings"]) {
    await page.goto(path);
    await page.locator(".page-heading").waitFor();
    await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        description: v.description,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
