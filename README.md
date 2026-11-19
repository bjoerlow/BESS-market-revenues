# BESS Market Revenues

A React application for analyzing and visualizing BESS (Battery Energy Storage System) market revenues and trends.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bjoerlow/BESS-market-revenues.git
cd BESS-market-revenues
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

Start the development server:
```bash
npm start
```

The application will automatically open in your browser at `http://localhost:3000`. The page will reload when you make changes.

### Building for Production

Build the application for production:
```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

### Testing

Run tests in interactive watch mode:
```bash
npm test
```

## Project Structure

```
BESS-market-revenues/
├── public/
│   └── index.html
├── src/
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── package.json
└── README.md
```

## Features

- React-based user interface
- Responsive design
- Hot module reloading during development

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please open an issue on GitHub.

## Ditt batteri 2026 — rapport som PDF via e-post

Fliken **Ditt batteri 2026** visar vad kundens batteri (zon, MW, MWh) hade tjänat
under 2026. Kunden kan få resultatet som PDF till sin e-post efter inloggning med
magic link — samma Supabase-projekt som BESS Simulation. Utan inställningarna nedan
fungerar fliken som vanligt, men utskicket döljs.

**1. Vercel → detta projekt → Settings → Environment Variables**

| Key | Value |
|---|---|
| `REACT_APP_SB_URL` | samma som i BESS Simulation |
| `REACT_APP_SB_KEY` | samma anon-nyckel som i BESS Simulation |
| `RESEND_API_KEY` | resend.com → API Keys |
| `REPORT_FROM` | `GreenVoltis <rapport@greenvoltis.com>` (domänen måste vara verifierad i Resend) |
| `LEAD_EMAIL` | valfri; vem som får leadaviseringen (standard: samma adress som BESS Simulations admin) |
| `REACT_APP_BESS_SIM_URL` | valfri; adressen till BESS Simulation, visas som länk under resultatet |

**2. Supabase → Authentication → URL Configuration → Redirect URLs**

Lägg till Revenue Intelligence-adressen, t.ex. `https://<detta-projekt>.vercel.app/**`.
Annars skickar magic linken tillbaka användaren till BESS Simulation.

**3. Resend → Domains** — verifiera avsändardomänen (DNS-poster).

Deploya om efter att variablerna är satta. `GET /api/send-report` svarar
`{"enabled": true}` när allt är på plats.

Beräkningen finns i `src/backtest.mjs` och används både av sidan och av
`api/send-report.mjs`. Servern räknar om siffrorna från zon, MW och MWh och tar
mottagaradressen från inloggningen — aldrig från anropet.
