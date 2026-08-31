import { expect, test } from "@playwright/test";

test("runs and replays a small three-policy comparison", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /머지 시뮬레이터/ })).toBeVisible();
  await page.getByLabel("전체 PR").fill("321");
  await page.getByLabel("배치 분할 크기").fill("16");
  await page.getByRole("button", { name: "기본값으로 초기화" }).click();
  await expect(page.getByLabel("전체 PR")).toHaveValue("500");
  await expect(page.getByLabel("배치 분할 크기")).toHaveValue("8");
  await page.getByLabel("전체 PR").fill("100");
  await page.getByLabel("목표 머지").fill("80");
  await page.getByLabel("정책당 시뮬레이션 횟수").fill("10");
  await page.getByRole("button", { name: /시뮬레이션 시작/ }).click();
  await expect(page.getByRole("heading", { name: "정책 비교 결과" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("30 runs")).toBeVisible();

  await page.getByLabel("전체 PR").fill("200");
  await page.getByRole("button", { name: /실행 재생/ }).first().click();
  await expect(page.getByRole("dialog", { name: "실행 재생" })).toBeVisible();
  await expect(page.getByLabel("100개 PR 상태 시각화")).toBeVisible();
});
