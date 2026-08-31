import { expect, test } from "@playwright/test";

test("runs a small three-policy comparison", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /더 빠른 머지/ })).toBeVisible();
  await page.getByLabel("전체 PR").fill("100");
  await page.getByLabel("목표 머지").fill("80");
  await page.getByLabel("정책당 시뮬레이션 횟수").fill("10");
  await page.getByRole("button", { name: /3개 정책 비교 실행/ }).click();
  await expect(page.getByRole("heading", { name: "정책 비교 결과" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("30 runs")).toBeVisible();
});
