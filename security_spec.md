# Security & Architecture Specification for SpinMonitor AI

## Architecture
- **Framework**: Next.js 16 (App Router) + React 19
- **Database**: MongoDB (Local instance at `mongodb://localhost:27017/spinning_monitor` or Cloud Atlas)
- **API Layer**: Next.js Route Handlers (`/api/...`)

## Data Collections
1. `reports`: Daily machine production statements indexed by `date`.
2. `workers`: Employee master registry (Siders, Gaiters, AI Linkconer, Fitters) indexed by unique `tNo`.
3. `incentive_rules`: Tiered count-wise GPS incentive slabs.
4. `count_conversions`: Fineness yarn conversion factors (40s standard).
5. `settings`: Operational parameters, WhatsApp recipient numbers, TV rotation timings.
6. `machine_em`: End-Mending breakage records.
7. `frozen_months`: Immutable monthly audit records locked against edits.

## Access Policy
- **Direct Access**: Seamless operation on the factory floor for monitoring, TV mode, and daily statements.
- **Supervisor Access**: Restricted allocation view accessible via `?view=supervisor`.
