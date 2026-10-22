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

## The site
One page with a switch at the top left: **Backpack** (the phone app) and **Helius** (the RPC playground redesign).
On a desktop the Backpack app sits in an iPhone frame. On a phone it fills the screen.

## Run it
    npm install
    cp .env.example .env.local     # add HELIUS_API_KEY (only the Helius playground needs it)
    npm run dev:web                # http://localhost:5173
    npm run build                  # production build in dist/

Standalone pages: `/backpack.html` (add `?bare` for a frameless 400x890 render, `?clean=1` for demo mode) and `/helius.html`.

## Deploy on Vercel
Import the repo. Vercel detects Vite: build command `npm run build`, output directory `dist`.
Add one environment variable, `HELIUS_API_KEY`. It is read only by the serverless function in `api/rpc.js`, so the key never reaches the browser.
The function only allows five read-only methods on mainnet and devnet, and limits each IP to 40 calls a minute.

## Layout
- `shell/` the page with the switch and the iPhone frame
- `helius/src/` the Helius playground redesign, `api/rpc.js` its server proxy
- `src/screens/` Home, Trade, Stocks, Portfolio
- `src/components/` OrderSheet, AutoClose, CandleChart, SplitView, OrderBook and more
- `src/store.ts` mock account and exchange, `src/useFeed.ts` live ticking
- `src/tokens.css`, `src/trade.css`, `src/app.css` styles

## Notes
- Backpack is a trademark of its owners. This is an independent concept for a design bounty and is not affiliated with them.
- Token images in `public/tokens/` were cropped from the app and are used only to make the prototype recognisable.
