# institute-of-data-labs-capstone

## Start the app

### Prerequisites

- Node.js and npm installed
- A MongoDB connection string

### Environment variables

Create a `.env` file in the project root with:

```env
MONGO_URI=your_mongodb_connection_string
PORT=3000
```

`PORT` is optional. If it is not set, the API starts on `3000`.

### Install dependencies

```bash
npm install
```

### Run the backend API

```bash
npm run server
```

The Express server will start at `http://localhost:3000` unless you set a different `PORT`.

### Run the frontend dev server

In a second terminal, start the Vite frontend:

```bash
npm run dev
```

### Helpful scripts

```bash
npm run build
npm run preview
npm run test:e2e-stubbed
npm run test:e2e-live
```

## Live Search CLI

Use the interactive CLI to run live stock searches against the external API and view ticker, company name, source branch, and latest price (`date + close`).

Make sure your `.env` includes:

```env
ROIC_API_KEY=your_roic_api_key
```

Start the CLI:

```bash
npm run search:live
```

Example queries once the prompt is open:

```text
> AAPL
> WTC
> Apple Inc
> quit
```
