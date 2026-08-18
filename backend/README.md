# Deer E-commerce — Backend

REST API backend for a fashion/clothing e-commerce platform built with the MERN stack.

## Backend Technology

- Node.js + Express.js
- MongoDB + Mongoose
- dotenv, cors, helmet, morgan
- nodemon (development)

## Install Dependencies

```bash
npm install
```

## Configure .env

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

| Variable   | Description                         |
| ---------- | ----------------------------------- |
| PORT       | Server port (default: 5000)         |
| MONGO_URI  | MongoDB connection string           |
| NODE_ENV   | `development` or `production`       |
| CLIENT_URL | Allowed frontend origin for CORS    |

## Run Development Server

```bash
npm run dev
```

## Run Production Server

```bash
npm start
```

## Health Check

```
GET http://localhost:5000/api/health
```

```json
{
  "success": true,
  "message": "API is running"
}
```

Unknown routes return a JSON 404 response.
