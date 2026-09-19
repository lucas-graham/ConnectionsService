# Connections Service (Express)

Small Express backend used for development or as a starting point.

Quick start

1. Install dependencies

```bash
npm install
```

2. Start in development (requires `nodemon`)

```bash
npm run dev
```

3. Start normally

```bash
npm start
```

Endpoints

- `GET /` — welcome message
- `GET /health` — health/status
- `GET /api/items` — list items
- `POST /api/items` — create item `{ "name": "...", "data": {...} }`
- `GET /api/items/:id` — get item
- `PUT /api/items/:id` — update item
- `DELETE /api/items/:id` — delete item

Example curl

```bash
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"name":"example"}'
```
