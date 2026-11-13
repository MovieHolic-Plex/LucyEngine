import { expect, test, type Page } from "@playwright/test";

// 예시 장면에서 손 편집과 플레이가 되는지 본다. AI 를 부르는 시험은 E2E_AI=1 일 때만 돈다.

interface Ent { id: string; prefab: string; x: number; y: number; props?: { name?: string } }

async function openDemo(page: Page): Promise<string> {
  const res = await page.request.post("/api/projects", { data: { template: "demo" } });
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/p/${id}`);
  await page.waitForFunction(() => !!(window as any).__view && !!(window as any).__store.getState().doc);
  await page.evaluate(() => (window as any).__view.settle());
  return id;
}

const scene = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__store.getState();
    const doc = s.draft ?? s.preview ?? s.doc;
    return doc.scenes[doc.startScene] as { w: number; terrain: string[]; entities: Record<string, Ent>; ambient: string };
  });

const state = <T>(page: Page, pick: string) => page.evaluate((p) => (window as any).__store.getState()[p], pick) as Promise<T>;

/** 엔티티 그림 한가운데의 화면 좌표. */
async function centerOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  const b = await page.evaluate((i) => (window as any).__view.entityBounds(i), id);
  return { x: b.x + b.w / 2, y: b.y + b.h * 0.6 };
}

test("고르고, 고치고, 옮기고, 되돌린다", async ({ page }) => {
  const id = await openDemo(page);

  // 고르면 인스펙터가 뜨고 채팅에 칩이 붙는다
  const keeper = await centerOf(page, "keeper");
  await page.mouse.click(keeper.x, keeper.y);
  await expect(page.locator("[data-popover]")).toBeVisible();
  await expect(page.locator(".composer .chip")).toHaveText("매표소 영감");

  // 이름을 고친다
  const name = page.locator("[data-popover] .row", { hasText: "이름" }).locator("input");
  await name.fill("역장 할아버지");
  await name.press("Enter");
  await expect.poll(async () => (await scene(page)).entities.keeper.props?.name).toBe("역장 할아버지");
  await expect(page.locator(".history .tick")).toHaveCount(2);

  // 끌어서 옮긴다
  const before = (await scene(page)).entities.keeper;
  const from = await centerOf(page, "keeper");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
  await page.mouse.move(from.x + 96, from.y + 48, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await scene(page)).entities.keeper.x).toBeGreaterThan(before.x + 1);
  await expect.poll(() => state<number>(page, "cursor")).toBe(2);

  // 되돌리면 제자리로 온다
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await scene(page)).entities.keeper.x).toBe(before.x);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await scene(page)).entities.keeper.x).toBeGreaterThan(before.x + 1);

  // 다시 열어도 남아 있다
  await page.goto(`/p/${id}`);
  await page.waitForFunction(() => !!(window as any).__store.getState().doc);
  const again = (await scene(page)).entities.keeper;
  expect(again.props?.name).toBe("역장 할아버지");
  expect(again.x).toBeGreaterThan(before.x + 1);
});

test("복제하고 지우고 바닥을 칠한다", async ({ page }) => {
  await openDemo(page);
  const count = async () => Object.keys((await scene(page)).entities).length;
  const n = await count();

  const slime = await centerOf(page, "slime1");
  await page.mouse.click(slime.x, slime.y);
  await page.keyboard.press("Control+d");
  await expect.poll(count).toBe(n + 1);
  await page.keyboard.press("Delete");
  await expect.poll(count).toBe(n);

  // 붓: 풀밭 구석을 물로 칠한다
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await page.locator(".brushbar .mat", { hasText: "물" }).click();
  const at = await page.evaluate(() => (window as any).__view.tileToScreen(1.5, 1.5));
  const to = await page.evaluate(() => (window as any).__view.tileToScreen(4.5, 1.5));
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const s = await scene(page);
    return [1, 2, 3, 4].map((x) => s.terrain[1 * s.w + x]).join(",");
  }).toBe("water,water,water,water");
  // 한 번의 붓질은 히스토리 한 칸이다
  await expect.poll(() => state<number>(page, "cursor")).toBe(3);
});

test("그 자리에서 플레이하고 편집으로 돌아온다", async ({ page }) => {
  await openDemo(page);
  await page.locator(".play-btn").click();
  await expect(page.locator(".app")).toHaveClass(/playing/);
  const px = () => page.evaluate(() => (window as any).__view.world.actors.find((a: any) => a.id === "player").x as number);
  const x0 = await px();
  await page.keyboard.down("d");
  await expect.poll(px, { timeout: 15_000 }).toBeGreaterThan(x0 + 20);
  await page.keyboard.up("d");
  await expect(page.locator(".age-hud-heart")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/playing/);
  // 플레이는 문서를 바꾸지 않는다
  expect((await scene(page)).entities.player.x).toBe(16.5);
});

test("명령 팔레트로 장면 분위기를 연다", async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press("Control+k");
  await expect(page.locator(".palette")).toBeVisible();
  await page.keyboard.type("분위기");
  await page.keyboard.press("Enter");
  await expect(page.locator(".scene-panel")).toBeVisible();
  await page.locator(".scene-panel .preset", { hasText: "한낮" }).click();
  await expect.poll(async () => (await scene(page)).ambient).toBe("#ffffff");
});

test("AI 에게 부탁하고, 변경 카드에서 되돌린다", async ({ page }) => {
  test.skip(!process.env.E2E_AI, "E2E_AI=1 일 때만 실제 AI 를 부른다");
  test.setTimeout(300_000);
  await openDemo(page);
  const lamps = async () => Object.values((await scene(page)).entities).filter((e) => e.prefab === "lamp").length;
  const n = await lamps();
  await page.fill("#composer", "광장 남쪽 길가에 가로등을 하나 더 세워줘.");
  await page.keyboard.press("Enter");
  await expect(page.locator(".app")).toHaveClass(/busy/);
  await expect(page.locator(".card")).toBeVisible({ timeout: 240_000 });
  expect(await lamps()).toBe(n + 1);
  await expect(page.locator(".card-shots img")).toHaveCount(2, { timeout: 30_000 });
  await page.locator(".card .btn", { hasText: "되돌리기" }).click();
  await expect.poll(lamps).toBe(n);
});
