"""Chromium regression for the public clipboard interface, backed by a local test API."""
import os
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

BASE = os.environ.get("CLIPBOARD_BASE_URL", "http://127.0.0.1:34567").rstrip("/")
EVIDENCE = Path("test-results")
EVIDENCE.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    errors = []
    owner = browser.new_context(viewport={"width": 1280, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    page = owner.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/?utm_source=chatgpt.com", wait_until="load")
    assert "utm_source" not in page.url, "Tracking query should be removed from canonical app URL"
    assert page.locator("#home-screen").is_visible()
    assert page.locator("#app-window").evaluate("(e) => Math.round(e.getBoundingClientRect().height) == Math.round(window.innerHeight)")
    assert page.locator("#win-min").count() == 0 and page.locator("#win-max").count() == 0
    assert page.locator(".taskbar").count() == 0
    assert page.locator("link[href=\"./clipboard.css\"]").count() == 1
    assert page.locator(".note-window").count() >= 2
    # The shared design contract must match keep rather than diverge in overrides.
    spacing=page.evaluate("""() => {
      const root=getComputedStyle(document.documentElement);
      const style=(s)=>getComputedStyle(document.querySelector(s));
      return {
        gutter:root.getPropertyValue('--content-gutter').trim(),
        gap:root.getPropertyValue('--content-gap').trim(),
        cardInset:root.getPropertyValue('--card-inset').trim(),
        sidebarWidth:style('#sidebar').width,
        headingLeft:style('.content-heading').paddingLeft,
        cardInsetActual:style('.home-choices .note-paper').paddingLeft,
        gridGap:style('.home-choices').columnGap
      };
    }""")
    assert spacing == {
        'gutter':'20px','gap':'12px','cardInset':'14px',
        'sidebarWidth':'224px','headingLeft':'20px',
        'cardInsetActual':'14px','gridGap':'12px'
    }, spacing
    heading_x=page.locator('.home-screen .page-title').bounding_box()['x']
    cards_x=page.locator('.home-choices').bounding_box()['x']
    assert abs(heading_x-cards_x)<=1, (heading_x,cards_x)
    assert page.locator(".toolbar, .menu-bar").count() == 0
    assert page.locator(".page-kicker, .home-intro").count() == 0
    assert page.locator(".sidebar-heading").first.inner_text() == "Navigation"
    assert page.locator('#sidebar [data-action="settings"]').is_visible()
    assert page.locator(".dialog-window").count() == 1
    assert page.locator(".sidebar .ui-icon").first.evaluate("(e) => e.textContent.trim().length > 0")
    assert page.title() == "clipboard"
    def assert_theme_signal(expected):
        values = page.evaluate("""() => ({
          meta: document.querySelector('meta[name="color-scheme"]')?.content,
          root: document.documentElement.dataset.theme,
          computed: getComputedStyle(document.documentElement).colorScheme,
          browser: document.querySelector('meta[name="theme-color"]')?.content,
          locked: !!document.querySelector('meta[name="darkreader-lock"]')
        })""")
        assert values == {
          "meta": expected, "root": expected, "computed": expected,
          "browser": "#1e1e2e" if expected == "dark" else "#eff1f5",
          "locked": False
        }, values
    assert_theme_signal("dark")
    assert page.locator("html").get_attribute("data-bs-theme") == "dark"
    assert page.locator('link[href="./bootstrap.min.css"]').count() == 1
    assert page.locator('link[href="./config.css"]').count() == 1
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == '#b4befe'
    assert page.locator('link[rel="icon"]').get_attribute("href") == "./favicon.svg"
    md3 = page.locator(".desktop").evaluate("(el) => getComputedStyle(el).getPropertyValue('--bg').trim()")
    assert md3 == "#1e1e2e", md3
    page.screenshot(path=str(EVIDENCE / "clipboard-md3-dark.png"))

    page.locator('#sidebar [data-action="settings"]').click()
    assert page.locator("#setting-dark").is_checked()
    assert page.locator("#setting-duration").input_value() == "24h"
    assert page.locator("#setting-refresh").input_value() == "5"
    page.locator("#setting-duration").select_option("7d")
    page.locator("#setting-refresh").select_option("0")
    page.locator("#dialog-actions .primary").click()
    assert page.locator("body").evaluate("(el) => el.classList.contains('dark-mode')")
    assert_theme_signal("dark")
    dark = page.locator(".desktop").evaluate("(el) => getComputedStyle(el).getPropertyValue('--face').trim()")
    assert dark == "#181825", dark
    radius = page.locator(".note-window").first.evaluate("(el) => getComputedStyle(el).borderRadius")
    assert radius == "10px", radius
    filter_value = page.locator(".sidebar .ui-icon").first.evaluate("(e) => getComputedStyle(e).filter")
    assert filter_value == "none", filter_value
    page.screenshot(path=str(EVIDENCE / "clipboard-dark.png"))
    page.reload(wait_until="load")
    assert page.locator("body").evaluate("(el) => el.classList.contains('dark-mode')")
    prefs = page.evaluate("JSON.parse(localStorage.getItem('clipboard.preferences.v1'))")
    assert prefs == {"theme": "dark", "defaultDuration": "7d", "refreshSeconds": 0}, prefs
    assert_theme_signal("dark")

    page.locator(".home-choices [data-action='new']").click()
    assert page.locator("#new-vault-duration").input_value() == "7d"
    page.locator("#new-vault-name").fill("QA Shared Vault")
    page.locator("#dialog-actions .primary").click()
    page.locator("#room-screen").wait_for(state="visible", timeout=15000)
    assert page.locator("#sidebar-room-actions").is_visible()
    assert page.locator('.preview-pane').evaluate("(e)=>getComputedStyle(e).paddingLeft") == '12px'
    assert page.locator("#room-refresh").is_visible()
    code = page.locator("#room-code").inner_text()
    assert len(code) == 7 and code[3] == "-", code
    page.locator("#add-item").click()
    page.locator("#item-title").fill("Snippet one")
    text = "  exact indentation\nline 2\n"
    page.locator("#item-content").fill(text)
    page.locator("#dialog-actions .primary").click()
    page.locator(".file-row.note-window").first.wait_for(state="visible", timeout=15000)
    assert page.locator(".file-row.note-window").count() == 1
    page.get_by_role("button", name="Copy text").wait_for(state="visible", timeout=15000)
    page.locator("#copy-selected").click()
    copied = page.evaluate("navigator.clipboard.readText()")
    assert copied == text, repr(copied)
    page.screenshot(path=str(EVIDENCE / "clipboard-owner-vault.png"))

    guest_context = browser.new_context(viewport={"width": 390, "height": 844}, permissions=["clipboard-read", "clipboard-write"])
    guest = guest_context.new_page()
    guest.on("pageerror", lambda error: errors.append(str(error)))
    guest.goto(BASE + "/?room=" + quote(code), wait_until="load")
    guest.locator("#room-screen").wait_for(state="visible", timeout=15000)
    assert guest.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--content-gutter').trim()") == '12px'
    assert guest.locator("#room-code").inner_text() == code
    guest.locator("#toggle-nav").click()
    assert guest.locator("#sidebar").is_visible()
    assert guest.locator("#copy-link").is_visible()
    assert guest.locator("#add-item").is_hidden()
    guest.locator("#mobile-scrim").click(position={"x":345,"y":20})
    guest.locator("#copy-selected").click()
    guest_copied = guest.evaluate("navigator.clipboard.readText()")
    assert guest_copied == text, repr(guest_copied)
    no_overflow = guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert no_overflow, "Mobile viewport has horizontal overflow"
    guest.screenshot(path=str(EVIDENCE / "clipboard-guest-mobile.png"))

    # Return to native light mode; extensions should see the actual change.
    page.locator('#sidebar [data-action="settings"]').click()
    page.locator("#setting-dark").uncheck()
    page.locator("#dialog-actions .primary").click()
    assert_theme_signal("light")
    page.reload(wait_until="load")
    assert_theme_signal("light")
    assert not errors, "Browser errors: " + " | ".join(errors)
    print("✓ Fullscreen Catppuccin Mocha / Latte appearance")
    print("✓ Settings persisted and 7-day vault default applied")
    print("✓ Owner added/copy-pasted exact text; guest joined/copied on mobile")
    print("✓ No JavaScript exceptions or mobile horizontal overflow")
    browser.close()
