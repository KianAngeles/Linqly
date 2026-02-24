# Linqly

Linqly is a real-time social planning app that combines messaging, friends, and map-based hangouts so people can coordinate plans and meet offline.

## Features

- Real-time chat with typing indicators, reactions, read receipts, and attachments
- Friend system with presence and notifications
- Map-based hangouts with location pins and meetup details
- 1:1 calls and optional group call flows
- JWT auth, profile management, and password reset support

## Tech Stack

- Client: React + Vite + Socket.IO client + Mapbox GL
- Server: Node.js + Express + Socket.IO + MongoDB (Mongoose)

## Project Structure

- `client/` Frontend application
- `server/` Backend API + realtime server

## Local Setup

### 1) Install dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### 2) Configure environment variables

Client (`client/.env`):

```env
VITE_API_URL=http://localhost:5000
VITE_MAPBOX_TOKEN=your_mapbox_token
# Optional for calling:
# VITE_TURN_URL=...
# VITE_TURN_URLS=...
# VITE_TURN_USERNAME=...
# VITE_TURN_CREDENTIAL=...
# VITE_TURN_PASSWORD=...
```

Server (`server/.env`):

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
CLIENT_ORIGIN=http://localhost:5173

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Optional cookies/cors overrides
# REFRESH_COOKIE_SECURE=false
# REFRESH_COOKIE_SAME_SITE=lax
# REFRESH_COOKIE_PATH=/

# Optional integrations
# CLOUDINARY_CLOUD_NAME=
# CLOUDINARY_API_KEY=
# CLOUDINARY_API_SECRET=
# MAILERSEND_API_KEY=
# MAIL_FROM_EMAIL=
# MAIL_FROM_NAME=
# GROUP_CALLS_ENABLED=true
```

### 3) Run the app

In one terminal:

```bash
cd server
npm run dev
```

In another terminal:

```bash
cd client
npm run dev
```

Client default: `http://localhost:5173`  
Server default: `http://localhost:5000`

