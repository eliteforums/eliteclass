# EliteClass - AI-Powered Institute Management Platform

[![GitHub](https://img.shields.io/badge/GitHub-eliteforums/eliteclass-blue?logo=github)](https://github.com/eliteforums/eliteclass)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![Vite](https://img.shields.io/badge/Vite-7.3-646cff?logo=vite)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 📋 Overview

**EliteClass** is a comprehensive, AI-powered **Institute Management Platform** designed for coaching institutes, schools, and academies. It unifies ERP, LMS, CRM, and AI automation into a single, powerful solution.

Whether you're managing student enrollments, tracking attendance, conducting secure online exams, organizing course content, or automating communication with parents—EliteClass handles it all with enterprise-grade security and scalability.

### 🎯 Who It's For

- **Coaching Institutes** – Manage batches, courses, exams, and student progress
- **Schools & Academies** – Student records, attendance, fees, and communications
- **Educational Centers** – Hybrid learning with LMS capabilities, scheduling, and analytics
- **Institutes with Growth** – Scales from 100 to 10,000+ students with multi-role support

---

## ✨ Key Features

### 🎓 Academic Management
| Feature | Details |
|---------|---------|
| **Student Management** | Enrollment, profiles, batch assignments, lifecycle tracking (admit/active/inactive/pass-out) |
| **Course Management** | Curriculum design, lesson organization, multimedia content, course structure |
| **Batch Management** | Cohort creation, batch-specific settings, student grouping |
| **Attendance** | Daily/session-based tracking for students and staff, batch scoping |
| **Study Logs** | Track student learning activity and engagement |

### 📚 Learning & Exams
| Feature | Details |
|---------|---------|
| **LMS (Learning Management System)** | Course enrollment, lesson progress, assignments, quiz attempts |
| **Exam Management** | Scheduling, MCQ player, answer key evaluation, result publishing |
| **Advanced Exam Security** | Browser fingerprinting, fullscreen enforcement, tab-switch detection, violation tracking |
| **Assignment System** | Task creation, file submissions, grading, feedback |
| **Progress Tracking** | Student performance analytics, course completion rates |

### 💼 Administrative
| Feature | Details |
|---------|---------|
| **Staff Management** | Hiring, role assignment, batch/course allocation, credentials generation |
| **Fee Management** | Billing structure, payment tracking, receipt generation, transaction history |
| **Schedule Management** | Class timetables, resource scheduling, session planning |
| **Parent Portal** | Student performance visibility, fee status, communication access |
| **Teacher-Student Mapping** | Track teacher-student relationships and classroom assignments |

### 📊 Analytics & Insights
| Feature | Details |
|---------|---------|
| **Dashboard Analytics** | Real-time insights on attendance, fee collection, exam performance |
| **Performance Reports** | Individual student analytics, batch-level trends, institutional metrics |
| **Export Capabilities** | PDF receipts, Excel reports, credential certificates |

### 🤖 AI Features
| Feature | Details |
|---------|---------|
| **PDF to MCQ Generator** | Upload PDF → AI extracts/generates MCQ questions with review workflow |
| **Notes Summarization** | Summarize content into bullet points, paragraphs, or flashcards |
| **AI Student Remarks** | Auto-generate personalized performance feedback for report cards |
| **Exam Analytics** | AI-powered insights on exam results with recommendations |
| **Communication Drafts** | AI-drafted fee reminders, announcements, and parent updates |
| **Lesson Plan Generator** | Create structured lesson plans from topic/duration/level |
| **Assignment Feedback** | Constructive AI feedback on student submissions |
| **Study Tips** | Personalized study recommendations based on weak areas |
| **Course Descriptions** | Generate compelling course descriptions from basic details |
| **Doubt Solver** | Answer student academic questions with clear explanations |
| **AI Chat Assistant** | Context-aware conversational support (Groq API) |

### 🔒 Security & Multi-Tenancy
| Feature | Details |
|---------|---------|
| **Role-Based Access Control** | Admin, Staff, Students, Parents, Super-Admin with granular permissions |
| **Row-Level Security (RLS)** | Database-level isolation for multi-tenant data protection |
| **Authentication** | Supabase Auth with email verification, password management |
| **Exam Proctoring** | Browser monitoring, device tracking, anti-cheating mechanisms |

### 📱 Modern UX
| Feature | Details |
|---------|---------|
| **Progressive Web App (PWA)** | Installable app, offline support via service workers |
| **Responsive Design** | Mobile-first, works on desktop, tablet, phone |
| **Dark Mode** | Theme toggle for user preference |
| **Real-Time Updates** | Supabase subscriptions for live notifications |

---

## 🛠️ Technology Stack

### Frontend
```
React 19.2.0 + TypeScript
TanStack Router 1.168 (routing)
TanStack Start 1.167 (SSR)
TanStack Query 5.83 (data fetching/caching)
Tailwind CSS 4.2 (styling)
Radix UI (accessible components)
Framer Motion (animations)
Zustand 5.0 (state management)
React Hook Form + Zod (forms & validation)
```

### Backend
```
Nitro 3.0 (edge runtime)
Cloudflare Workers (deployment)
Supabase 2.105 (PostgreSQL + Auth + Real-time)
Vite 7.3.1 (build tool)
```

### Data & Utilities
```
Recharts (data visualization)
ExcelJS + jsPDF (exports)
Papa Parse (CSV parsing)
date-fns 4.1 (date manipulation)
Lucide React (icons)
Sonner (toast notifications)
```

### Development
```
ESLint (code quality)
TypeScript 5.x (type safety)
Pnpm (package management)
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ or **Bun** 1.0+
- **pnpm** 9+ (recommended) or npm/yarn
- **Supabase** project (free tier available at [supabase.com](https://supabase.com))
- **Git** for version control

### 1. Clone the Repository

```bash
git clone https://github.com/eliteforums/eliteclass.git
cd eliteclass
```

### 2. Install Dependencies

```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Groq AI (for AI features)
VITE_GROQ_API_KEY=your-groq-api-key

# Optional: Other services
VITE_API_BASE_URL=http://localhost:3000
```

**Get your Supabase credentials:**
1. Create a project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy `URL` and `anon` key
4. Add them to `.env.local`

### 4. Set Up Database

```bash
# Using the migration script
cd scripts
node run_migration.js

# Or follow manual steps in supabase/README.md
```

For detailed database setup, see [supabase/README.md](supabase/README.md)

### 5. Start Development Server

```bash
# Using pnpm
pnpm run dev

# Using npm
npm run dev

# Using Bun
bun run dev
```

The app will be available at `http://localhost:5173`

---

## 📁 Project Structure

```
eliteclass/
│
├── src/
│   ├── components/           # Reusable React components
│   │   ├── auth/             # Auth-related components
│   │   ├── dashboard/        # Dashboard layouts & sections
│   │   ├── ui/               # Base UI components
│   │   ├── landing/          # Landing page components
│   │   ├── pwa/              # PWA-related components
│   │   └── assignments/      # Assignment components
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useAuth.ts        # Authentication context
│   │   ├── useBatchMessages.ts
│   │   ├── useGroqChat.ts    # AI chat integration
│   │   └── useStudents.ts
│   │
│   ├── lib/                  # Utility libraries
│   │   ├── supabase.ts       # Supabase client setup
│   │   ├── error-capture.ts  # Error handling
│   │   ├── cache-service.ts  # Caching logic
│   │   ├── auth-serializer.ts
│   │   └── sw-register.ts    # Service worker
│   │
│   ├── modules/              # Feature modules (organized by domain)
│   │   ├── students/         # Student management
│   │   ├── staff/            # Staff management
│   │   ├── courses/          # Course LMS
│   │   ├── exams/            # Exam system
│   │   ├── attendance/       # Attendance tracking
│   │   ├── fees/             # Fee billing
│   │   ├── batches/          # Batch management
│   │   ├── parents/          # Parent portal
│   │   ├── schedule/         # Timetable & scheduling
│   │   ├── analytics/        # Dashboards & insights
│   │   └── [other modules]/
│   │
│   ├── routes/               # TanStack Router routes
│   │   ├── __root.tsx        # Root layout
│   │   ├── index.tsx         # Home page
│   │   ├── dashboard.tsx     # Dashboard layout
│   │   ├── auth/             # Auth routes
│   │   └── dashboard/        # Feature routes
│   │
│   ├── services/             # API service layer
│   │   ├── student.service.ts
│   │   ├── course.service.ts
│   │   ├── exam.service.ts
│   │   └── [other services]/
│   │
│   ├── store/                # Zustand state stores
│   │   ├── authStore.ts
│   │   ├── instituteStore.ts
│   │   └── [other stores]/
│   │
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Helper functions
│   ├── assets/               # Static files
│   │
│   ├── router.tsx            # Router setup
│   ├── start.ts              # Server initialization
│   ├── server.ts             # SSR entry point
│   ├── sw.ts                 # Service worker
│   └── styles.css            # Global styles
│
├── supabase/
│   ├── setup.sql             # Initial schema
│   ├── migrations/           # Numbered migration files
│   ├── functions/            # PostgreSQL functions
│   └── README.md             # DB setup guide
│
├── scripts/
│   ├── run_migration.js      # Database migration runner
│   └── README.md
│
├── public/                   # Static assets (PWA icons, manifest)
├── vite.config.ts           # Vite configuration
├── wrangler.jsonc           # Cloudflare Workers config
├── tsconfig.json            # TypeScript config
├── eslint.config.js         # ESLint rules
└── package.json             # Dependencies
```

---

## 🔧 Configuration

### Database Setup

EliteClass uses **Supabase** (PostgreSQL) for the backend. Database setup is automated via migration scripts.

**Steps:**
1. Create a Supabase project
2. Add credentials to `.env.local`
3. Run migration script: `cd scripts && node run_migration.js`
4. Or manually execute `supabase/setup.sql` in Supabase SQL editor

See [supabase/README.md](supabase/README.md) for detailed instructions.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only, never exposed to client) |
| `VITE_GROQ_API_KEY` | ❌ | Groq API key for AI features |
| `VITE_API_BASE_URL` | ❌ | API base URL (defaults to current origin) |

### PWA Configuration

EliteClass is a Progressive Web App with offline support:

- **Web manifest**: `public/manifest.webmanifest`
- **Service worker**: `src/sw.ts`
- **Icons**: `public/icons/` (192x192, 512x512, maskable)
- **Configuration**: `vite.config.ts` (PWA plugin settings)

Install the app on mobile/desktop for offline access.

### Security

**Row-Level Security (RLS) Policies:**
- All data is scoped to the user's institution
- Students see only their data
- Teachers see their batch/course data
- Admins have appropriate permissions

See `supabase/` directory for RLS policy implementations.

---

## 🚀 Deployment

### Cloudflare Workers

EliteClass is optimized for **Cloudflare Workers**:

```bash
# Deploy to Cloudflare
pnpm run deploy

# Or using wrangler directly
wrangler deploy
```

Configuration in `wrangler.jsonc`

### Docker (Coming Soon)

Dockerfile and docker-compose setup for self-hosted deployments.

### Vercel

Can also be deployed to **Vercel** with minor configuration changes:

```bash
# Build
pnpm run build

# Deploy (using Vercel CLI)
vercel deploy
```

---

## 💻 Development

### Available Scripts

```bash
# Start development server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview

# Run linting
pnpm run lint

# Run type checking
pnpm run type-check

# Deploy to Cloudflare Workers
pnpm run deploy

# Generate route tree (TanStack Router)
pnpm run route:gen
```

### Architecture Patterns

**Service Layer:**
- All API calls go through dedicated service files (`src/services/`)
- Services use Supabase client for database queries
- Proper error handling and type safety

**State Management:**
- Zustand stores for global state (`src/store/`)
- TanStack Query for server state caching
- React Context for auth and theme

**Component Organization:**
- Feature modules self-contained (`src/modules/`)
- Reusable UI components in `src/components/ui/`
- Domain-specific components co-located with modules

**Type Safety:**
- Full TypeScript coverage
- Zod schemas for runtime validation
- Auto-generated types from database (via Supabase)

### Module Pattern

Each major feature follows this structure:

```
modules/{feature}/
├── components/      # Feature-specific components
├── hooks/          # Feature-specific hooks (useStudents, useCourses, etc.)
├── services/       # API service (student.service.ts)
├── validations/    # Zod schemas
├── utils/          # Helper functions
└── types/          # TypeScript interfaces
```

Example: Student Module
```
modules/students/
├── components/AdmissionForm.tsx
├── components/StudentTable.tsx
├── hooks/useStudents.ts
├── services/student.service.ts
├── validations/index.ts
└── types/index.ts
```

### Debugging

**Error Capture:**
- Automatic error tracking in `src/lib/error-capture.ts`
- Errors displayed via error pages or toast notifications
- Check browser console for detailed error info

**Service Worker Issues:**
- Clear cache: DevTools → Application → Clear Storage
- Disable SW: DevTools → Network tab → "Offline" toggle

---

## 🔐 Security Features

### Exam Proctoring
- **Browser fingerprinting**: Detects device changes
- **Fullscreen enforcement**: Prevents switching windows
- **Tab-switch detection**: Tracks focus changes
- **Violation tracking**: Records all suspicious activity
- **Auto-submit**: Automatically ends exam on violations
- **Server-side validation**: Prevents timing manipulation

See [src/modules/exams/SECURITY_IMPLEMENTATION.md](src/modules/exams/SECURITY_IMPLEMENTATION.md) for technical details.

### Data Protection
- **Row-Level Security**: Database-level multi-tenant isolation
- **Auth verification**: Supabase JWT validation
- **HTTPS only**: Secure data in transit
- **Password hashing**: Supabase handles securely

---

## 🤝 Contributing

We welcome contributions! Here's how to get involved:

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make changes** following the code patterns
4. **Test thoroughly** before submitting
5. **Submit a Pull Request** with clear description

### Code Standards
- Use TypeScript (strict mode)
- Follow the existing folder structure
- Use Zod for validation schemas
- Add proper error handling
- Write clean, readable code

### Reporting Issues
Create an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if applicable
- Environment details (OS, browser, Node version)

---

## 📝 Documentation

- **Database**: See [supabase/README.md](supabase/README.md) for schema and migrations
- **Scripts**: See [scripts/README.md](scripts/README.md) for setup scripts
- **Exam Security**: See [src/modules/exams/SECURITY_IMPLEMENTATION.md](src/modules/exams/SECURITY_IMPLEMENTATION.md)
- **API Reference**: See [src/modules/exams/QUICK_REFERENCE.md](src/modules/exams/QUICK_REFERENCE.md)

---

## 📊 Project Stats

- **Total Files**: 300+
- **Components**: 100+
- **Services**: 20+
- **Modules**: 15+
- **TypeScript Coverage**: 95%+
- **Lines of Code**: 15,000+

---

## 🐛 Known Issues & Troubleshooting

### Issue: Supabase connection fails
**Solution**: Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`

### Issue: Service worker not working
**Solution**: 
- Clear browser cache
- Ensure HTTPS in production
- Check DevTools → Application → Service Workers

### Issue: Database migrations fail
**Solution**: 
- Ensure PostgreSQL version is 12+
- Check Supabase connection
- Run migrations one by one if batch fails

### Issue: Build fails with TypeScript errors
**Solution**: 
- Run `pnpm run type-check` to see all errors
- Ensure all dependencies are installed
- Check Node version (18+ required)

---

## 📞 Support

- **Issues**: Open an issue on [GitHub](https://github.com/eliteforums/eliteclass/issues)
- **Discussions**: Use [GitHub Discussions](https://github.com/eliteforums/eliteclass/discussions)
- **Email**: Contact through the repository

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with modern web technologies:
- [React](https://react.dev) & [TanStack](https://tanstack.com)
- [Supabase](https://supabase.com) for the database
- [Tailwind CSS](https://tailwindcss.com) & [Radix UI](https://www.radix-ui.com)
- [TypeScript](https://www.typescriptlang.org) for type safety
- Community contributors and feedback

---

## 🎯 Roadmap

Planned features and improvements:

- [ ] Multi-language support (Hindi, Marathi, Tamil, Telugu + more)
- [ ] Advanced AI analytics (predictive student performance, dropout risk scoring, revenue forecasting)
- [ ] Enhanced reporting dashboards (custom report builder, scheduled exports, visual charts)
- [ ] Mobile app (React Native)
- [ ] Payment gateway integration (Razorpay/Stripe)
- [ ] SMS/WhatsApp notifications
- [ ] Video conferencing integration
- [ ] Mobile app for teachers

---

## 📈 Recent Updates

- ✅ AI-powered PDF to MCQ generator (upload PDF → AI generates questions)
- ✅ 9 AI features: notes summarization, study tips, lesson plans, doubt solver, remarks, exam analytics, communication drafts, assignment feedback, course descriptions
- ✅ Bulk certificate generator with Elite Forums template (PDF generation)
- ✅ Student onboarding guard (mandatory profile completion)
- ✅ Batch join requests (student self-service with admin approval)
- ✅ Exam proctoring (camera/mic, tab detection, deterrent UI)
- ✅ Settings page (profile, password, institute management)
- ✅ Real-time AI insights dashboard (live data, no dummy content)
- ✅ Tab-switch page refresh fix (no more false logouts)
- ✅ Rate-limit-proof bulk student import (277+ students)
- ✅ PWA offline support
- ✅ Parent portal with student tracking

---

**Made with ❤️ by the EliteClass Team**

For the latest updates, star ⭐ the repository and follow us on GitHub!
