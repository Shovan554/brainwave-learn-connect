
# BrainWave — Educational Social Platform MVP

## Overview
BrainWave is a dashboard-focused learning management platform with AI-powered study tools. Built on React + Supabase (Postgres, Auth, Storage, Edge Functions). Data-dense, productivity-oriented UI with cards and metrics.

---

## Phase 1: Foundation & Auth

### Database Setup (Supabase)
- **profiles** table (user_id, name, bio, major, avatar_url) linked to auth.users
- **user_roles** table with enum (teacher, student) — separate from profiles for security
- Role-based RLS policies across all tables

### Authentication Pages
- `/login` — email/password sign-in
- `/register` — email/password sign-up with role selection (Teacher or Student)
- Protected routes: teacher routes only for teachers, student routes only for students
- Auto-redirect based on role after login

---

## Phase 2: Teacher Portal

### Teacher Dashboard (`/teacher/dashboard`)
- Overview cards: total courses, total students, pending reports
- List of teacher's courses with quick stats

### Create Course (`/teacher/courses/new`)
- Form: title, term, description
- Auto-generates unique invite code on creation

### Course Detail (`/teacher/courses/:id`) — Tabbed Interface
- **Syllabus Tab**: Upload PDF/DOC files to Supabase Storage, list uploaded files
- **Weekly Content Tab**: Add/edit weeks (week number, title, description, attachments/links), publish/unpublish toggle
- **Assignments Tab**: Create assignments (title, description, due date, points, weight, estimated time), publish/unpublish, attach files/links
- **Students Tab**: View enrolled students list with links to their profiles
- **AI Tools Tab**: Teacher AI copilot (suggest syllabus updates, draft quiz questions per module)
- **Reports Tab**: View content reports submitted by students

### Database Tables
- courses, course_files, weekly_content, weekly_content_assets, assignments, assignment_assets, enrollments, content_reports

---

## Phase 3: Student Portal

### Student Dashboard (`/student/dashboard`)
- **My Work** section: aggregated upcoming assignments across all courses, auto-prioritized by (weight × urgency ÷ estimated time) score
- "What to do next" priority queue with color-coded urgency indicators
- **My Courses** list with enrollment status and quick access

### Join Course
- Enter invite code modal/form to enroll in a course

### Course Detail (`/student/courses/:id`) — Tabbed Interface
- **Overview Tab**: Course info, syllabus files download
- **Weekly Content Tab**: Browse published weeks, view content details and attached resources
- **Assignments Tab**: View published assignments with due dates, points, and details
- **AI Copilot Tab**: Course-specific AI assistant (see Phase 5)
- **Reels Tab**: Placeholder — "Microlearning Reels coming soon" empty state
- **Students Tab**: View classmates with links to their portfolio profiles

---

## Phase 4: Project Portfolios

### Student Profile (`/student/profile`)
- Edit name, bio, major
- Add/edit/delete portfolio projects (title, description, GitHub URL, tech stack tags)

### Public Profile View (`/students/:studentId/profile`)
- Read-only view of student's profile and project portfolio
- Accessible by teachers and other students

### Database Tables
- project_portfolios (student_id, title, description, github_url, tech_stack)

---

## Phase 5: AI Copilot

### Backend (Supabase Edge Functions)
- Edge function that receives course_id + user query
- Fetches relevant course content from DB (syllabus file text, weekly content, assignments)
- Extracts text from uploaded PDFs/DOCs for context
- Sends combined context + user query to Lovable AI (Gemini Flash) via context-window approach
- Enforces per-course data isolation — never leaks content from other courses
- Refuses to complete assignments; provides outlines and guidance instead
- Cites source files/modules in responses

### Student AI Features (in course AI Copilot tab)
- Generate study notes for a selected week
- Key points before lecture for a module
- Q&A: explain concepts from course material
- Generate practice quiz for a module
- Chat history stored per course per student

### Teacher AI Features (in course AI Tools tab)
- Suggest syllabus improvements based on course content
- Draft quiz questions aligned to specific modules
- Chat history stored per course per teacher

### Database Tables
- ai_chats (course_id, user_id, role, message, created_at)

---

## Phase 6: Content Reporting & Safety

### Report Mechanism
- "Report" button on weekly content items and assignments
- Dropdown with reason categories (inappropriate, incorrect, offensive, other)
- Reports stored in content_reports table

### Teacher Report View
- Reports tab in course detail shows all submitted reports
- Basic report details: who reported, what content, reason, timestamp

---

## Phase 7: Placeholders & Polish

### Placeholder Pages
- Microlearning Reels: empty state with illustration and "Coming soon" message
- Future features referenced in navigation but clearly marked as upcoming

### Demo Seed Data
- 1 teacher account, 1 student account
- 1 course with syllabus
- 2 weeks of content with attachments
- 2 assignments with varying due dates and weights

### Design System
- Dashboard-focused, data-dense layout
- Card-based UI with metrics, progress indicators, and priority badges
- Clean navigation with role-appropriate sidebars
- Responsive but desktop-optimized for productivity
