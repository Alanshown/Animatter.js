import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { base } from "./browser-utils.mjs";
export const demos = [
  "skeleton-pet",
  "liquid-world",
  "gravity-dashboard",
  "magnetic-interface",
  "physics-portfolio",
  "living-workspace",
];
export async function scenario(page, name) {
  if (name === "skeleton-pet") {
    await page.locator('[data-am="fern"]').hover();
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-am="fern"]')
          .classList.contains("sleeping"),
    );
    await page.locator("#wake").click();
    await page.waitForFunction(
      () => document.querySelector("#progress").textContent === "4 / 4",
      undefined,
      { timeout: 15000 },
    );
    const actor = page.locator(".am-actor");
    const b = await actor.boundingBox();
    await page.mouse.move(b.x + 32, b.y + 30);
    await page.mouse.down();
    await page.mouse.move(550, 310, { steps: 10 });
    await page.mouse.up();
  } else if (name === "liquid-world") {
    await page.locator("#breathe").click();
    await page.locator("#filter").click();
    await page.locator('[data-material="elastic"]').click();
    assert.equal(await page.locator("#material-name").textContent(), "Elastic");
    await page.locator("#notes-tab").click();
    await page.waitForFunction(() => !document.querySelector("#notes").hidden);
    await page.locator("#notes-tab").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#objects-tab").getAttribute("aria-selected"),
      "true",
    );
    await page.locator("#about").click();
    assert.equal(
      await page.locator("#about-dialog").evaluate((el) => el.open),
      true,
    );
    await page.keyboard.press("Escape");
  } else if (name === "gravity-dashboard") {
    const before = await page
      .locator("#widgets>.widget")
      .first()
      .getAttribute("data-am");
    await page.locator('[data-am="revenue"] [data-down]').click();
    assert.notEqual(
      await page.locator("#widgets>.widget").first().getAttribute("data-am"),
      before,
    );
    await page.locator("#refresh").click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-am="revenue"] .metric')
        .textContent.includes("24,892"),
    );
    await page.locator('[data-period="month"]').click();
    await page.locator("#add-widget").click();
    assert.equal(await page.locator('[data-am="latency"]').count(), 1);
    await page.locator("summary").first().click();
    await page.locator("#settings").click();
    await page.locator("#gravity").fill("200");
    await page.locator("#settings-dialog [data-close]").first().click();
  } else if (name === "magnetic-interface") {
    const node = page.locator('[data-am="node-a"]');
    await node.hover();
    await page.waitForTimeout(150);
    const attract = await page.evaluate(
      () => world.physics.bodies.get("node-a").material.magnetism,
    );
    await page.locator('[data-field="repel"]').click();
    assert.ok(
      await page.evaluate(
        () => world.physics.bodies.get("node-a").material.magnetism < 0,
      ),
    );
    assert.ok(attract > 0);
    await page.locator('[data-field="orbit"]').click();
    await page.locator("#strength").fill("160");
    await page.locator('[data-am="node-a"]').click();
    await page.locator('[data-am="node-b"]').click();
    assert.equal(await page.evaluate(() => world.physics.constraints.size), 1);
    await page.locator("#clear-connections").click();
    assert.equal(await page.evaluate(() => world.physics.constraints.size), 0);
  } else if (name === "physics-portfolio") {
    await page.locator('[data-project="forma"]').click();
    assert.ok(
      (await page.locator("#project-title").textContent()).includes("Forma"),
    );
    await page.keyboard.press("Escape");
    await page.locator("#contact").click();
    await page.getByLabel("Your name").fill("Alan");
    await page.getByLabel("Your idea").fill("Make the web feel alive.");
    await page.locator('#contact-form button[type="submit"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#contact-status")
        .textContent.includes("Thanks, Alan"),
    );
    await page.keyboard.press("Escape");
    await page.locator('a[href="#about"]').click();
    assert.equal(new URL(page.url()).hash, "#about");
  } else if (name === "living-workspace") {
    await page.locator("#add-task").click();
    await page.locator("#task-name").fill("Ship something thoughtful");
    await page.locator('#task-form button[type="submit"]').click();
    assert.equal(await page.locator("[data-task]").count(), 5);
    await page.locator('[data-am="task-motion"] [data-run]').click();
    await page.waitForFunction(() =>
      document.querySelector('#done-tasks [data-am="task-motion"]'),
    );
    await page.locator("#dismiss-notification").click();
    await page.locator("#simulate-error").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#work-status")
        .textContent.includes("did not work"),
    );
    assert.ok(
      await page.locator('[data-am="task-notes"] [data-run]').isEnabled(),
    );
    await page.locator("#quiet").click();
    assert.equal(await page.evaluate(() => world.currentMode), "field");
    await page.locator("#quiet").click();
    assert.equal(await page.evaluate(() => world.currentMode), "both");
    await page.locator("#personal-note").fill("One small thing, well made.");
    assert.equal(
      await page.locator("#note-status").textContent(),
      "SAVED IN THIS PAGE",
    );
  }
}
export async function testDemos(browser, report) {
  await mkdir("docs/assets/demos", { recursive: true });
  const record = async (name, variant, context, fn) => {
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    page.on("requestfailed", (r) => errors.push(`Request failed ${r.url()}`));
    try {
      await page.goto(`${base}/demos/${name}/index.html`);
      await page.waitForFunction(() => window.demoReady);
      await page.waitForTimeout(120);
      await fn(page);
      assert.deepEqual(errors, []);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scroll <= overflow.width + 2,
        `horizontal overflow ${JSON.stringify(overflow)}`,
      );
      report.cases.push({
        browser: browser.browserType().name(),
        name: `demo-${name}-${variant}`,
        status: "passed",
      });
      console.log("PASS", name, variant);
    } catch (error) {
      report.cases.push({
        browser: browser.browserType().name(),
        name: `demo-${name}-${variant}`,
        status: "failed",
        error: String(error),
        console: errors,
      });
      console.error("FAIL DEMO", name, variant, error);
      await page.screenshot({
        path: `test-results/failure-${name}-${variant}.png`,
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  };
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  for (const name of demos)
    await record(name, "desktop", desktop, async (page) => {
      await scenario(page, name);
      await page.evaluate(() => scrollTo(0, 0));
      await page.mouse.move(10, 10);
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `docs/assets/demos/${name}.png` });
    });
  for (const name of demos)
    await record(name, "effects-off-business", desktop, async (page) => {
      await page.evaluate(() => world.setEnabled(false));
      if (name === "skeleton-pet") {
        await page.locator("#wake").click();
        await page.waitForFunction(
          () => document.querySelector("#progress").textContent === "4 / 4",
        );
      } else await scenario(page, name);
      assert.equal(await page.evaluate(() => world.stats().enabled), false);
    });
  await desktop.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: browser.browserType().name() !== "firefox",
  });
  for (const name of demos)
    await record(name, "touch", mobile, async (page) => {
      const effect = page.locator("[data-toggle-effects]");
      await effect.scrollIntoViewIfNeeded();
      await effect.tap();
      assert.equal(await page.evaluate(() => world.stats().enabled), false);
      await effect.tap();
      assert.equal(await page.evaluate(() => world.stats().enabled), true);
      await page.evaluate(() => scrollTo(0, 0));
      if (name === "gravity-dashboard") {
        await page.locator('[data-am="revenue"] [data-down]').tap();
        assert.equal(
          await page
            .locator("#widgets .widget")
            .first()
            .getAttribute("data-am"),
          "users",
        );
      }
      if (name === "skeleton-pet") {
        await page.locator('[data-am="fern"]').tap();
        await page.waitForFunction(
          () =>
            !document
              .querySelector('[data-am="fern"]')
              .classList.contains("sleeping"),
        );
      }
    });
  await mobile.close();
  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  for (const name of demos)
    await record(name, "reduced-keyboard", reduced, async (page) => {
      assert.equal(await page.evaluate(() => world.reducedMotion), true);
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(() => document.activeElement !== document.body),
      );
      const b = page.locator("button").first();
      await b.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(80);
      assert.ok(
        await page.evaluate(() =>
          [...world.physics.bodies.values()].every(
            (b) => Math.abs(b.velocity.x) + Math.abs(b.velocity.y) < 0.01,
          ),
        ),
      );
    });
  await reduced.close();
}
