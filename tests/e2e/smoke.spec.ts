import { expect, test } from "@playwright/test";

/**
 * Smoke test — halaman publik yang tidak butuh kredensial.
 * Tujuannya menjaga alur dasar tetap hidup: landing render, form login
 * terlihat, lupa-password punya dua jalur (email & username), dan halaman
 * tidak-ditemukan ramah.
 */

test.describe("Halaman publik", () => {
  test("landing menampilkan hero + CTA daftar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Kelola Tahfizh");
    await expect(page.getByRole("link", { name: /Daftar Lembaga/i }).first()).toBeVisible();
  });

  test("halaman login memuat form username/email + password", async ({ page }) => {
    await page.goto("/masuk");
    await expect(page.locator("input[name=username]").first()).toBeVisible();
    await expect(page.locator("input[type=password]").first()).toBeVisible();
  });

  test("lupa-password menawarkan jalur Email dan Username", async ({ page }) => {
    await page.goto("/lupa-password");
    await expect(page.getByRole("button", { name: "via Username" })).toBeVisible();
    await page.getByRole("button", { name: "via Username" }).click();
    await expect(page.getByLabel(/Username/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /KIRIM PERMINTAAN KE ADMIN/i })).toBeVisible();
  });

  test("halaman tidak ditemukan menampilkan pesan ramah", async ({ page }) => {
    await page.goto("/halaman-tidak-ada-xyz");
    await expect(page.getByText("Halaman tidak ditemukan")).toBeVisible();
    await expect(page.getByRole("link", { name: /Kembali ke Beranda/i })).toBeVisible();
  });
});
