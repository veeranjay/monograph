import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.afterEach(async ({ page }) => {
  if (await page.locator(".route-content").count())
    await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
});

test("normal-motion notebook drill-down stays visible through repeated back and forward navigation", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  const subject =
    workspace.subjects.find((s: any) => s.name === "SAT") ||
    workspace.subjects.find((s: any) => s.name === "Browser workflows");
  const sheet = workspace.sources.find((s: any) => s.subject_id === subject.id);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (let pass = 0; pass < 3; pass++) {
    await page
      .getByRole("link", { name: "Notebooks", exact: true })
      .first()
      .click();
    await page
      .locator(".notebook-card")
      .filter({
        has: page.getByRole("heading", { name: subject.name, exact: true }),
      })
      .click();
    await expect(
      page.getByRole("heading", { name: subject.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
    await expect(page.locator(".notebook-resources .item-card")).toHaveCount(
      workspace.sources.filter((s: any) => s.subject_id === subject.id).length +
        workspace.notes.filter((n: any) => n.subject_id === subject.id).length +
        workspace.pdfs.filter((p: any) => p.subject_id === subject.id).length,
    );
    await page.locator(`a[href="#/source/${sheet.id}"]`).click();
    await expect(page.locator("h1")).toHaveText(sheet.name);
    await page.goBack();
    await expect(page.locator("h1")).toHaveText(subject.name);
    await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
    await page.goForward();
    await expect(page.locator("h1")).toHaveText(sheet.name);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page
      .getByRole("link", { name: "Notebooks", exact: true })
      .first()
      .click();
    await expect(page.locator("h1")).toHaveText("Room to explore.");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  expect(errors).toEqual([]);
});

test("rapid and delayed page changes keep navigation mounted and the final page visible", async ({
  page,
}) => {
  await page.route("**/assets/Notebooks-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Notebooks", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Library", exact: true })
    .first()
    .click();
  await expect(page.locator("h1")).toHaveText("Your library.");
  await page.evaluate(() => {
    for (const path of ["/practice", "/notebooks", "/library", "/notebooks"]) {
      (
        document.querySelector(`nav a[href="#${path}"]`) as HTMLAnchorElement
      )?.click();
    }
  });
  await expect(page.locator("h1")).toHaveText("Room to explore.");
  await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
});

test("expanded, compact rail, and focus modes persist and remain reversible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace layout" }).click();
  await page
    .getByRole("menuitem", { name: "Compact rail", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "78px");
  await expect(
    page.getByRole("link", { name: "Library", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Workspace layout" }).click();
  await page.getByRole("menuitem", { name: "Focus", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-focus/);
  await page.getByRole("button", { name: "Workspace layout" }).click();
  await page.getByRole("menuitem", { name: "Expanded", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "248px");
});

test("compact mode opens a complete mobile drawer and Escape dismisses it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace layout" }).click();
  await page
    .getByRole("menuitem", { name: "Compact rail", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(
    page.locator(".sidebar .nav-item").filter({ hasText: "Notebooks" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("home does not download the animation, math, PDF, or study-page runtimes", async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Good");
  await page.waitForLoadState("networkidle");
  expect(
    scripts.filter((url) =>
      /motion-|math-engine-|pdf-engine-|Reader-|Practice-|Editor-|SearchDialog-|CreateDialog-/.test(
        url,
      ),
    ),
  ).toEqual([]);
  expect(
    await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily),
  ).toContain("Segoe UI");
  expect(
    await page
      .locator(".home-recents h3")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(14);
  expect(
    await page
      .locator(".home-recents p")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(13);
});

test("malformed legacy blocks cannot blank the library or editor", async ({
  page,
  request,
}) => {
  const note = await (
    await request.post("/api/notes", {
      data: { title: "Legacy recovery check", content: "[null]" },
    })
  ).json();
  await page.goto("/#/library");
  await expect(
    page.locator(".item-card").filter({ hasText: "Legacy recovery check" }),
  ).toBeVisible();
  await page.locator(`a[href="#/note/${note.id}"]`).click();
  await expect(page.getByLabel("paragraph block 1")).toHaveValue("[null]");
  await page
    .getByRole("link", { name: "Notebooks", exact: true })
    .first()
    .click();
  await expect(page.locator("h1")).toHaveText("Room to explore.");
  const saved = await (await request.get(`/api/notes/${note.id}`)).json();
  expect(saved.content).toBe("[null]");
});

test("notebook tabs show the right resources without altering the notebook", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  const subject = workspace.subjects.find(
    (s: any) => s.name === "Browser workflows",
  );
  await page.goto(`/#/notebook/${subject.id}`);
  await page
    .getByRole("group", { name: "Notebook resource type" })
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(page.locator(".notebook-resources .item-card")).toHaveCount(
    workspace.notes.filter((n: any) => n.subject_id === subject.id).length,
  );
  await page
    .getByRole("group", { name: "Notebook resource type" })
    .getByRole("button", { name: /^Sheets/ })
    .click();
  await expect(page.locator(".notebook-resources .item-card")).toHaveCount(1);
  await expect(page.locator(".notebook-resources")).toContainText(
    "Browser practice sheet",
  );
});

test("neutral glass and new navigation modes pass accessibility checks", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const primary = await page
    .locator("html")
    .evaluate((e) => getComputedStyle(e).getPropertyValue("--accent").trim());
  expect(primary).toBe("#262626");
  for (const mode of ["Expanded", "Compact rail", "Focus"]) {
    await page.getByRole("button", { name: "Workspace layout" }).click();
    await page.getByRole("menuitem", { name: mode, exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
