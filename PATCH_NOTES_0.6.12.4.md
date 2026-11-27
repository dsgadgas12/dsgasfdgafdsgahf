# CloudeGift 0.6.12 — Update 4: profile redesign

## Profile screen
- Rebuilt the profile screen around the supplied mobile reference: centered Telegram avatar and username, two primary actions, and one large standard inventory panel.
- Removed the level label, TON progress line, referral/promo block, profile-only withdrawal/gift-deposit action row, withdrawal history, and the extra profile menu from the visible profile layout.
- Removed the left brand/control area from the profile header; the balance/top-up pill remains on the right. No Russian-flag or phone-vibration controls are rendered.
- The top-up action opens the existing top-up modal. The “Награды” action smoothly scrolls to the inventory panel.
- Empty inventory is shown as a simple centered “Инвентарь пуст” label. Owned gifts continue to use the existing inventory item click flow.

## Motion and layout
- Added soft page enter/exit transitions.
- Softened modal/backdrop entrance and exit, including the top-up modal.
- Added smoother button, inventory-item, input-focus and bottom-dock interactions.
- Restyled the profile background, avatar, blue action buttons, inventory outline and floating rounded bottom navigation to match the supplied reference.

## Unchanged
- Existing balance, top-up methods, inventory data, gift detail actions, case and game logic, and backend behavior.
- Other pages retain their existing content and navigation.

## Validation
- TypeScript/JSX syntax transpilation passed.
- CSS parsing passed.
- Backend Python syntax check passed.
- Full Vite build was not run because frontend dependencies are not installed in this working copy.
