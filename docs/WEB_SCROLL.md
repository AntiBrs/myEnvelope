# Web scrolling regression checks

## Cause and fix

Expo's web shell disables document-body scrolling. React Navigation's stack can instead let a full-screen card grow to the entire page content height. Together, these behaviors left the Home ScrollView as tall as its content: there was no internal overflow to scroll, while the lower content extended outside the viewport.

`App.js` sets web-only `screenOptions.cardStyle: { flex: 1 }`, following the [React Navigation cardStyle documentation](https://reactnavigation.org/docs/stack-navigator/#cardstyle). The card stays within the viewport, so existing screen ScrollViews and FlatLists handle overflow. Native stack options are unchanged. Login uses a ScrollView with `flexGrow: 1` content so its centered form remains accessible in short windows.

Do not work around this by enabling body scrolling globally or setting a fixed pixel height. Either would undermine the screen-owned scrolling/navigation layout or break resized previews.

## Manual browser regression

Use a separate synthetic test account. No real transaction or cloud-provider calls are needed.

1. Rebuild the web container and reload a test tab. Test both a desktop viewport and a short, narrow viewport (for example 390 × 500).
2. At login, open **Create account**. Scroll to **Cancel** and close the form without creating an account. On a very short viewport, also check that the login form itself can scroll.
3. Sign in with the test account. On Home, use the mouse wheel/trackpad to reach **Ask Stati**, then scroll back to the top. The header must stay in place.
4. Open **Planning & Budget** and scroll to the bottom. Navigate back and repeat on **Compare & Overview**. Do not save changes.
5. Check that the active scroll container has `scrollHeight > clientHeight` when content overflows and that wheel input changes `scrollTop`. The body should not become the scrolling container.
6. Resize back to desktop dimensions, verify navigation still works, and inspect the console for errors.

The web build and existing session tests are additional checks, not substitutes for real browser scrolling. Reloading clears the memory-only web session; do not reload a user's active tab just to run these checks.

## Verified on 2026-10-11

The rebuilt Docker web app was tested in the embedded browser using a synthetic account, without adding transactions or saving plans:

- Desktop, 1280 × 720: Home's scroll area was 617 px high with 1008 px of content; wheel input changed its scroll position while the body stayed at zero.
- Narrow preview, 390 × 500: Home reached its bottom at 611 px, Planning at 631 px, and Compare & Overview at 1042 px. Navigation back to Home worked.
- Short preview, 390 × 280: Login scrolled by 99 px; the registration form reached its bottom at 612 px.
- No browser console errors were reported. The temporary viewport override was reset after testing.
