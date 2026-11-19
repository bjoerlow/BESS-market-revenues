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

## Ditt batteri 2026 — PDF för nedladdning och leadavisering

Fliken **Ditt batteri 2026** visar vad kundens batteri (zon, MW, MWh) hade tjänat
under 2026. Efter inloggning med magic link (samma Supabase-projekt som BESS
Simulation) kan kunden ladda ner resultatet som PDF. Varje nedladdning ger ett
leadmejl via EmailJS till GreenVoltis med kundens verifierade e-post, systemet
och en länk till samma vy. Utan Supabase-värdena döljs rutan; utan EmailJS-värdena
fungerar nedladdningen men leadet hamnar bara i Vercels funktionslogg (`ri-lead`).

**1. EmailJS** (samma konto och tjänst som BESS Simulation; gratisnivån räcker — ingen bilaga)

- *Account → Security*: bocka i **Allow EmailJS API for non-browser applications**.
  Bocka INTE i "Use Private Key" — då slutar BESS Simulation att fungera.
- *Account → General*: kopiera **Private Key**.
- *Email Templates → Create New Template*:
  - **Subject** `{{subject}}`
  - **Content**: Edit Content → kodläge → ersätt allt med `{{{message_html}}}` (tre klamrar)
  - **To Email** `{{to_email}}` · **From Name** `GreenVoltis Revenue Intelligence` · **Reply To** `{{reply_to}}`
    · From Email: behåll "Use Default Email Address"
  - **Auto-Reply**: av. **Attachments**: inget.
  - *Settings*: Name "Revenue Intelligence lead", spara, kopiera **Template ID**.

**2. Vercel → detta projekt → Settings → Environment Variables**

| Key | Value | Type |
|---|---|---|
| `REACT_APP_SB_URL` | Supabase → Project Settings → Data API → Project URL | Config |
| `REACT_APP_SB_KEY` | Supabase → Project Settings → API Keys → publishable key (`sb_publishable_…`) | Config |
| `EMAILJS_TEMPLATE_ID` | mallens Template ID | Secret |
| `EMAILJS_PRIVATE_KEY` | EmailJS Private Key | Secret |
| `LEAD_EMAIL` | valfri; mottagare av leadmejlet (standard patrik.bjorklund@greenvoltis.com) | Secret |
| `REACT_APP_BESS_SIM_URL` | valfri; länk till BESS Simulation under resultatet | Config |

`REACT_APP_`-variabler byggs in i sidan och måste vara Config. Tjänst-ID och publik
nyckel för EmailJS är förinställda till BESS Simulations (`EMAILJS_SERVICE_ID`,
`EMAILJS_PUBLIC_KEY` för att byta).

**3. Supabase → SQL Editor** — kör `supabase/ri_projects.sql` en gång. Den skapar
tabellen `ri_projects` (sparade projekt per användare, skyddad med row level
security). Namn, telefon och företag sparas i användarens profil
(`user_metadata`: `full_name`, `phone_number`, `company`) och krävs innan PDF:en
lämnas ut.

**4. Supabase → Authentication → Emails → Magic Link** — klistra in
`supabase/magic-link.html` som mall, ämne `Din inloggningslänk till GreenVoltis`.
Mallen delas med BESS Simulation (samma Supabase-projekt).

**5. Supabase → Authentication → URL Configuration → Redirect URLs**

Lägg till Revenue Intelligence-adressen, t.ex. `https://<detta-projekt>.vercel.app/**`.

Deploya om efter att variablerna är satta. `GET /api/report` svarar
`{"enabled": true}` när Supabase är på plats.

Beräkningen finns i `src/backtest.mjs` och används både av sidan och av
`api/report.mjs`. Servern räknar om siffrorna från zon, MW och MWh och tar
mottagaradressen från inloggningen — aldrig från anropet.
