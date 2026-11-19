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

**1. EmailJS** (samma konto och e-posttjänst som BESS Simulation, ingen egen domän behövs)

- *Account → Security*: slå på **Allow EmailJS API for non-browser applications**
  och **Use Private Key**.
- *Account → API keys*: kopiera **Private Key**.
- *Email Templates → Create New Template*, döp den till "Revenue Intelligence rapport":
  - **To Email** `{{to_email}}` · **Reply To** `{{reply_to}}` · **From Name** `GreenVoltis`
  - **Subject** `{{subject}}`
  - **Content**: växla till kodläge och skriv `{{{message_html}}}` (tre klamrar)
  - fliken **Attachments** → *Add Attachment* → **Variable Attachment**:
    Parameter name `report_pdf`, Filename `{{filename}}`, Content type PDF
  - spara och kopiera **Template ID**.

**2. Vercel → detta projekt → Settings → Environment Variables**

| Key | Value |
|---|---|
| `REACT_APP_SB_URL` | Supabase → Project Settings → API → Project URL |
| `REACT_APP_SB_KEY` | Supabase → Project Settings → API → anon public key |
| `EMAILJS_TEMPLATE_ID` | mallens Template ID |
| `EMAILJS_PRIVATE_KEY` | EmailJS Private Key |
| `LEAD_EMAIL` | valfri; vem som får leadaviseringen (standard: samma adress som BESS Simulations admin) |
| `REACT_APP_BESS_SIM_URL` | valfri; adressen till BESS Simulation, visas som länk under resultatet |

Tjänst-ID och publik nyckel är desamma som i BESS Simulation och är förinställda
(`EMAILJS_SERVICE_ID`, `EMAILJS_PUBLIC_KEY` för att byta).

**3. Supabase → Authentication → URL Configuration → Redirect URLs**

Lägg till Revenue Intelligence-adressen, t.ex. `https://<detta-projekt>.vercel.app/**`.
Annars skickar magic linken tillbaka användaren till BESS Simulation.

Deploya om efter att variablerna är satta. `GET /api/send-report` svarar
`{"enabled": true}` när allt är på plats.

Beräkningen finns i `src/backtest.mjs` och används både av sidan och av
`api/send-report.mjs`. Servern räknar om siffrorna från zon, MW och MWh och tar
mottagaradressen från inloggningen — aldrig från anropet.
