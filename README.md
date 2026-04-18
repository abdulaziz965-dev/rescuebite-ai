
  # Premium Web App UI Design

  This is a code bundle for Premium Web App UI Design. The original project is available at https://www.figma.com/design/BvzHPXRoDFYnv0FEUjDOle/Premium-Web-App-UI-Design.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## DigiLocker Redirect Verification Flow

  Donor and volunteer verification in login now uses a redirect callback flow:
  - User clicks `Verify with DigiLocker`.
  - User is redirected to DigiLocker auth URL.
  - After DigiLocker login/consent, user is redirected back to `/login` with callback params.
  - Login page reads callback params and auto-marks corresponding role verification as verified.

  Optional frontend vars:
  - `VITE_DIGILOCKER_AUTH_URL`
  - `VITE_DIGILOCKER_CLIENT_ID`

  If `VITE_DIGILOCKER_AUTH_URL` is empty, the app uses a local mock callback URL for testing the end-to-end UX.

  ## Verification API Proxy (Production)

  The app now supports secure backend verification endpoints so provider keys are not exposed in browser code.

  Endpoints:
  - `POST /api/verify/identity`
  - `POST /api/verify/ngo`

  Optional frontend variable:
  - `VITE_VERIFICATION_PROXY_BASE_URL` (for example `http://localhost:8787`)
  - When empty, frontend uses same-origin `/api/...`.

  Server environment variables:
  - `INDIA_VERIFICATION_PROVIDER` (`mock` or your provider id)
  - `INDIA_VERIFICATION_BASE_URL`
  - `INDIA_VERIFICATION_API_KEY`

  ## No-Partner Free Verification Mode

  You can run verification without any paid API or partner onboarding by using provider value `open-public`.

  Set:
  - `INDIA_VERIFICATION_PROVIDER=open-public`
  - `VITE_INDIA_VERIFICATION_PROVIDER=open-public`

  What this mode does:
  - Identity endpoint (`/api/verify/identity`):
    - Aadhaar checksum validation (Verhoeff) for 12-digit IDs
    - PAN format validation (`AAAAA9999A`)
    - Basic profile completeness checks
  - NGO endpoint (`/api/verify/ngo`):
    - document upload presence
    - public DNS check via `https://dns.google/resolve`
    - NGO website reachability check (HTTP)

  Note:
  - This mode is useful for hackathons and demos.
  - For regulatory-grade KYC, plug in a licensed provider later.

  Notes:
  - You can host these endpoints on any backend platform.
  - Frontend verification calls attempt the backend proxy first.
  - If backend endpoints are unavailable in local dev, the existing client-side mock/provider fallback continues to work.
  