# ✍️ DocSign — Document Signature App
A secure, full-stack web application where users can upload PDFs, place digital signatures, and generate legally traceable signed documents — built with modern enterprise-grade technologies.
---

# ✨ Features

🔐 Secure Authentication
User registration and login
JWT-based authentication with HTTP-only cookies
Secure route protection and session management

# 📄 Document Management

Upload documents and images securely
Cloud storage integration via Cloudinary
View and manage previously uploaded documents

# 🖋️ Digital Signatures

Apply digital signatures to documents
Store signature history and metadata securely

# 📱 Modern UI/UX

Fully responsive design for desktop and mobile
Seamless API communication via Axios with interceptors
Built with a lightning-fast Vite + React development environment

---

# 🛠 Tech StackLayer

Layer,            Technology
Frontend-     "React, TypeScript, Vite"
Backend-     "Node.js, Express.js, TypeScript"
Database-     "PostgreSQL"
Auth-       JSON Web Tokens (JWT) & Cookies
Storage-      Cloudinary
Deployment-   Vercel (Frontend) & Railway (Backend)

---

# 📁 Project Structure

doc-signature-app/
├── client/                     # Frontend React Application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── lib/
│   │   │   └── axios.ts        # Axios instance with interceptors
│   │   ├── pages/              # Main route pages (Login, Register, Dashboard)
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # React entry point
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Backend Express Application
│   ├── src/
│   │   ├── controllers/        # Route logic (auth, docs, signatures)
│   │   ├── middleware/         # Custom middleware (errorHandler, auth)
│   │   ├── routes/             # API route definitions
│   │   └── index.ts            # Server entry point & CORS config
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
└── README.md

---

🗄 Database Schema

| Table | Key Fields |
|-------|-----------|
| `User` | id, name, email, password (hashed) |
| `Document` | id, filename, fileUrl, publicId, status, ownerId |
| `Signature` | id, x, y, page, width, height, imageData, status, documentId |
| `AuditLog` | id, action, ipAddress, userAgent, metadata, documentId |

**Document Status:** `PENDING` → `SIGNED` → `EXPIRED`

**Signature Status:** `PLACED` → `SIGNED`

**Audit Actions:** `DOCUMENT_UPLOADED` · `DOCUMENT_VIEWED` · `SIGNATURE_PLACED` · `DOCUMENT_SIGNED` · `DOCUMENT_SHARED`

---

## 🔌 API Endpoints

### Auth — `/api/auth`
| Method | Route | Description | Protected |
|--------|-------|-------------|-----------|
| POST | `/register` | Create new account | No |
| POST | `/login` | Login + get tokens | No |
| POST | `/refresh` | Refresh access token | No |
| POST | `/logout` | Clear refresh cookie | No |

### Documents — `/api/docs`
| Method | Route | Description | Protected |
|--------|-------|-------------|-----------|
| POST | `/upload` | Upload a PDF | Yes |
| GET | `/` | List user's documents | Yes |
| GET | `/:id` | Get single document | Yes |
| DELETE | `/:id` | Delete document | Yes |

### Signatures — `/api/signatures`
| Method | Route | Description | Protected |
|--------|-------|-------------|-----------|
| POST | `/` | Save signature position | Yes |
| GET | `/:docId` | Get document signatures | Yes |
| PATCH | `/:id` | Update position (drag) | Yes |
| DELETE | `/:id` | Remove signature | Yes |
| POST | `/finalize/:docId` | Embed + export signed PDF | Yes |

---

## 🚢 Deployment

### Backend — Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `doc-signature-app` repo
3. Set **Root Directory** to `server`
4. Set **Build Command** to `npm run build`
5. Set **Start Command** to `npm start`
6. Add all environment variables from `server/.env`
7. Railway generates a public URL automatically

### Frontend — Vercel
1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the `doc-signature-app` repo
3. Set **Root Directory** to `client`
4. Set **Build Command** to `npm run build`
5. Set **Output Directory** to `dist`
6. Add environment variable:
   - `VITE_API_URL` = `https://your-railway-url.up.railway.app/api`
7. Click Deploy ✅

## 🔄 How It Works

```
1. User registers / logs in
          ↓
2. JWT access token → localStorage
   Refresh token → httpOnly cookie
          ↓
3. User uploads a PDF
          ↓
4. Multer receives → Cloudinary stores → URL saved in PostgreSQL
          ↓
5. User opens document → react-pdf renders PDF in browser
          ↓
6. User draws signature on canvas → base64 image captured
          ↓
7. User clicks PDF → signature box placed at x, y coordinates
          ↓
8. User drags box to exact position → coordinates updated in DB
          ↓
9. User clicks "Finalize and Sign"
          ↓
10. Backend downloads PDF → pdf-lib embeds signature image
    Signed PDF uploaded to Cloudinary
    Document status updated to SIGNED
          ↓
11. User downloads final signed PDF ✅
```

---

## 👩‍💻 Author

**Shruti**

- GitHub: [@Shrutii2035](https://github.com/Shrutii2035)
- LinkedIn: [Shruti](https://linkedin.com/in/shruti)

---

## 📄 License

This project is open source and available under the ISC License.
