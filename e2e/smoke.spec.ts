import { expect, test } from "@playwright/test";

test("manages, runs, and replays policy instances", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /머지 시뮬레이터/ })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "작업 화면" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "환경값 의미와 산출근거 보기" })).toHaveCount(0);

  await page.getByLabel("전체 PR").fill("321");
  await page.getByRole("checkbox", { name: "근무일당 평균 PR 생성 수 기본값 사용" }).uncheck();
  await page.getByRole("spinbutton", { name: "근무일당 평균 PR 생성 수", exact: true }).fill("60");
  await page.getByLabel("2번 배치 분할 최대 배치 크기").fill("16");
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
  await expect(page.getByRole("spinbutton", { name: "근무일당 평균 PR 생성 수", exact: true })).toHaveValue("13");
  await expect(page.getByLabel("2번 배치 분할 최대 배치 크기")).toHaveValue("8");

  await page.getByLabel("추가할 정책").selectOption("bors");
  await page.getByRole("button", { name: "정책 추가" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(4);
  await expect(page.getByLabel("4번 Bors 프리셋 최대 배치 크기")).toHaveValue("8");
  await expect(page.getByLabel("4번 Bors 프리셋 배치 구성 방식")).toHaveValue("fixedDelay");
  await expect(page.getByLabel("4번 Bors 프리셋 배치 대기 시간(분)")).toHaveValue("30");
  await expect(page.getByLabel("4번 Bors 프리셋 실패 복구 방식")).toHaveValue("splitOnly");
  const borsHelp = page.getByRole("button", { name: "4번 Bors 프리셋 정책 도움말" });
  await borsHelp.hover();
  await expect(page.locator("#policy-help-4")).toContainText("분할 배치 지연");
  await page.getByLabel("4번 Bors 프리셋 분할 배치 순서").selectOption("beforeFresh");
  await expect(page.getByLabel("4번 Bors 프리셋 분할 배치 순서")).toHaveValue("beforeFresh");
  await page.getByRole("button", { name: "4번 Bors 프리셋 제거" }).click();
  await expect(page.locator(".policy-instance")).toHaveCount(3);

  await page.getByLabel("전체 PR").fill("100");
  await page.getByLabel("목표 머지").fill("80");
  await page.getByLabel("정책당 시뮬레이션 횟수").fill("10");
  await page.getByRole("button", { name: /시뮬레이션 시작/ }).click();
  await expect(page.getByRole("heading", { name: "정책 비교 결과" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("30 runs")).toBeVisible();
  await expect(page.locator(".hero-metric").first()).toContainText("PR 평균 판정 시간");
  await expect(page.locator(".metric-card dt", { hasText: "PR당 평균 CI 실행" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "배치당 PR 평균 개수" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "성공 배치의 PR 평균 개수" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "실패 배치의 PR 평균 개수" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "단독 CI 실행 비율" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "CI 실행당 최종 머지 PR 수" }).first()).toBeVisible();
  await expect(page.locator(".metric-card dt", { hasText: "상호작용 유입" })).toHaveCount(0);
  const resultHelp = page.getByRole("button", { name: "결과 지표 도움말" });
  await resultHelp.hover();
  await expect(page.locator("#result-metric-help")).toBeVisible();
  await expect(page.locator("#result-metric-help")).toContainText("격리된 PR 중 individualDefect가 false인 PR 수");

  await page.getByLabel("전체 PR").fill("200");
  await page.getByRole("button", { name: /실행 재생/ }).first().click();
  await expect(page.getByRole("dialog", { name: "실행 재생" })).toBeVisible();
  await expect(page.getByLabel("100개 PR 상태 시각화")).toBeVisible();
});
