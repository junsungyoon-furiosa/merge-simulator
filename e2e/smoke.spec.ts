import { expect, test } from "@playwright/test";

test("manages, runs, and replays policy instances", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /머지 시뮬레이터/ })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "작업 화면" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "환경값 의미와 산출근거 보기" })).toHaveCount(0);

  await page.getByLabel("전체 PR").fill("321");
  await page.getByLabel("근무일당 평균 PR 생성 수").fill("60");
  await page.getByLabel("2번 배치 분할 배치 크기").fill("16");
  await page.getByLabel("추가할 정책").selectOption("batchSplit");
  await page.getByRole("button", { name: "정책 추가" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(4);
  await page.getByRole("button", { name: "4번 배치 분할 복제" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(5);
  const ids = await page.locator(".policy-instance").evaluateAll((items) => items.map((item) => item.getAttribute("data-policy-id")));
  expect(new Set(ids).size).toBe(ids.length);

  await page.getByRole("button", { name: "기본값으로 초기화" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(3);
  await expect(page.getByLabel("전체 PR")).toHaveValue("500");
  await expect(page.getByLabel("근무일당 평균 PR 생성 수")).toHaveValue("144");
  await expect(page.getByLabel("2번 배치 분할 배치 크기")).toHaveValue("8");

  await page.getByLabel("추가할 정책").selectOption("bors");
  await page.getByRole("button", { name: "정책 추가" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(4);
  await expect(page.getByLabel("4번 Bors 기준 최대 배치 크기")).toHaveValue("8");
  await page.getByLabel("4번 Bors 기준 분할 배치 순서").selectOption("beforeFresh");
  await expect(page.getByLabel("4번 Bors 기준 분할 배치 순서")).toHaveValue("beforeFresh");
  await page.getByRole("button", { name: "4번 Bors 기준 제거" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(3);

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
