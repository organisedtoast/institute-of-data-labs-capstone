# Beginner-Focused Architecture Diagram

This diagram shows the app as a beginner-friendly early-stage architecture view.
It keeps the main building blocks, boundaries, interfaces, and external systems visible
without dropping down to file-by-file implementation detail.

## High-Level Diagram

```mermaid
flowchart LR
    user[User]

    subgraph presentation[Presentation Layer]
        nav[Navigation + Search UI]
        home[Home Page]
        stocks[Stocks Page]
    end

    subgraph frontend[Frontend Application Layer<br/>React App (Browser)]
        shared[Shared Stock Search State]
        frontApi[Frontend API Services]
    end

    subgraph backendApi[Backend API Layer<br/>Express Server]
        lookupApi[Stock Lookup API]
        watchlistApi[Watchlist API]
        homepageApi[Homepage Category API]
    end

    subgraph backendLogic[Backend Business/Data Access Layer]
        roicService[Stock Search / ROIC Integration Service]
        watchlistService[Watchlist & Dashboard Service]
        homepageService[Homepage Category Cards Service]
        persistence[MongoDB Models / Persistence]
    end

    subgraph external[External Systems]
        mongo[(MongoDB Database)]
        roic[ROIC External API]
    end

    user -->|search, navigate| nav
    user -->|view category cards| home
    user -->|view watchlist dashboards| stocks

    nav -->|update search text, results, watchlist state| shared
    home -->|request category cards| frontApi
    stocks -->|request dashboards, metrics view, refresh, remove| frontApi
    shared -->|search stocks, load watchlist summary, import/open/remove stock| frontApi

    frontApi -->|HTTP + JSON over /api/*| lookupApi
    frontApi -->|HTTP + JSON over /api/*| watchlistApi
    frontApi -->|HTTP + JSON over /api/*| homepageApi

    lookupApi -->|/api/stocks/search<br/>/api/stock-prices/:ticker| roicService
    watchlistApi -->|/api/watchlist/summary<br/>/api/watchlist/dashboards<br/>/api/watchlist/import<br/>/api/watchlist/:ticker| watchlistService
    homepageApi -->|/api/homepage/investment-category-cards/query| homepageService

    roicService -->|external API requests| roic
    watchlistService -->|service calls| persistence
    homepageService -->|service calls| persistence
    persistence -->|Mongo queries| mongo
```

## Legend

- Boxes = components or modules
- Arrows = communication or dependency
- Outer grouped boxes = architectural boundaries or layers

## Beginner Notes

- The frontend does not talk to MongoDB or ROIC directly. It always goes through the Express API.
- The backend is split into three concerns: stock lookup, watchlist management, and homepage category cards.

## How To Read It

- Start on the left with the `User`.
- Move across to the browser-based React app, where the user interacts with navigation, search, `Home`, and `Stocks`.
- The frontend sends HTTP + JSON requests to the Express backend.
- The backend separates request handling into three API concerns, then delegates to business/data services.
- MongoDB stores the app's own persistent data, while ROIC provides the main third-party market and company data.
