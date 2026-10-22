# Backpack redesign: Futures trade screen

A redesign of the Futures trade screen in the Backpack exchange mobile app, built for the Superteam Earn bounty
"Redesign your favourite app on Solana". It is a working React prototype with a mock exchange, not a copy of Backpack's code.
All data is fake.

## What changed
- **Chart section:** the chart leads the screen, and the order form opens as a sheet.
- **Leverage section:** it now shows what it does: margin and liquidation price update as you move it.
- **Take profit and stop loss:** set by dragging two lines on the chart (Auto Close).
- **Stop loss and take profit interface:** one screen with live profit and loss.
- **Book and Trades section:** same-height tabs plus a split view.
- **Long and Short:** pinned within thumb reach.

## Run it
    npm install
    npm run dev:web     # open the printed URL; on desktop it shows a 400x890 phone frame
    npm run build       # production build in dist/

Deep links: `#home` `#stocks` `#portfolio` `#earn` `#trade/futures`. Add `?bare` for a frameless 400x890 render, `?clean=1` for demo mode.

## Deploy on Vercel
Import the repo. Vercel detects Vite: build command `npm run build`, output directory `dist`. No environment variables.

## Layout
- `src/screens/` Home, Trade, Stocks, Portfolio
- `src/components/` OrderSheet, AutoClose, CandleChart, SplitView, OrderBook and more
- `src/store.ts` mock account and exchange, `src/useFeed.ts` live ticking
- `src/tokens.css`, `src/trade.css`, `src/app.css` styles

## Notes
- Backpack is a trademark of its owners. This is an independent concept for a design bounty and is not affiliated with them.
- Token images in `public/tokens/` were cropped from the app and are used only to make the prototype recognisable.
