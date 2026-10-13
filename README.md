# SpinMonitor AI — Textile Performance & Incentive Monitoring System

A Next.js, React, and MongoDB application for textile ring spinning mills (Unit 01: K01–K06 machines, 3 shifts).

---

## Prerequisites

1. **Node.js**: v18+ (You are running Node v24).
2. **MongoDB**: Local MongoDB Server running at `mongodb://localhost:27017` (already installed and active as a Windows Service).

---

## Quick Start

### 1. Configuration (`.env.local`)
Ensure `.env.local` exists in the project root:
```env
MONGODB_URI="mongodb://localhost:27017/spinning_monitor"
PORT=3000
```

### 2. Run the Development Server
```bash
npm run dev
```

The application will start at:
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Production Build & Start
```bash
# Build production bundle
npm run build

# Start production server
npm run start
```

---

## Features

- **Direct Access**: All Management and Operations tabs are unlocked without login restrictions.
- **Supervisor Mode**: Access the machine floor allocation directly via `http://localhost:3000/?view=supervisor`.
- **TV Mode**: Auto-rotating kiosk slideshow via the "TV Mode" button or `http://localhost:3000/?tv=true`.
- **MongoDB API Routes**: All reports, workers, rules, count conversions, and settings persist automatically to MongoDB.
